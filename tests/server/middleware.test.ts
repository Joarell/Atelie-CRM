// The middleware is what stands between a request and the API routes, so the
// SSE auth rule is pinned here rather than in a view test: an EventSource
// cannot set an Authorization header, and the CRM views therefore send the
// session token as `?token=`. The middleware used to accept only the Bearer
// header, which 401'd every real-time connection before the route's own
// `resolveSseUser` could run — silent breakage of the whole push feature.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword, newSession } from '../../src/server/auth';
import { USERS_TABLE, SESSIONS_TABLE } from '../../src/server/tables';
import type { User } from '../../src/domain/crm';

const TOKEN = 'middleware-test-token';
const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));

vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

// Capture the raw (context, next) handler instead of letting Astro wrap it.
vi.mock('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn
}));

import { onRequest } from '../../src/middleware';

type Ctx = Parameters<typeof onRequest>[0];

function ctx(path: string, init?: RequestInit): Ctx {
  const request = new Request(`http://localhost${path}`, init);
  return { request, locals: {}, url: new URL(request.url) } as Ctx;
}

function next(): Promise<Response> {
  return Promise.resolve(new Response('ok'));
}

// Astro types a middleware as returning `void | Response`; this handler
// always responds, so narrow it once instead of at every assertion.
function send(ctx: Ctx): Promise<Response> {
  return onRequest(ctx, next) as Promise<Response>;
}

async function dbWithSession(): Promise<FakeD1> {
  const { hash, salt } = await hashPassword('senha-forte');
  const user: User = {
    id: 'u1',
    name: 'U',
    email: 'u@deskcomm.local',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z'
  };
  const session = { ...newSession(user.id), token: TOKEN };
  return FakeD1.from({
    [USERS_TABLE]: [user as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [session as unknown as Record<string, unknown>]
  });
}

const SSE = '/api/crm/events';

describe('middleware auth', () => {
  beforeEach(async () => {
    state.db = await dbWithSession();
  });

  it('lets the SSE endpoint authenticate with a query token', async () => {
    const res = await send(ctx(`${SSE}?since=1&token=${TOKEN}`));
    expect(res.status).toBe(200);
  });

  it('rejects the SSE endpoint without a token', async () => {
    const res = await send(ctx(`${SSE}?since=1`));
    expect(res.status).toBe(401);
  });

  it('rejects the SSE endpoint with a wrong query token', async () => {
    const res = await send(ctx(`${SSE}?since=1&token=errado`));
    expect(res.status).toBe(401);
  });

  it('does not accept a query token on any other route', async () => {
    // A token in a URL leaks into logs and Referer headers, so the fallback is
    // scoped to the one route that has no other way to authenticate.
    const res = await send(ctx(`/api/users?token=${TOKEN}`));
    expect(res.status).toBe(401);
  });

  it('still accepts a Bearer token on a normal route', async () => {
    const res = await send(
      ctx('/api/users', { headers: { Authorization: `Bearer ${TOKEN}` } })
    );
    expect(res.status).toBe(200);
  });

  it('leaves public paths alone', async () => {
    const res = await send(ctx('/api/auth/login'));
    expect(res.status).toBe(200);
  });
});
