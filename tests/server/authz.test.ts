import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { requireRole, sessionUser, hasRole } from '../../src/server/authz';
import { AUTH_AUDIT_TABLE } from '../../src/server/tables';
import type { Role, User } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

function ctx(role: Role | null): APIContext {
  const locals: Record<string, unknown> = {};
  if (role) locals.user = { id: 'u1', role } as User;
  const request = new Request('http://localhost/api/x');
  return { request, params: {}, locals } as unknown as APIContext;
}

describe('requireRole', () => {
  beforeEach(async () => {
    state.db = new FakeD1();
  });

  // @spec:AC-108
  it('nega com 403 e corpo de erro quando o papel nao serve', async () => {
    const denied = await requireRole(ctx('viewer'), ['admin']);
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
    const body = await denied?.json();
    expect(body).toEqual({ error: 'papel_insuficiente' });
  });

  // @spec:AC-108
  it('devolve null quando o papel esta na lista permitida', async () => {
    expect(await requireRole(ctx('admin'), ['admin'])).toBeNull();
    expect(await requireRole(ctx('manager'), ['admin', 'manager'])).toBeNull();
  });

  // @spec:AC-108
  it('registra a negacao em auth_audit', async () => {
    await requireRole(ctx('agent'), ['admin']);
    const rows = await state.db
      .prepare(`SELECT * FROM ${AUTH_AUDIT_TABLE}`)
      .all<Record<string, unknown>>();
    const denied = (rows.results ?? []).find(
      (row) => row.action === 'role_denied'
    );
    expect(denied).toBeDefined();
    expect(denied?.userId).toBe('u1');
    expect(String(denied?.detail)).toContain('papel=agent');
    expect(String(denied?.detail)).toContain('exigido=admin');
  });

  it('nega com 401 quando nao ha sessao', async () => {
    const denied = await requireRole(ctx(null), ['admin']);
    expect(denied?.status).toBe(401);
    expect(await denied?.json()).toEqual({ error: 'nao_autenticado' });
  });

  it('le o usuario de locals e julga o papel', () => {
    expect(sessionUser(ctx('viewer'))?.role).toBe('viewer');
    expect(sessionUser(ctx(null))).toBeNull();
    expect(hasRole({ id: 'u', role: 'admin' } as User, ['admin'])).toBe(true);
    expect(hasRole(null, ['admin'])).toBe(false);
  });
});