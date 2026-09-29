import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE
} from '../../src/server/tables';
import {
  verifyPassword,
  deleteSessionsForUser,
  revokeOtherSessions,
  purgeExpiredSessions,
  updateUserPassword
} from '../../src/server/auth';
import { assertSameOrigin } from '../../src/server/origin';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { POST as logoutPost } from '../../src/pages/api/auth/logout';
import { POST as changePasswordPost } from '../../src/pages/api/auth/change-password';
import { PUT as putUser, DELETE as deleteUser } from '../../src/pages/api/users/[id]';
import { POST as postUser } from '../../src/pages/api/users/index';
import type { User, Session } from '../../src/domain/crm';

const SEED_ADMIN_HASH = '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';

const adminUser: User = {
  id: 'seed-user-admin',
  name: 'Administrador',
  email: 'admin@deskcomm.local',
  passwordHash: SEED_ADMIN_HASH,
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z'
};

const otherUser: User = {
  id: 'user-2',
  name: 'Outro',
  email: 'outro@deskcomm.local',
  passwordHash: SEED_ADMIN_HASH,
  role: 'agent',
  createdAt: '2026-01-01T00:00:00Z'
};

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

function session(token: string, userId: string, expiresAt = ''): Session {
  return {
    token,
    userId,
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: expiresAt ||
      new Date(Date.now() + 60_000).toISOString()
  };
}

function seed(tables: Record<string, object[]>): FakeD1 {
  return new FakeD1(
    new Map(
      Object.entries(tables).map(([table, rows]) => [
        table, rows as Record<string, unknown>[]
      ])
    )
  );
}

function apiContext(
  path: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
  ip = '203.0.113.1'
): APIContext {
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', ip);
  const request = new Request(`http://localhost${path}`, {
    ...init,
    headers
  });
  return { request, params } as unknown as APIContext;
}

function jsonBody(data: unknown, token?: string): RequestInit {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data)
  };
}

describe('assertSameOrigin (src/server/origin.ts)', () => {
  it('allows same-origin requests and those without an Origin', () => {
    const same = new Request('http://localhost/api/auth/login', {
      headers: { Origin: 'http://localhost' }
    });
    expect(assertSameOrigin(same)).toBeNull();
    expect(assertSameOrigin(new Request('http://localhost/api/x'))).toBeNull();
  });

  it('blocks cross-origin requests with a 403', () => {
    const evil = new Request('http://localhost/api/auth/login', {
      headers: { Origin: 'https://evil.example' }
    });
    const response = assertSameOrigin(evil)!;
    expect(response.status).toBe(403);
  });

  it('blocks a literal "null" origin (sandboxed iframe)', () => {
    const response = assertSameOrigin(
      new Request('http://localhost/api/auth/login', {
        headers: { Origin: 'null' }
      })
    )!;
    expect(response.status).toBe(403);
  });
});

