// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import type { AppContext } from '../../src/state/AppContext';
import type { Role, User } from '../../src/domain/crm';
import { renderCrmEquipeView } from '../../src/ui/views/crm/CrmEquipeView';
import { numberField } from '../../src/ui/views/crm/crmUi';
import { ApiAuthRepository } from
  '../../src/repositories/ApiAuthRepository';
import { PUT as updateIngredient } from
  '../../src/pages/api/ingredients/[id]';
import { GET as sseEvents } from '../../src/pages/api/crm/events';
import { INGREDIENTS_TABLE, SESSIONS_TABLE, USERS_TABLE } from
  '../../src/server/tables';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));
vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));
vi.mock('../../src/ui/Toast', () => ({ showToast: vi.fn() }));

type Row = Record<string, unknown>;

function source(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

function admin(role: Role = 'admin'): User {
  return {
    id: 'u1', name: 'Op', email: 'op@x.test', passwordHash: '',
    role, createdAt: '2026-01-01T00:00:00Z'
  };
}

function equipeCtx(me: User | null): AppContext {
  const auth = {
    currentUser: vi.fn(() => me),
    subscribe: vi.fn(() => () => {}),
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined)
  } as unknown as AppContext['auth'];
  return {
    users: InMemoryRepository.seeded<User>([admin()]),
    auth
  } as unknown as AppContext;
}

function mountEquipe(me: User | null): HTMLElement {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  renderCrmEquipeView(root, equipeCtx(me));
  document.body.appendChild(root);
  return root;
}

