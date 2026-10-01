import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { USERS_TABLE, SESSIONS_TABLE, AUTH_AUDIT_TABLE } from '../../src/server/tables';
import type { Role, User } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));

vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));

import { GET as listUsers, POST as createUser } from '../../src/pages/api/users/index';
import { PUT as updateUser, DELETE as deleteUser } from '../../src/pages/api/users/[id]';

const TARGET_ID = 'u-target';

function targetRow(): Record<string, unknown> {
  return {
    id: TARGET_ID,
    name: 'Alvo',
    email: 'alvo@x.com',
    passwordHash: 'old-hash',
    passwordSalt: 'old-salt',
    role: 'agent',
    createdAt: '2026-01-01T00:00:00Z'
  };
}

function seedDb(): void {
  state.db = FakeD1.from({
    [USERS_TABLE]: [targetRow()],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: []
  });
}

function ctx(
  role: Role,
  method: string,
  path: string,
  body?: unknown,
  id?: string
): APIContext {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const locals = { user: { id: 'caller', role } as unknown as User };
  return {
    request: new Request(`http://localhost${path}`, init),
    locals,
    params: id ? { id } : {}
  } as unknown as APIContext;
}

function usersNow(): Record<string, unknown>[] {
  return state.db.rows(USERS_TABLE);
}

function targetNow(): Record<string, unknown> {
  return usersNow().find((u) => u.id === TARGET_ID) ?? {};
}

const NEW_USER = {
  name: 'Novo',
  email: 'novo@x.com',
  password: 'senha123',
  role: 'agent'
};

describe('GET /api/users exige manager ou admin', () => {
  beforeEach(seedDb);

  it('@spec:AC-102 viewer recebe 403 ao listar', async () => {
    const res = await listUsers(ctx('viewer', 'GET', '/api/users'));
    expect(res.status).toBe(403);
  });

  it('@spec:AC-102 manager recebe 200 sem hash nem salt', async () => {
    const res = await listUsers(ctx('manager', 'GET', '/api/users'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('passwordSalt');
  });
});

describe('POST /api/users exige manager ou admin', () => {
  beforeEach(seedDb);

  it('@spec:AC-100 viewer recebe 403', async () => {
    const res = await createUser(ctx('viewer', 'POST', '/api/users', NEW_USER));
    expect(res.status).toBe(403);
    expect(usersNow()).toHaveLength(1);
  });

  it('@spec:AC-100 agent recebe 403', async () => {
    const res = await createUser(ctx('agent', 'POST', '/api/users', NEW_USER));
    expect(res.status).toBe(403);
    expect(usersNow()).toHaveLength(1);
  });

  it('@spec:AC-101 manager recebe 201 e a linha e gravada', async () => {
    const res = await createUser(ctx('manager', 'POST', '/api/users', NEW_USER));
    expect(res.status).toBe(201);
    expect(usersNow()).toHaveLength(2);
    expect(usersNow().some((u) => u.email === 'novo@x.com')).toBe(true);
  });
});

describe('PUT /api/users/<id> decide por campo', () => {
  beforeEach(seedDb);

  const put = (role: Role, body: unknown) =>
    updateUser(ctx(role, 'PUT', `/api/users/${TARGET_ID}`, body, TARGET_ID));

  it('@spec:AC-103 alterar papel e negado a manager', async () => {
    const res = await put('manager', { role: 'manager' });
    expect(res.status).toBe(403);
    expect(targetNow().role).toBe('agent');
  });

  it('@spec:AC-103 alterar papel e permitido a admin', async () => {
    const res = await put('admin', { role: 'manager' });
    expect(res.status).toBe(200);
    expect(targetNow().role).toBe('manager');
  });

  it('@spec:AC-104 redefinir senha e negado a manager', async () => {
    const res = await put('manager', { password: 'nova-senha' });
    expect(res.status).toBe(403);
    expect(targetNow().passwordHash).toBe('old-hash');
  });

  it('@spec:AC-104 redefinir senha e permitido a admin', async () => {
    const res = await put('admin', { password: 'nova-senha' });
    expect(res.status).toBe(200);
    expect(targetNow().passwordHash).not.toBe('old-hash');
  });

  it('@spec:AC-105 editar nome e email e permitido a manager', async () => {
    const res = await put('manager', {
      name: 'Renomeado',
      email: 'renomeado@x.com'
    });
    expect(res.status).toBe(200);
    expect(targetNow().name).toBe('Renomeado');
    expect(targetNow().email).toBe('renomeado@x.com');
  });
});

describe('DELETE /api/users/<id> exige admin', () => {
  beforeEach(seedDb);

  const del = (role: Role) =>
    deleteUser(ctx(role, 'DELETE', `/api/users/${TARGET_ID}`, undefined, TARGET_ID));

  it('@spec:AC-106 excluir e negado a manager', async () => {
    const res = await del('manager');
    expect(res.status).toBe(403);
    expect(usersNow()).toHaveLength(1);
  });

  it('@spec:AC-106 excluir e permitido a admin', async () => {
    const res = await del('admin');
    expect(res.status).toBe(200);
    expect(usersNow()).toHaveLength(0);
  });
});
