import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { GET, PUT } from '../../src/pages/api/settings';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import type { Role, User } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

function getContext(): APIContext {
  return { request: new Request('http://localhost/api/settings') } as unknown as APIContext;
}

function putContext(
  patch: Record<string, unknown>,
  role: Role = 'admin'
): APIContext {
  const locals = { user: { id: 'caller', role } as unknown as User };
  return {
    request: new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }),
    locals
  } as unknown as APIContext;
}

describe('/api/settings GET', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  // GET e' somente leitura: devolve o fallback em memoria e nao escreve nada.
  // A linha nasce em migrations/0022_settings_default.sql.
  it('returns the defaults without writing when no row exists', async () => {
    const response = await GET(getContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DEFAULT_SETTINGS);
    expect(state.db.rows('settings')).toHaveLength(0);
  });

  it('returns the stored settings when a row exists', async () => {
    const stored = { ...DEFAULT_SETTINGS, salary: 3000, markupPercent: 0 };
    state.db = FakeD1.with('settings', [{ id: 'global', ...stored }]);
    const response = await GET(getContext());
    expect(await response.json()).toEqual(stored);
  });
});

describe('/api/settings PUT', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  it('merges the patch over defaults', async () => {
    const response = await PUT(putContext({ salary: 2500 }));
    expect(response.status).toBe(200);
    const saved = (await response.json()) as { salary: number; daysPerMonth: number };
    expect(saved.salary).toBe(2500);
    expect(saved.daysPerMonth).toBe(DEFAULT_SETTINGS.daysPerMonth);
  });

  it('replaces the existing row (upsert)', async () => {
    state.db = FakeD1.with('settings', [
      { id: 'global', ...DEFAULT_SETTINGS, salary: 9999, rent: 100 }
    ]);
    const response = await PUT(putContext({ salary: 2500, rent: 1200 }));
    expect(await response.json()).toMatchObject({ salary: 2500, rent: 1200 });
    expect(state.db.rows('settings')).toHaveLength(1);
  });

  // `settings` nao tem shape.columns, entao o merge aceitaria qualquer chave —
  // inclusive colunas que a tabela nao tem. A allowlist filtra o patch.
  it('ignores unknown columns and non-numeric values', async () => {
    const response = await PUT(
      putContext({ salary: 2500, businessName: 'x', rent: 'abc' })
    );
    expect(response.status).toBe(200);
    const saved = (await response.json()) as Record<string, unknown>;
    expect(saved.salary).toBe(2500);
    expect(saved.businessName).toBeUndefined();
    expect(saved.rent).toBe(DEFAULT_SETTINGS.rent);
    expect(Object.keys(state.db.rows('settings')[0]).sort())
      .toEqual(['id', ...Object.keys(DEFAULT_SETTINGS)].sort());
  });

  it('@spec:AC-107 viewer recebe 403 e o registro nao muda', async () => {
    const response = await PUT(putContext({ salary: 999 }, 'viewer'));
    expect(response.status).toBe(403);
    expect(state.db.rows('settings')).toHaveLength(0);
  });

  it('@spec:AC-107 manager recebe 200', async () => {
    const response = await PUT(putContext({ salary: 2500 }, 'manager'));
    expect(response.status).toBe(200);
    expect(state.db.rows('settings')).toHaveLength(1);
  });
});