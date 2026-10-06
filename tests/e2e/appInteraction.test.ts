// @vitest-environment happy-dom
// End-to-end boot test: imports the REAL src/main.ts (which runs boot())
// with a fetch stub that dispatches to the REAL /api route handlers backed
// by FakeD1, then drives the UI like a user — shell renders, login page
// opens, credentials submitted, shell becomes interactive.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword } from '../../src/server/auth';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE
} from '../../src/server/tables';
import type { User } from '../../src/domain/crm';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { GET as meGet } from '../../src/pages/api/auth/me';
import { GET as settingsGet } from '../../src/pages/api/settings';
import { GET as usersGet } from '../../src/pages/api/users/index';
import { GET as ingredientsGet } from '../../src/pages/api/ingredients/index';
import { GET as componentsGet } from '../../src/pages/api/components/index';
import { GET as productsGet } from '../../src/pages/api/products/index';
import { GET as customersGet } from '../../src/pages/api/customers/index';
import { GET as ordersGet } from '../../src/pages/api/orders/index';
import { GET as movementsGet } from '../../src/pages/api/stock-movements/index';
import { GET as contactsGet } from '../../src/pages/api/crm/contacts/index';
import { GET as pipelinesGet } from '../../src/pages/api/crm/pipelines/index';
import { GET as stagesGet } from '../../src/pages/api/crm/stages/index';
import { GET as dealsGet } from '../../src/pages/api/crm/deals/index';
import { GET as tasksGet } from '../../src/pages/api/crm/tasks/index';
import { GET as quickRepliesGet } from '../../src/pages/api/crm/quick-replies/index';
import { GET as calendarEventsGet } from '../../src/pages/api/crm/calendar-events/index';
import { GET as conversationsGet } from '../../src/pages/api/crm/conversations/index';
import { GET as messagesGet } from '../../src/pages/api/crm/messages/index';
import { GET as catalogGet } from '../../src/pages/api/crm/catalog-products/index';
import { GET as activitiesGet } from '../../src/pages/api/crm/activities/index';
import { GET as notesGet } from '../../src/pages/api/crm/conversation-notes/index';
import { GET as tagsGet } from '../../src/pages/api/crm/tags/index';
import { GET as appointmentTypesGet } from '../../src/pages/api/crm/appointment-types/index';

const EMAIL = 'e2e@deskcomm.local';
const PASSWORD = 'e2e-senha-forte-123';
const AUTH_PATHS: Record<string, string> = {
  '/api/ingredients': 'ingredientsGet',
  '/api/components': 'componentsGet',
  '/api/products': 'productsGet',
  '/api/customers': 'customersGet',
  '/api/orders': 'ordersGet',
  '/api/stock-movements': 'movementsGet',
  '/api/crm/contacts': 'contactsGet',
  '/api/crm/pipelines': 'pipelinesGet',
  '/api/crm/stages': 'stagesGet',
  '/api/crm/deals': 'dealsGet',
  '/api/crm/tasks': 'tasksGet',
  '/api/crm/quick-replies': 'quickRepliesGet',
  '/api/crm/calendar-events': 'calendarEventsGet',
  '/api/crm/conversations': 'conversationsGet',
  '/api/crm/messages': 'messagesGet',
  '/api/crm/catalog-products': 'catalogGet',
  '/api/crm/activities': 'activitiesGet',
  '/api/crm/conversation-notes': 'notesGet',
  '/api/crm/tags': 'tagsGet',
  '/api/crm/appointment-types': 'appointmentTypesGet'
};

type ApiRoute = (ctx: APIContext) => Response | Promise<Response>;
const routes = new Map<string, ApiRoute>();
const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

async function beforeEachRun(): Promise<FakeD1> {
  const digest = await hashPassword(PASSWORD);
  const admin: User = {
    id: 'seed-user-e2e',
    name: 'E2E Admin',
    email: EMAIL,
    passwordHash: digest.hash,
    passwordSalt: digest.salt,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z'
  };
  return FakeD1.from({
    [USERS_TABLE]: [admin as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: []
  });
}

function apiContext(request: Request): APIContext {
  return { request, params: {} } as unknown as APIContext;
}

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const absolute = new URL(String(input), 'http://localhost').toString();
    const request = new Request(absolute, init);
    const path = new URL(absolute).pathname;
    const handler = routes.get(`${request.method} ${path}`);
    if (!handler) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return handler(apiContext(request));
  });
}

async function waitFor(
  check: () => void,
  label = 'condicao',
  ms = 4000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      check();
      return;
    } catch {
      if (Date.now() - start > ms) {
        const app = document.querySelector('#app')?.innerHTML ?? '';
        const view = document.querySelector('#view-root')?.innerHTML ?? '';
        throw new Error(
          `waitFor timeout em "${label}". #app: ${app.slice(0, 300)}\n` +
            `#view-root: ${view.slice(0, 300)}`
        );
      }
      await new Promise((res) => setTimeout(res, 10));
    }
  }
}

function app(): HTMLElement {
  const el = document.querySelector<HTMLElement>('#app');
  if (!el) throw new Error('no #app');
  return el;
}

