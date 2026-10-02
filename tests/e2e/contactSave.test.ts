// @vitest-environment happy-dom
// Regression: saving a contact must add it to the table.
//
// Reproduces the reported flow exactly — click "Novo contato", fill EVERY
// field, click the real "Salvar" button — against a request context that
// carries a session user, because the PII audit write only happens (and only
// used to blow up) when locals.user is set.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword } from '../../src/server/auth';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE,
  CONTACTS_TABLE,
  CONVERSATIONS_TABLE,
  MESSAGES_TABLE,
  DEALS_TABLE,
  TASKS_TABLE,
  PRODUCTS_TABLE,
  ORDERS_TABLE,
  PIPELINES_TABLE,
  STAGES_TABLE,
  TAGS_TABLE,
  CALENDAR_EVENTS_TABLE,
  CRM_ACTIVITIES_TABLE,
  INGREDIENTS_TABLE,
  COMPONENTS_TABLE,
  CUSTOMERS_TABLE,
  STOCK_MOVEMENTS_TABLE,
  QUICK_REPLIES_TABLE,
  CATALOG_PRODUCTS_TABLE,
  CONVERSATION_NOTES_TABLE,
  APPOINTMENT_TYPES_TABLE
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
import { POST as contactsPost } from '../../src/pages/api/crm/contacts/index';
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

const EMAIL = 'repro@deskcomm.local';
const PASSWORD = 'repro-senha-forte-123';
const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

type ApiRoute = (ctx: APIContext) => Response | Promise<Response>;
const routes = new Map<string, ApiRoute>();

