// The login throttle must live in D1, not in the isolate.
//
// It used to be an in-memory `Map` inside src/middleware.ts, which a
// Cloudflare isolate resets on deploy and duplicates per colo — so the
// brute-force protection the middleware appeared to provide was largely
// fiction. These tests pin the shared-table behaviour.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getClientKey,
  getRateLimitHeaders,
  MAX_LOGIN_ATTEMPTS,
  MAX_PASSWORD_CHANGE_ATTEMPTS
} from '../../src/server/rateLimit';
import { FakeD1 } from '../helpers/fakeD1';

const IP = '203.0.113.7';

function loginRequest(ip = IP): Request {
  return new Request('http://localhost/api/auth/login', {
    headers: { 'cf-connecting-ip': ip }
  });
}

describe('checkRateLimit', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = FakeD1.empty();
  });

  it('@spec:AC-005 allows the first MAX_LOGIN_ATTEMPTS attempts, then blocks', async () => {
    const key = getClientKey(loginRequest(), 'login');
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      const result = await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
      expect(result.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('counts a stricter budget for password changes', async () => {
    const key = getClientKey(loginRequest(), 'change-password');
    for (let i = 0; i < MAX_PASSWORD_CHANGE_ATTEMPTS; i += 1) {
      expect((await checkRateLimit(db, key, MAX_PASSWORD_CHANGE_ATTEMPTS)).allowed)
        .toBe(true);
    }
    expect((await checkRateLimit(db, key, MAX_PASSWORD_CHANGE_ATTEMPTS)).allowed)
      .toBe(false);
  });

  it('keeps the counter in D1 so a fresh handle still sees it', async () => {
    // The regression: with an in-memory Map, re-reading through a new
    // reference (as a new isolate / new worker would) started from zero and
    // the throttle never engaged.
    const key = getClientKey(loginRequest(), 'login');
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    }
    expect(db.rows('rate_limits')).toHaveLength(1);
    expect((await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS)).allowed).toBe(false);
  });

  it('counts each client separately', async () => {
    const first = getClientKey(loginRequest('198.51.100.1'), 'login');
    const second = getClientKey(loginRequest('198.51.100.2'), 'login');
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await checkRateLimit(db, first, MAX_LOGIN_ATTEMPTS);
    }
    expect((await checkRateLimit(db, first, MAX_LOGIN_ATTEMPTS)).allowed).toBe(false);
    expect((await checkRateLimit(db, second, MAX_LOGIN_ATTEMPTS)).allowed).toBe(true);
  });

  it('@spec:AC-007 stays blocked inside the window and recovers after it expires', async () => {
    // The regression: an elapsed window was still counted, because the
    // cleanup deleted at `now - windowMs` and nothing re-checked `resetAt`.
    // A blocked client therefore stayed locked out for roughly twice the
    // configured window.
    const key = getClientKey(loginRequest('198.51.100.9'), 'login');
    const window = 200;
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(db, key, 3, window)).allowed).toBe(true);
    }
    expect((await checkRateLimit(db, key, 3, window)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, window + 50));
    expect((await checkRateLimit(db, key, 3, window)).allowed).toBe(true);
  });

  it('@spec:AC-006 blocks with 429 and retryAfter after exceeding the limit', async () => {
    const key = getClientKey(loginRequest(), 'login');
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    }
    const result = await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('still blocks on the default window, which is long', async () => {
    const key = getClientKey(loginRequest(), 'login');
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    }
    expect((await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS)).allowed).toBe(false);
  });

  it('reports remaining budget and reset for the headers', async () => {
    const key = getClientKey(loginRequest(), 'login');
    await checkRateLimit(db, key, MAX_LOGIN_ATTEMPTS);
    const headers = await getRateLimitHeaders(key, MAX_LOGIN_ATTEMPTS, db);

    expect(headers['X-RateLimit-Limit']).toBe(String(MAX_LOGIN_ATTEMPTS));
    expect(headers['X-RateLimit-Remaining']).toBe(
      String(MAX_LOGIN_ATTEMPTS - 1)
    );
    expect(Number(headers['X-RateLimit-Reset'])).toBeGreaterThan(0);
  });
});

describe('getClientKey', () => {
  it('@spec:AC-008 keys on the connecting IP and the action suffix', () => {
    expect(getClientKey(loginRequest(), 'login')).toBe(`${IP}:login`);
  });

  it('falls back to the first x-forwarded-for entry', () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' }
    });
    expect(getClientKey(request, 'login')).toBe('198.51.100.5:login');
  });

  it('groups unknown clients under one key', () => {
    expect(getClientKey(new Request('http://x/'), 'login'))
      .toBe('unknown:login');
  });
});