describe('session hygiene helpers (src/server/auth.ts)', () => {
  it('deleteSessionsForUser clears only that user sessions', async () => {
    const db = seed({
      [SESSIONS_TABLE]: [
        session('a', 'u1'), session('b', 'u1'), session('c', 'u2')
      ]
    });
    await deleteSessionsForUser(db, 'u1');
    expect(db.rows(SESSIONS_TABLE).map((r) => r.token)).toEqual(['c']);
  });

  it('revokeOtherSessions keeps the except token for that user only', async () => {
    const db = seed({
      [SESSIONS_TABLE]: [
        session('a', 'u1'), session('b', 'u1'),
        session('c', 'u1'), session('d', 'u2')
      ]
    });
    await revokeOtherSessions(db, 'u1', 'b');
    expect(db.rows(SESSIONS_TABLE).map((r) => r.token)).toEqual(['b', 'd']);
  });

  it('purgeExpiredSessions removes only expired rows', async () => {
    const db = seed({
      [SESSIONS_TABLE]: [
        session('old', 'u1', '2026-01-01T00:00:00Z'),
        session('live', 'u1')
      ]
    });
    await purgeExpiredSessions(db);
    expect(db.rows(SESSIONS_TABLE).map((r) => r.token)).toEqual(['live']);
  });

  it('updateUserPassword hashes the new password in place', async () => {
    const db = seed({ [USERS_TABLE]: [adminUser] });
    const saved = await updateUserPassword(
      db, 'seed-user-admin', 'nova-senha-123'
    );
    expect(saved?.passwordHash).not.toBe(SEED_ADMIN_HASH);
    const ok = await verifyPassword(
      'nova-senha-123', saved!.passwordHash, saved!.passwordSalt
    );
    expect(ok).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    state.db = seed({
      [USERS_TABLE]: [adminUser, otherUser],
      [SESSIONS_TABLE]: [
        session('stale', 'seed-user-admin', '2026-01-01T00:00:00Z'),
        session('alive', 'user-2')
      ]
    });
  });

  it('logs in, purges stale + old sessions and issues one fresh token', async () => {
    const response = await loginPost(apiContext(
      '/api/auth/login',
      jsonBody({ email: 'admin@deskcomm.local', password: 'admin123' })
    ));
    expect(response.status).toBe(200);
    const body = await response.json() as { token: string; user: User };
    expect(body.user).not.toHaveProperty('passwordHash');
    const tokens = state.db.rows(SESSIONS_TABLE).map((r) => r.token);
    expect(tokens).not.toContain('stale');
    expect(tokens).toContain('alive');
    expect(tokens).toContain(body.token);
    expect(tokens).toHaveLength(2);
  });

  it('keeps other users sessions untouched', async () => {
    await loginPost(apiContext(
      '/api/auth/login',
      jsonBody({ email: 'admin@deskcomm.local', password: 'admin123' })
    ));
    const tokens = state.db.rows(SESSIONS_TABLE).map((r) => r.token);
    expect(tokens).toContain('alive');
  });

  it('rejects bad credentials and audits the failure', async () => {
    const response = await loginPost(apiContext(
      '/api/auth/login',
      jsonBody({ email: 'admin@deskcomm.local', password: 'wrong' })
    ));
    expect(response.status).toBe(401);
    const audits = state.db.rows(AUTH_AUDIT_TABLE);
    expect(audits.some((r) => r.action === 'login_failed')).toBe(true);
    expect(audits.some((r) => r.action === 'login_ok')).toBe(false);
  });

  it('audits login_ok with the caller ip', async () => {
    await loginPost(apiContext(
      '/api/auth/login',
      jsonBody({ email: 'admin@deskcomm.local', password: 'admin123' }),
      {},
      '198.51.100.7'
    ));
    const audit = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'login_ok')!;
    expect(audit.userId).toBe('seed-user-admin');
    expect(audit.ip).toBe('198.51.100.7');
  });

  it('blocks cross-origin logins without touching sessions', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'a', password: 'b' })
    });
    const response = await loginPost({ request } as unknown as APIContext);
    expect(response.status).toBe(403);
    expect(state.db.rows(SESSIONS_TABLE).length).toBe(2);
  });
});

describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    state.db = seed({
      [USERS_TABLE]: [adminUser, otherUser],
      [SESSIONS_TABLE]: [
        session('tok1', 'seed-user-admin'),
        session('tok2', 'seed-user-admin'),
        session('toku2', 'user-2')
      ]
    });
  });

  it('requires a valid session', async () => {
    const ctx = apiContext('/api/auth/change-password', jsonBody({
      currentPassword: 'admin123', newPassword: 'nova-senha-123'
    }));
    const response = await changePasswordPost(ctx);
    expect(response.status).toBe(404);
  });

  it('rejects a short or missing new password', async () => {
    const body = { currentPassword: 'admin123', newPassword: 'abc' };
    const ctx = apiContext('/api/auth/change-password', jsonBody(body, 'tok1'));
    expect((await changePasswordPost(ctx)).status).toBe(400);
  });

  it('rejects a wrong current password and audits it', async () => {
    const ctx = apiContext('/api/auth/change-password', jsonBody({
      currentPassword: 'wrong', newPassword: 'nova-senha-123'
    }, 'tok1'));
    expect((await changePasswordPost(ctx)).status).toBe(401);
    const audits = state.db.rows(AUTH_AUDIT_TABLE);
    expect(audits.some((r) => r.action === 'password_change_failed')).toBe(true);
  });

  it('changes the password, keeps the caller session, revokes the rest', async () => {
    const ctx = apiContext('/api/auth/change-password', jsonBody({
      currentPassword: 'admin123', newPassword: 'nova-senha-123'
    }, 'tok1'));
    expect((await changePasswordPost(ctx)).status).toBe(200);
    const user = state.db.rows(USERS_TABLE)[0] as unknown as User;
    const next = await verifyPassword(
      'nova-senha-123', user.passwordHash, user.passwordSalt
    );
    expect(next).toBe(true);
    const stale = await verifyPassword(
      'admin123', user.passwordHash, user.passwordSalt
    );
    expect(stale).toBe(false);
    const tokens = state.db.rows(SESSIONS_TABLE).map((r) => r.token);
    expect(tokens).toEqual(['tok1', 'toku2']);
    const audits = state.db.rows(AUTH_AUDIT_TABLE);
    expect(audits.some((r) => r.action === 'password_changed')).toBe(true);
  });
});

describe('POST /api/auth/logout', () => {
  it('drops the session and audits the user', async () => {
    state.db = seed({
      [USERS_TABLE]: [adminUser],
      [SESSIONS_TABLE]: [session('tok1', 'seed-user-admin')]
    });
    const response = await logoutPost(apiContext('/api/auth/logout', {
      method: 'POST', headers: { Authorization: 'Bearer tok1' }
    }));
    expect(response.status).toBe(200);
    expect(state.db.rows(SESSIONS_TABLE)).toHaveLength(0);
    const audit = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'logout')!;
    expect(audit.userId).toBe('seed-user-admin');
  });

  it('is a no-op when already logged out', async () => {
    state.db = FakeD1.empty();
    const response = await logoutPost(apiContext('/api/auth/logout', {
      method: 'POST'
    }));
    expect(response.status).toBe(200);
    expect(state.db.rows(AUTH_AUDIT_TABLE)).toHaveLength(0);
  });
});

describe('/api/users (audit + session revocation)', () => {
  it('POST creates a user and audits it', async () => {
    state.db = FakeD1.empty();
    const response = await postUser(apiContext('/api/users', jsonBody({
      name: 'Nova',
      email: 'nova@deskcomm.local',
      password: 'senha-123',
      role: 'agent'
    })));
    expect(response.status).toBe(201);
    const audit = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'user_created')!;
    expect(audit.detail).toBe('nova@deskcomm.local');
  });

  it('PUT password reset revokes every session of that user and audits', async () => {
    state.db = seed({
      [USERS_TABLE]: [adminUser],
      [SESSIONS_TABLE]: [session('tok1', 'seed-user-admin')]
    });
    const response = await putUser(apiContext(
      '/api/users/seed-user-admin',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin', email: adminUser.email, role: 'admin',
          password: 'nova-senha-123'
        })
      },
      { id: 'seed-user-admin' }
    ));
    expect(response.status).toBe(200);
    expect(state.db.rows(SESSIONS_TABLE)).toHaveLength(0);
    const audit = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'user_password_reset')!;
    expect(audit.userId).toBe('seed-user-admin');
  });

  it('DELETE removes the user and audits it', async () => {
    state.db = seed({ [USERS_TABLE]: [adminUser] });
    const response = await deleteUser(apiContext(
      '/api/users/seed-user-admin',
      { method: 'DELETE' },
      { id: 'seed-user-admin' }
    ));
    expect(response.status).toBe(200);
    const audit = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'user_deleted')!;
    expect(audit.userId).toBe('seed-user-admin');
  });
});