describe('app interaction (real main.ts + real API routes)', () => {
  beforeAll(async () => {
    state.db = await beforeEachRun();
    stubFetch();
    Object.entries(AUTH_PATHS).forEach(([path, name]) => {
      routes.set(`GET ${path}`, routeByName(name));
    });
    routes.set('GET /api/settings', settingsGet);
    routes.set('GET /api/users', usersGet);
    routes.set('GET /api/auth/me', meGet);
    routes.set('POST /api/auth/login', loginPost);

    window.matchMedia ||= () =>
      ({ matches: false }) as unknown as MediaQueryList;
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/main');
  });

  it('boots the shell and lets the user log in end to end', async () => {
    await waitFor(() => {
      if (!app().querySelector('.app-shell')) throw new Error('no shell');
    }, 'shell montado');

    expect(
      document.querySelector<HTMLElement>('#page-title')?.textContent
    ).toBe('Painel');
    const viewRoot = document.querySelector<HTMLElement>('#view-root');
    expect(viewRoot?.querySelector('.login-hint')).toBeTruthy();

    const enterLink = document.querySelector<HTMLAnchorElement>(
      '[data-foot-login]'
    );
    expect(enterLink).toBeTruthy();
    enterLink?.click();
    expect(sessionStorage.getItem('login_return_path') ?? '').not.toBe('');

    window.location.hash = '#/login';
    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (!document.querySelector('#login-email')) throw new Error('no form');
    }, 'form de login');

    const emailInput = document.querySelector<HTMLInputElement>(
      '#login-email'
    ) as HTMLInputElement;
    const passwordInput = document.querySelector<HTMLInputElement>(
      '#login-password'
    ) as HTMLInputElement;
    emailInput.value = EMAIL;
    passwordInput.value = PASSWORD;
    const form = document.querySelector<HTMLFormElement>('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true }));

    // A sessao persistida e o sinal duravel de "login concluded". Esperar pelo
    // `.toast` seria uma corrida: o login mostra o toast e logo em seguida troca
    // o hash, e `activate()` chama `clearToast()` (src/main.ts), que apaga o
    // `.toast-wrap` antes do proximo poll — o teste falhava ~1 em 8 vezes.
    await waitFor(() => {
      if (!localStorage.getItem('crm_user')) {
        throw new Error('sessao ainda nao persistida');
      }
    }, 'sessao persistida apos login');
    expect(sessionStorage.getItem('login_return_path')).toBeNull();
    expect(localStorage.getItem('crm_user')).toBeTruthy();
    expect(localStorage.getItem('crm_token')).toBeNull();
    expect(window.location.hash).toBe('#/');

    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (document.querySelector('.login-hint')) throw new Error('still out');
    });

    const row = state.db.rows(AUTH_AUDIT_TABLE)
      .find((r) => r.action === 'login_ok');
    expect(row).toBeTruthy();
    // A sessao existe no servidor e o token nao e legivel pelo storage.
    const sessions = state.db.rows(SESSIONS_TABLE);
    expect(sessions).toHaveLength(1);
    expect(localStorage.getItem('crm_token')).toBeNull();
    expect(
      JSON.parse(localStorage.getItem('crm_user') as string)
    ).not.toHaveProperty('passwordHash');
  });

  // O aviso de resubmissao do Chrome aparecia em TODO refresh e em TODO menu,
  // porque o roteamento e por hash: cada menu cria uma entrada de historico
  // apontando para o mesmo documento, entao um unico submit nativo que
  // escapasse contaminava todas as rotas. Este teste prova, no app de verdade
  // (com o boot real de src/main.ts), que nenhum submit chega a virar
  // navegacao POST.
  it('cancela qualquer submit nativo apos o boot, em qualquer rota', async () => {
    await waitFor(() => {
      if (!document.querySelector('.app-shell')) throw new Error('no shell');
    });

    const routes = [
      '#/', '#/login', '#/vendas/funil', '#/vendas/inbox',
      '#/vendas/contatos', '#/vendas/equipe', '#/atelie/painel',
      '#/atelie/ingredientes', '#/atelie/componentes', '#/atelie/produtos',
      '#/atelie/estoque', '#/atelie/pedidos', '#/atelie/clientes',
      '#/atelie/configuracoes'
    ];
    for (const route of routes) {
      window.location.hash = route;
      window.dispatchEvent(new Event('hashchange'));
      // `#view-root` existe desde o boot, entao checa-lo sozinho passaria sem
      // esperar a rota renderizar — e o teste alegaria cobrir as rotas sem
      // nunca ter montado nenhuma. Exigir um filho garante que a view abriu.
      await waitFor(() => {
        const root = document.querySelector('#view-root');
        if (!root?.firstElementChild) throw new Error('view nao renderizou');
      }, `view montada em ${route}`);
      // Um form sem handler, como o de uma view que ainda nao anexou o bind.
      const orphan = document.createElement('form');
      orphan.innerHTML = '<button type="submit">Enviar</button>';
      document.querySelector('#view-root')?.appendChild(orphan);
      const event = new Event('submit', { bubbles: true, cancelable: true });
      orphan.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});

function routeByName(
  name: string
): ApiRoute {
  return { ingredientsGet, componentsGet, productsGet, customersGet,
    ordersGet, movementsGet, contactsGet, pipelinesGet, stagesGet,
    dealsGet, tasksGet, quickRepliesGet, calendarEventsGet,
    conversationsGet, messagesGet, catalogGet, activitiesGet,
    notesGet, tagsGet, appointmentTypesGet }[name]!;
}