async function seed(): Promise<FakeD1> {
  const { hash, salt } = await hashPassword(PASSWORD);
  const admin: User = {
    id: 'u1', name: 'Admin', email: EMAIL,
    passwordHash: hash, passwordSalt: salt, role: 'admin',
    createdAt: '2026-01-01T00:00:00Z'
  };
  return FakeD1.from({
    [USERS_TABLE]: [admin as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: [],
    [CONTACTS_TABLE]: [],
    [CONVERSATIONS_TABLE]: [],
    [MESSAGES_TABLE]: [],
    [DEALS_TABLE]: [],
    [TASKS_TABLE]: [],
    [INGREDIENTS_TABLE]: [],
    [COMPONENTS_TABLE]: [],
    [CUSTOMERS_TABLE]: [],
    [STOCK_MOVEMENTS_TABLE]: [],
    [QUICK_REPLIES_TABLE]: [],
    [CATALOG_PRODUCTS_TABLE]: [],
    [CRM_ACTIVITIES_TABLE]: [],
    [CONVERSATION_NOTES_TABLE]: [],
    [APPOINTMENT_TYPES_TABLE]: [],
    [STAGES_TABLE]: [],
    [PRODUCTS_TABLE]: [],
    [ORDERS_TABLE]: [],
    [PIPELINES_TABLE]: [],
    [TAGS_TABLE]: [],
    [CALENDAR_EVENTS_TABLE]: []
  });
}

function apiContext(request: Request): APIContext {
  return {
    request,
    params: {},
    locals: { user: { id: 'u1', role: 'admin' } }
  } as unknown as APIContext;
}

async function waitFor(check: () => void, ms = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try { check(); return; } catch (err) {
      if (Date.now() - start > ms) throw err;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

describe('Contatos: saving a contact reaches the table', () => {
  beforeAll(async () => {
    state.db = await seed();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const absolute = new URL(String(input), 'http://localhost').toString();
      const request = new Request(absolute, init);
      const handler = routes.get(
        `${request.method} ${new URL(absolute).pathname}`
      );
      if (!handler) {
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' }
        });
      }
      return handler(apiContext(request));
    });
    const map: Array<[string, ApiRoute]> = [
      ['GET /api/settings', settingsGet],
      ['GET /api/users', usersGet],
      ['GET /api/auth/me', meGet],
      ['POST /api/auth/login', loginPost],
      ['GET /api/ingredients', ingredientsGet],
      ['GET /api/components', componentsGet],
      ['GET /api/products', productsGet],
      ['GET /api/customers', customersGet],
      ['GET /api/orders', ordersGet],
      ['GET /api/stock-movements', movementsGet],
      ['GET /api/crm/contacts', contactsGet],
      ['POST /api/crm/contacts', contactsPost],
      ['GET /api/crm/pipelines', pipelinesGet],
      ['GET /api/crm/stages', stagesGet],
      ['GET /api/crm/deals', dealsGet],
      ['GET /api/crm/tasks', tasksGet],
      ['GET /api/crm/quick-replies', quickRepliesGet],
      ['GET /api/crm/calendar-events', calendarEventsGet],
      ['GET /api/crm/conversations', conversationsGet],
      ['GET /api/crm/messages', messagesGet],
      ['GET /api/crm/catalog-products', catalogGet],
      ['GET /api/crm/activities', activitiesGet],
      ['GET /api/crm/conversation-notes', notesGet],
      ['GET /api/crm/tags', tagsGet],
      ['GET /api/crm/appointment-types', appointmentTypesGet]
    ];
    map.forEach(([key, route]) => routes.set(key, route));
    window.matchMedia ||= (() => ({ matches: false })) as never;
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/main');
  });

  afterAll(() => vi.unstubAllGlobals());

  it('logs in, then creates a contact clicking Salvar', async () => {
    window.location.hash = '#/login';
    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (!document.querySelector('#login-email')) throw new Error('no form');
    });
    (document.querySelector<HTMLInputElement>('#login-email') as HTMLInputElement).value = EMAIL;
    (document.querySelector<HTMLInputElement>('#login-password') as HTMLInputElement).value = PASSWORD;
    document.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true })
    );
    await waitFor(() => {
      if (!localStorage.getItem('crm_user')) throw new Error('no session');
    });

    window.location.hash = '#/contatos';
    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (!document.querySelector('#new-contact')) throw new Error('no button');
    });

    const rowsBefore = document.querySelectorAll('tbody tr').length;
    expect(rowsBefore).toBe(0);

    document.querySelector<HTMLButtonElement>('#new-contact')?.click();
    await waitFor(() => {
      if (!document.querySelector('.modal-backdrop form')) {
        throw new Error('modal not open');
      }
    });

    // Fill EVERY field, exactly like a user would.
    const form = document.querySelector<HTMLFormElement>('.modal form');
    const set = (sel: string, value: string) => {
      const el = form?.querySelector<HTMLInputElement>(sel);
      if (!el) throw new Error(`missing field ${sel}`);
      el.value = value;
    };
    set('[name="name"]', 'Carla E2E');
    set('[name="phone"]', '5511998887777');
    set('[name="email"]', 'carla@example.com');
    const notes = form?.querySelector<HTMLTextAreaElement>('[name="notes"]');
    if (!notes) throw new Error('missing notes');
    notes.value = 'Compradora frequente';
    set('[name="tags"]', 'vip, lead');

    // Click the REAL Salvar button, not a synthetic submit event.
    const save = document.querySelector<HTMLButtonElement>(
      '.modal-foot button[type="submit"]'
    );
    expect(save).toBeTruthy();
    save?.click();

    await waitFor(() => {
      if (document.querySelector('.modal-backdrop')) {
        throw new Error('modal still open after save');
      }
    });

    const rowsAfter = document.querySelectorAll('tbody tr').length;
    expect(rowsAfter).toBe(1);
    expect(document.querySelector('#view-root')?.textContent)
      .toContain('Carla E2E');
  });

  it('writes a schema-valid PII audit row when saving a contact', async () => {
    // FakeD1 enforces the real NOT NULL / column layout, so this throwing is
    // exactly the production failure: the audited POST 500s and nothing saves.
    const logs = state.db.rows('action_logs');
    expect(logs.length).toBeGreaterThan(0);
    for (const row of logs) {
      expect(row.clientId).toBe('default');
      expect(row.userId).toBe('u1');
      expect(row.action).toBeTruthy();
      expect(row.id).toBeTruthy();
      expect(row.createdAt).toBeTruthy();
    }
    const created = logs.find((r) => r.action === 'create');
    expect(created).toBeTruthy();
    expect(created?.detail).toContain('contact:');
  });
});