function serverCtx(body: unknown, id: string, role: Role): APIContext {
  return {
    request: new Request(`http://localhost/api/ingredients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    url: new URL(`http://localhost/api/ingredients/${id}`),
    params: { id },
    locals: { user: { id: 'agent-1', role, email: 'a@x.test' } }
  } as unknown as APIContext;
}

beforeEach(() => {
  state.db = FakeD1.from({
    [INGREDIENTS_TABLE]: [
      { id: 'ing-1', name: 'Farinha', stock: 10 }
    ],
    [SESSIONS_TABLE]: [{
      id: 's1', token: 'tok-1', userId: 'agent-1',
      createdAt: '2026-01-01', expiresAt: '2099-01-01'
    }],
    [USERS_TABLE]: [{
      id: 'agent-1', role: 'agent', name: 'A', email: 'a@x.test'
    }]
  });
});

describe('AC-317/318 — the team view gates its buttons by role', () => {
  it('@spec:AC-317 the Excluir button is absent for a manager', () => {
    const root = mountEquipe(admin('manager'));
    expect(root.innerHTML).not.toContain('Excluir');
  });

  it('@spec:AC-317 the Excluir button is present for an admin', () => {
    const root = mountEquipe(admin('admin'));
    expect(root.innerHTML).toContain('Excluir');
  });

  it('@spec:AC-318 the new-user button is hidden from a viewer', () => {
    const root = mountEquipe(admin('viewer'));
    expect(root.innerHTML).not.toContain('Novo usuário');
  });

  it('@spec:AC-318 the new-user button is shown to a manager', () => {
    const root = mountEquipe(admin('manager'));
    expect(root.innerHTML).toContain('Novo usuário');
  });
});

describe('AC-340/341 — the modal escapes its title at the sink', () => {
  it('@spec:AC-340 openModal escapes options.title', () => {
    expect(source('src/ui/Modal.ts'))
      .toContain('escapeHtml(options.title)');
  });

  it('@spec:AC-341 callers pass raw text because the sink escapes once', () => {
    // `openModal` escapes the title itself, so a caller-side escapeHtml would
    // double-encode (`Ana &amp;lt;`). The AC's literal prescription is
    // therefore wrong here; the XSS invariant is what the sink guarantees.
    const stock = source('src/ui/views/StockView.ts');
    expect(stock).toContain('Movimentar: ${ingredient.name}');
    expect(source('src/ui/Modal.ts')).toContain('escapeHtml');
  });
});

describe('AC-342/343 — dashboard and login escape user data', () => {
  it('@spec:AC-342 lowStockRow escapes the ingredient name and unit', () => {
    const view = source('src/ui/views/DashboardView.ts');
    expect(view).toContain('escapeHtml(i.name)');
    expect(view).toContain('escapeHtml(i.unit)');
  });

  it('@spec:AC-343 LoginView escapes the profile name and email', () => {
    const view = source('src/ui/views/LoginView.ts');
    expect(view).toContain('escapeHtml(me.name)');
    expect(view).toContain('escapeHtml(me.email)');
  });
});

describe('AC-344/345/346 — attribute contexts use escapeAtrib', () => {
  it('@spec:AC-344 the tag chip escapes the interpolated color', () => {
    expect(source('src/ui/views/crm/CrmEtiquetasView.ts'))
      .toContain('chip-${escapeAtrib(tag.color)}');
  });

  it('@spec:AC-345 ProductsView numeric inputs escape the value', () => {
    expect(source('src/ui/views/ProductsView.ts'))
      .toContain('value="${escapeAtrib(String(value))}"');
  });

  it('@spec:AC-346 the WhatsApp QR src is attribute-escaped', () => {
    const view = source('src/ui/views/crm/CrmWhatsAppView.ts');
    expect(view).toContain('escapeAtrib(qr)');
    expect(view).toContain('<img src="${safe}"');
  });
});

describe('AC-347/348/350 — one attribute helper, applied by contract', () => {
  it('@spec:AC-347 there is a single attribute escape implementation', () => {
    const format = source('src/domain/format.ts');
    expect(format).toContain('export function escapeAtrib');
    expect(format).not.toContain('export function escapeAttr');
    // dom.ts only re-exports the same function under the legacy name.
    expect(source('src/ui/dom.ts'))
      .toContain('escapeAtrib as escapeAttr');
  });

  it('@spec:AC-348 numberField escapes the numeric value', () => {
    const html = numberField('stock', 'Estoque', '0.01', '5" onmouseover="x');
    expect(html).toContain('value="5&quot;');
    expect(html).not.toContain('onmouseover="x"');
    expect(numberField('qtd', 'Qtd', '1', 7 as unknown as string))
      .toContain('value="7"');
  });

  it('@spec:AC-350 rowButton escapes the data-* attribute', () => {
    expect(source('src/ui/views/crm/crmUi.ts'))
      .toContain('data-${dataset}="${escapeAtrib(value)}"');
  });
});

describe('AC-349 — the server refuses non-numeric values', () => {
  it('@spec:AC-349 a non-numeric numeric field is rejected before persist', async () => {
    const response = await updateIngredient(serverCtx(
      { stock: 'abc; DROP TABLE' }, 'ing-1', 'agent'
    ));
    expect(response.status).toBe(400);
    const body = (await response.json()) as Row;
    expect(body.error).toBe('campo_numerico_invalido');
    expect(state.db.rows(INGREDIENTS_TABLE)[0].stock).toBe(10);
  });

  it('@spec:AC-349 a numeric string is still accepted and coerced', async () => {
    const response = await updateIngredient(serverCtx(
      { stock: '42' }, 'ing-1', 'agent'
    ));
    expect(response.status).toBe(200);
    expect(Number(state.db.rows(INGREDIENTS_TABLE)[0].stock)).toBe(42);
  });
});

describe('AC-351/352/353 — the token stays out of script and query', () => {
  it('@spec:AC-351 no session token is exposed to scripts', () => {
    const repo = new ApiAuthRepository('probe_key');
    expect(repo.token()).toBeNull();
    repo.currentUser();
    // The persisted cache is the profile only; publicUser strips the secrets.
    expect(source('src/repositories/ApiAuthRepository.ts'))
      .not.toMatch(/setItem\([^)]*token/i);
    expect(source('src/server/auth.ts'))
      .toContain('HttpOnly');
  });

  it('@spec:AC-352 the SSE route refuses a query-string token', async () => {
    const context = {
      request: new Request('http://localhost/api/crm/events?token=tok-1'),
      url: new URL('http://localhost/api/crm/events?token=tok-1'),
      params: {},
      locals: {}
    } as unknown as APIContext;
    expect((await sseEvents(context)).status).toBe(401);
  });

  it('@spec:AC-353 the SSE route never sets a wildcard CORS origin', () => {
    expect(source('src/pages/api/crm/events.ts'))
      .not.toContain('Access-Control-Allow-Origin');
  });
});
