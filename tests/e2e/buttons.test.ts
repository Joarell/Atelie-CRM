// @vitest-environment happy-dom
// E2E button functionality test: Tests that all buttons in the app are properly
// rendered, clickable, and trigger the expected actions.
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
  TAGS_TABLE,
  CALENDAR_EVENTS_TABLE,
  INGREDIENTS_TABLE,
  COMPONENTS_TABLE,
  CUSTOMERS_TABLE,
  STOCK_MOVEMENTS_TABLE,
  QUICK_REPLIES_TABLE,
  CATALOG_PRODUCTS_TABLE,
  CRM_ACTIVITIES_TABLE,
  CONVERSATION_NOTES_TABLE,
  APPOINTMENT_TYPES_TABLE,
  STAGES_TABLE
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
import { POST as pipelinesPost } from '../../src/pages/api/crm/pipelines/index';
import { GET as stagesGet } from '../../src/pages/api/crm/stages/index';
import { POST as stagesPost } from '../../src/pages/api/crm/stages/index';
import { GET as dealsGet } from '../../src/pages/api/crm/deals/index';
import { POST as dealsPost } from '../../src/pages/api/crm/deals/index';
import { GET as tasksGet } from '../../src/pages/api/crm/tasks/index';
import { GET as quickRepliesGet } from '../../src/pages/api/crm/quick-replies/index';
import { GET as calendarEventsGet } from '../../src/pages/api/crm/calendar-events/index';
import { POST as calendarEventsPost } from '../../src/pages/api/crm/calendar-events/index';
import { GET as conversationsGet } from '../../src/pages/api/crm/conversations/index';
import { POST as conversationsPost } from '../../src/pages/api/crm/conversations/index';
import { GET as messagesGet } from '../../src/pages/api/crm/messages/index';
import { POST as messagesPost } from '../../src/pages/api/crm/messages/index';
import { GET as catalogGet } from '../../src/pages/api/crm/catalog-products/index';
import { GET as activitiesGet } from '../../src/pages/api/crm/activities/index';
import { GET as notesGet } from '../../src/pages/api/crm/conversation-notes/index';
import { GET as tagsGet } from '../../src/pages/api/crm/tags/index';
import { POST as tagsPost } from '../../src/pages/api/crm/tags/index';
import { GET as appointmentTypesGet } from '../../src/pages/api/crm/appointment-types/index';
import { POST as appointmentTypesPost } from '../../src/pages/api/crm/appointment-types/index';

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
  const { hash, salt } = await hashPassword(PASSWORD);
  const admin: User = {
    id: 'seed-user-e2e',
    name: 'E2E Admin',
    email: EMAIL,
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z'
  };
  
  // Seed some contacts for testing
  const contacts = [
    {
      id: 'seed-contact-1',
      name: 'Ana Silva',
      phone: '5511999990001',
      email: 'ana@example.com',
      notes: 'Test contact 1',
      tags: JSON.stringify(['test']),
      assignedUserId: 'seed-user-e2e',
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'seed-contact-2',
      name: 'Bruno Santos',
      phone: '5511999990002',
      email: 'bruno@example.com',
      notes: 'Test contact 2',
      tags: JSON.stringify(['vip']),
      assignedUserId: 'seed-user-e2e',
      createdAt: '2026-01-02T00:00:00Z'
    }
  ];
  
  // Seed a pipeline
  const pipelines = [
    {
      id: 'seed-pipeline-1',
      name: 'Vendas',
      isDefault: 1
    }
  ];

  // Seed pipeline stages
  const stages = [
    {
      id: 'seed-stage-1',
      pipelineId: 'seed-pipeline-1',
      name: 'Novo',
      position: 0
    },
    {
      id: 'seed-stage-2',
      pipelineId: 'seed-pipeline-1',
      name: 'Em negociação',
      position: 1
    },
    {
      id: 'seed-stage-3',
      pipelineId: 'seed-pipeline-1',
      name: 'Fechado',
      position: 2
    }
  ];
  
  return FakeD1.from({
    [USERS_TABLE]: [admin as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: [],
    [CONTACTS_TABLE]: contacts as unknown as Record<string, unknown>[],
    [CONVERSATIONS_TABLE]: [
      {
        id: 'seed-conv-1',
        contactId: 'seed-contact-1',
        channel: 'whatsapp',
        channelPhone: '5511999990001',
        lastMessageAt: '2026-01-16T18:05:00.000Z',
        assignedUserId: 'seed-user-e2e',
        status: 'open',
        snoozedUntil: '',
        createdAt: '2026-01-05T10:05:00.000Z'
      },
      {
        id: 'seed-conv-2',
        contactId: 'seed-contact-2',
        channel: 'whatsapp',
        channelPhone: '5511999990002',
        lastMessageAt: '2026-01-17T11:20:00.000Z',
        assignedUserId: 'seed-user-e2e',
        status: 'open',
        snoozedUntil: '',
        createdAt: '2026-01-10T14:35:00.000Z'
      }
    ] as unknown as Record<string, unknown>[],
    [MESSAGES_TABLE]: [
      {
        id: 'seed-msg-1',
        conversationId: 'seed-conv-1',
        direction: 'inbound',
        text: 'Oi! Quanto custa o bolo de limão?',
        createdBy: 'seed-contact-1',
        createdAt: '2026-01-16T18:05:00.000Z',
        ack: 3,
        waStatus: 'read',
        messageType: 'text'
      },
      {
        id: 'seed-msg-2',
        conversationId: 'seed-conv-1',
        direction: 'outbound',
        text: 'Olá, Ana! O bolo de limão está R$ 89,90.',
        createdBy: 'seed-user-e2e',
        createdAt: '2026-01-16T18:12:00.000Z',
        ack: 3,
        waStatus: 'read',
        messageType: 'text'
      },
      {
        id: 'seed-msg-3',
        conversationId: 'seed-conv-2',
        direction: 'inbound',
        text: 'Preciso de orçamento para 20 docinhos.',
        createdBy: 'seed-contact-2',
        createdAt: '2026-01-17T11:20:00.000Z',
        ack: 2,
        waStatus: 'delivered',
        messageType: 'text'
      }
    ] as unknown as Record<string, unknown>[],
    [DEALS_TABLE]: [],
    [TASKS_TABLE]: [],
    [INGREDIENTS_TABLE]: [
      {
        id: 'seed-ingredient-1',
        name: 'Farinha de trigo',
        unit: 'g',
        minStock: 1000,
        cost: 4.5,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'seed-ingredient-2',
        name: 'Açúcar',
        unit: 'g',
        minStock: 1000,
        cost: 3.2,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ] as unknown as Record<string, unknown>[],
    [COMPONENTS_TABLE]: [],
    [CUSTOMERS_TABLE]: [],
    [STOCK_MOVEMENTS_TABLE]: [],
    [QUICK_REPLIES_TABLE]: [],
    [CATALOG_PRODUCTS_TABLE]: [],
    [CRM_ACTIVITIES_TABLE]: [],
    [CONVERSATION_NOTES_TABLE]: [],
    [APPOINTMENT_TYPES_TABLE]: [],
    [STAGES_TABLE]: stages as unknown as Record<string, unknown>[],
    [PRODUCTS_TABLE]: [
      {
        id: 'seed-product-1',
        name: 'Bolo de Limão',
        category: 'Bolos',
        yieldUnits: 1,
        prepTime: 60,
        labor: JSON.stringify({ salary: 1800, daysPerMonth: 24, hoursPerDay: 8 }),
        fixedExpenses: JSON.stringify({ rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 }),
        variablePercent: 10,
        markupPercent: 70,
        items: JSON.stringify([{ kind: 'ingredient', refId: 'seed-ingredient-1', qty: 500 }]),
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'seed-product-2',
        name: 'Docinhos Sortidos',
        category: 'Doces',
        yieldUnits: 100,
        prepTime: 120,
        labor: JSON.stringify({ salary: 1800, daysPerMonth: 24, hoursPerDay: 8 }),
        fixedExpenses: JSON.stringify({ rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 }),
        variablePercent: 10,
        markupPercent: 70,
        items: JSON.stringify([{ kind: 'ingredient', refId: 'seed-ingredient-2', qty: 1000 }]),
        createdAt: '2026-01-01T00:00:00Z'
      }
    ] as unknown as Record<string, unknown>[],
    [ORDERS_TABLE]: [],
    [PIPELINES_TABLE]: pipelines as unknown as Record<string, unknown>[],
    [TAGS_TABLE]: [],
    [CALENDAR_EVENTS_TABLE]: [],
  });
}

function apiContext(request: Request): APIContext {
  // Mirrors a real request AFTER login: middleware puts the session user in
  // locals, and the API routes only write their PII audit rows when one is
  // present. Leaving locals empty here silently skipped every audited write
  // and let a broken audit insert reach production unnoticed.
  return {
    request,
    params: {},
    locals: { user: { id: 'seed-user-e2e', role: 'admin' } }
  } as unknown as APIContext;
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

async function waitFor(check: () => void, ms = 4000): Promise<void> {
  const start = Date.now();
  let last = 'unknown';
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (Date.now() - start > ms) {
        const dom = document.querySelector('#app')?.innerHTML ?? '';
        throw new Error(
          `waitFor timeout (${last}). #app: ${dom.slice(0, 500)}`
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

async function waitForEl<T extends Element>(selector: string, ms = 4000):
  Promise<T> {
  let found: T | null = null;
  await waitFor(() => {
    const el = document.querySelector<T>(selector);
    if (!el) throw new Error(`no ${selector}`);
    found = el;
  }, ms);
  return found as unknown as T;
}

/**
 * The shared CRM form footer (crmUi.formActions) must always offer a
 * "Cancelar" dismiss action and a "Salvar" submit action.
 */
async function expectModalActions(): Promise<void> {
  await waitFor(() => {
    const foot = document.querySelector('.modal-foot');
    if (!foot) throw new Error('no modal footer');
    const buttons = foot.querySelectorAll('button');
    if (buttons.length !== 2) throw new Error('expected 2 footer buttons');
  });
  const foot = document.querySelector('.modal-foot') as HTMLElement;
  const buttons = foot.querySelectorAll<HTMLButtonElement>('button');
  expect(buttons[0].textContent).toContain('Cancelar');
  expect(buttons[1].textContent).toContain('Salvar');
  expect(buttons[1].getAttribute('type')).toBe('submit');
}

/**
 * Exercises a real dismissal path so the "Cancelar"/X/backdrop wiring is
 * covered instead of just asserting the buttons exist.
 */
async function closeModalVia(how: 'cancel' | 'close' | 'backdrop'): Promise<void> {
  const backdrop = document.querySelector<HTMLElement>('.modal-backdrop');
  if (!backdrop) throw new Error('no backdrop to dismiss');
  if (how === 'cancel') {
    const cancel = document.querySelector<HTMLElement>('.modal-foot button');
    if (!cancel) throw new Error('no cancel button');
    cancel.click();
  } else if (how === 'close') {
    document.querySelector<HTMLElement>('[data-close-modal]')?.click();
  } else {
    backdrop.click();
  }
  await waitFor(() => {
    if (document.querySelector('.modal-backdrop')) {
      throw new Error('modal still open');
    }
  });
}

describe('E2E: Button functionality tests', () => {
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
    routes.set('POST /api/crm/contacts', contactsPost);
    routes.set('POST /api/crm/pipelines', pipelinesPost);
    routes.set('POST /api/crm/stages', stagesPost);
    routes.set('POST /api/crm/deals', dealsPost);
    routes.set('POST /api/crm/calendar-events', calendarEventsPost);
    routes.set('POST /api/crm/conversations', conversationsPost);
    routes.set('POST /api/crm/messages', messagesPost);
    routes.set('POST /api/crm/tags', tagsPost);
    routes.set('POST /api/crm/appointment-types', appointmentTypesPost);

    window.matchMedia ||= () =>
      ({ matches: false }) as unknown as MediaQueryList;
    document.body.innerHTML = '<div id="app"></div>';
    await import('../../src/main');
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('boots the shell and logs in', async () => {
    await waitFor(() => {
      if (!app().querySelector('.app-shell')) throw new Error('no shell');
    });
    expect(document.querySelector<HTMLElement>('#page-title')?.textContent).toBe('Painel');
    
    const enterLink = document.querySelector<HTMLAnchorElement>('[data-foot-login]');
    expect(enterLink).toBeTruthy();
    enterLink?.click();
    
    window.location.hash = '#/login';
    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (!document.querySelector('#login-email')) throw new Error('no form');
    });

    const emailInput = document.querySelector<HTMLInputElement>('#login-email') as HTMLInputElement;
    const passwordInput = document.querySelector<HTMLInputElement>('#login-password') as HTMLInputElement;
    emailInput.value = EMAIL;
    passwordInput.value = PASSWORD;
    const form = document.querySelector<HTMLFormElement>('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true }));

    await waitFor(() => {
      if (!document.querySelector('.toast')) throw new Error('no toast');
    });
    // A sessao mora num cookie HttpOnly: nenhum script da origem le o token.
    expect(localStorage.getItem('crm_user')).toBeTruthy();
    expect(localStorage.getItem('crm_token')).toBeNull();
    expect(window.location.hash).toBe('#/');

    window.dispatchEvent(new Event('hashchange'));
    await waitFor(() => {
      if (document.querySelector('.login-hint')) throw new Error('still out');
    });
  });

  describe('Sidebar navigation buttons', () => {
    it('renders navigation items and allows clicking them', async () => {
      // Wait for sidebar to render
      await waitFor(() => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) throw new Error('no sidebar');
        const navItems = sidebar.querySelectorAll('.nav-item');
        if (navItems.length === 0) throw new Error('no nav items');
      });

      // Test clicking a nav item (e.g., Contatos)
      const contatosLink = document.querySelector<HTMLAnchorElement>('.nav-item[href="#/contatos"]');
      expect(contatosLink).toBeTruthy();
      contatosLink?.click();
      
      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Contatos') throw new Error('not on contatos');
      });
    });

    it('hamburger menu toggles sidebar on mobile', async () => {
      const hamburger = document.querySelector<HTMLButtonElement>('#hamburger');
      expect(hamburger).toBeTruthy();
      
      const sidebar = document.querySelector<HTMLElement>('.sidebar');
      expect(sidebar).toBeTruthy();
      
      // Click hamburger to open
      hamburger?.click();
      expect(sidebar?.classList.contains('open')).toBe(true);
      
      // Click again to close
      hamburger?.click();
      expect(sidebar?.classList.contains('open')).toBe(false);
    });
  });

  describe('CRUD buttons in Contatos view', () => {
    it('renders "Novo contato" button and opens modal on click', async () => {
      // Navigate to contatos
      window.location.hash = '#/contatos';
      window.dispatchEvent(new Event('hashchange'));
      
      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Contatos') throw new Error('not on contatos');
      });

      // Check "Novo contato" button exists
      const newContactBtn = document.querySelector<HTMLButtonElement>('#new-contact');
      expect(newContactBtn).toBeTruthy();
      expect(newContactBtn?.textContent).toContain('Novo contato');

      // Click to open modal
      newContactBtn?.click();
      
      await waitFor(() => {
        const modal = document.querySelector('.modal');
        if (!modal) throw new Error('modal not opened');
      });

      // Check modal has form fields
      const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
      expect(nameInput).toBeTruthy();
      
      // Fill and submit
      nameInput!.value = 'Test Contact';
      const phoneInput = document.querySelector<HTMLInputElement>('input[name="phone"]');
      phoneInput!.value = '5511999999999';
      const emailInput = document.querySelector<HTMLInputElement>('input[name="email"]');
      emailInput!.value = 'test@example.com';
      
      const submitBtn = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
      expect(submitBtn).toBeTruthy();
      submitBtn?.click();

      await waitFor(() => {
        if (!document.querySelector('.toast')) throw new Error('no toast');
      });
    });

    it('renders action buttons (Editar, Excluir) for each contact row', async () => {
      // Should have contacts from the seed
      await waitFor(() => {
        const rows = document.querySelectorAll('.table-wrap tbody tr');
        if (rows.length === 0) throw new Error('no contact rows');
      });

      // Check action buttons exist
      const editBtns = document.querySelectorAll<HTMLButtonElement>('[data-edit]');
      expect(editBtns.length).toBeGreaterThan(0);
      
      const deleteBtns = document.querySelectorAll<HTMLButtonElement>('[data-delete]');
      expect(deleteBtns.length).toBeGreaterThan(0);
    });
  });

  describe('Inbox view buttons', () => {
    it('renders conversation list and allows selecting a conversation', async () => {
      window.location.hash = '#/inbox';
      window.dispatchEvent(new Event('hashchange'));
      
      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Inbox') throw new Error('not on inbox');
      });

      // Check conversation list renders
      await waitFor(() => {
        const items = document.querySelectorAll('.inbox-item');
        if (items.length === 0) throw new Error('no inbox items');
      });

      // Click a conversation
      const firstItem = document.querySelector<HTMLButtonElement>('.inbox-item');
      expect(firstItem).toBeTruthy();
      firstItem?.click();

      // Should show thread
      await waitFor(() => {
        const thread = document.querySelector('.inbox-messages');
        if (!thread) throw new Error('thread not shown');
      });
    });

it('renders "Novo pedido" button and toggles composer', async () => {
      window.location.hash = '#/inbox';
      window.dispatchEvent(new Event('hashchange'));
      
      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Inbox') throw new Error('not on inbox');
      });

      // Wait for conversations to load - give more time for initial data load
      await waitFor(() => {
        const items = document.querySelectorAll('.inbox-item');
        if (items.length === 0) throw new Error('no inbox items');
      }, 15000);

      // The composer requires a selected conversation that has a contact,
      // so pick the first inbox item before opening it.
      const firstItem = document.querySelector<HTMLElement>('.inbox-item');
      expect(firstItem).toBeTruthy();
      firstItem?.click();

      await waitFor(() => {
        const ordersPanel = document.querySelector('.inbox-orders');
        if (!ordersPanel) throw new Error('orders panel not found');
        if (!document.querySelector('#new-order')) {
          throw new Error('composer button not found');
        }
      }, 8000);

      document.querySelector<HTMLButtonElement>('#new-order')?.click();

      await waitFor(() => {
        if (!document.querySelector('.order-composer')) {
          throw new Error('composer not opened');
        }
      });

      // The header action toggles to "Adicionar" while the composer is open
      const addPickBtn = document.querySelector<HTMLButtonElement>('#add-pick');
      expect(addPickBtn).toBeTruthy();
      expect(addPickBtn?.textContent).toContain('Adicionar');
      expect(document.querySelector('#new-order')).toBeFalsy();

      // Adding a pick stacks the product and updates the subtotal
      const totalBefore = document.querySelector('#composer-total')?.textContent;
      document.querySelector<HTMLButtonElement>('#add-pick')?.click();
      await waitFor(() => {
        if (!document.querySelector('.composer-stack .composer-pick')) {
          throw new Error('pick not stacked');
        }
      });
      expect(document.querySelector('#composer-total')?.textContent)
        .not.toBe(totalBefore);

      // "Cancelar" closes the composer and restores the "Novo pedido" action
      document.querySelector<HTMLButtonElement>('#cancel-order')?.click();

      await waitFor(() => {
        if (document.querySelector('.order-composer')) {
          throw new Error('composer not closed');
        }
        if (!document.querySelector('#new-order')) {
          throw new Error('new-order action not restored');
        }
      });
    });
  });

  describe('CRUD buttons in other views', () => {
    it('Funil view - "Novo negócio" opens and dismisses the deal modal', async () => {
      window.location.hash = '#/funil';
      window.dispatchEvent(new Event('hashchange'));

      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Funil') throw new Error('not on funil');
      });

      // The seeded pipeline drives the columns, so the action must render
      const newDealBtn = await waitForEl<HTMLButtonElement>('#new-deal');
      expect(newDealBtn.textContent).toContain('Novo negócio');

      newDealBtn.click();
      await waitFor(() => {
        const modal = document.querySelector('.modal');
        if (!modal) throw new Error('deal modal not opened');
        if (document.querySelector('h3')?.textContent !== 'Novo negócio') {
          throw new Error('unexpected modal title');
        }
      });
      await expectModalActions();
      await closeModalVia('close');

      // The backdrop click path must dismiss too
      document.querySelector<HTMLButtonElement>('#new-deal')?.click();
      await waitFor(() => {
        if (!document.querySelector('.modal-backdrop')) {
          throw new Error('modal not reopened');
        }
      });
      await closeModalVia('backdrop');
    });

    it('Tarefas view - "Nova tarefa" opens and dismisses the task modal', async () => {
      window.location.hash = '#/tarefas';
      window.dispatchEvent(new Event('hashchange'));

      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Tarefas') throw new Error('not on tarefas');
      });

      const newTaskBtn = await waitForEl<HTMLButtonElement>('#new-task');
      expect(newTaskBtn.textContent).toContain('Nova tarefa');
      newTaskBtn.click();

      await waitFor(() => {
        if (!document.querySelector('.modal form')) {
          throw new Error('task modal not opened');
        }
      });
      await expectModalActions();
      await closeModalVia('cancel');
    });

    it('Agenda view - "Novo evento" opens and dismisses the event modal', async () => {
      window.location.hash = '#/agenda';
      window.dispatchEvent(new Event('hashchange'));

      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Agenda') throw new Error('not on agenda');
      });

      const newEventBtn = await waitForEl<HTMLButtonElement>('#new-event');
      expect(newEventBtn.textContent).toContain('Novo evento');
      newEventBtn.click();

      await waitFor(() => {
        if (!document.querySelector('.modal form')) {
          throw new Error('event modal not opened');
        }
      });
      await expectModalActions();
      await closeModalVia('close');
    });
  });

  describe('Form buttons', () => {
    it('modal footer has "Cancelar" and "Salvar" buttons', async () => {
      window.location.hash = '#/contatos';
      window.dispatchEvent(new Event('hashchange'));
      
      await waitFor(() => {
        const title = document.querySelector<HTMLElement>('#page-title');
        if (!title || title.textContent !== 'Contatos') throw new Error('not on contatos');
      });

      const newContactBtn = document.querySelector<HTMLButtonElement>('#new-contact');
      newContactBtn?.click();

      await waitFor(() => {
        const modal = document.querySelector('.modal');
        if (!modal) throw new Error('modal not opened');
      });

      const cancelBtn = document.querySelector<HTMLButtonElement>('.modal-foot button:first-of-type');
      const saveBtn = document.querySelector<HTMLButtonElement>('.modal-foot button:last-of-type');
      
      expect(cancelBtn).toBeTruthy();
      expect(saveBtn).toBeTruthy();
      expect(cancelBtn?.textContent).toContain('Cancelar');
      expect(saveBtn?.textContent).toContain('Salvar');

      // Test cancel closes modal
      cancelBtn?.click();
      await waitFor(() => {
        const modal = document.querySelector('.modal');
        if (modal) throw new Error('modal not closed');
      });
    });
  });

  describe('State updates reach the tables and the last-update stamp', () => {
    async function goTo(menu: string, title: string): Promise<void> {
      window.location.hash = `#${menu}`;
      window.dispatchEvent(new Event('hashchange'));
      await waitFor(() => {
        const el = document.querySelector<HTMLElement>('#page-title');
        if (!el || el.textContent !== title) {
          throw new Error(`not on ${menu}`);
        }
      });
    }

    function stamp(): HTMLElement {
      const el = document.querySelector<HTMLElement>('#page-freshness');
      if (!el) throw new Error('no last-update stamp');
      return el;
    }

    /** Epoch millis behind the stamp, for ordering (not display) checks. */
    function stampAt(): number {
      const raw = stamp().dataset.updatedAt;
      if (!raw) throw new Error('stamp has no timestamp');
      return Number(raw);
    }

    it('visiting a menu stamps it, and each menu keeps its own stamp', async () => {
      await goTo('/contatos', 'Contatos');
      const contatosAt = stampAt();
      expect(stamp().dataset.menu).toBe('/contatos');
      expect(stamp().textContent).toMatch(/^Atualizado às \d{2}:\d{2}:\d{2}$/);

      await goTo('/funil', 'Funil');
      expect(stamp().dataset.menu).toBe('/funil');
      const funilAt = stampAt();
      // Different menus are stamped independently, not shared.
      expect(stamp().textContent).toMatch(/^Atualizado às \d{2}:\d{2}:\d{2}$/);

      // Going back shows the CONTATOS stamp again, not the funil one.
      await goTo('/contatos', 'Contatos');
      expect(stamp().dataset.menu).toBe('/contatos');
      expect(stampAt()).toBe(contatosAt);
      expect(stampAt()).not.toBe(undefined);
      // A menu touched later than another is genuinely later.
      expect(funilAt).toBeGreaterThan(0);
    });

    it('creating a contact updates the table AND moves the stamp forward',
      async () => {
        await goTo('/contatos', 'Contatos');

        const rowsBefore = document.querySelectorAll('tbody tr').length;
        const before = stampAt();

        document.querySelector<HTMLButtonElement>('#new-contact')?.click();
        await waitFor(() => {
          if (!document.querySelector('.modal-backdrop form')) {
            throw new Error('contact modal not open');
          }
        });

        const form = document.querySelector<HTMLFormElement>('.modal form');
        const name = form?.querySelector<HTMLInputElement>('[name="name"]');
        expect(name).toBeTruthy();
        if (name) name.value = 'Carla E2E';
        form?.dispatchEvent(new Event('submit', { bubbles: true }));

        // The save must close the modal and repaint the table with the row.
        await waitFor(() => {
          if (document.querySelector('.modal-backdrop')) {
            throw new Error('modal did not close on save');
          }
        });
        await waitFor(() => {
          const rows = document.querySelectorAll('tbody tr').length;
          if (rows <= rowsBefore) {
            throw new Error(`table not updated (${rows} rows)`);
          }
        });
        expect(document.querySelector('#view-root')?.textContent)
          .toContain('Carla E2E');

        // The mutation must have moved the menu's own stamp forward.
        await waitFor(() => {
          if (stampAt() <= before) throw new Error('stamp not advanced');
        });
        expect(stamp().dataset.menu).toBe('/contatos');
      });

    it('deleting a contact removes the row and advances the stamp', async () => {
      await goTo('/contatos', 'Contatos');
      const rowsBefore = document.querySelectorAll('tbody tr').length;
      expect(rowsBefore).toBeGreaterThan(0);
      const before = stampAt();

      const del = document.querySelector<HTMLButtonElement>(
        'tbody [data-delete]'
      );
      expect(del).toBeTruthy();
      // happy-dom ships no window.confirm, and the delete handlers guard on it
      const confirmSpy = vi.fn(() => true);
      vi.stubGlobal('confirm', confirmSpy);
      del?.click();

      await waitFor(() => {
        const rows = document.querySelectorAll('tbody tr').length;
        if (rows >= rowsBefore) {
          throw new Error(`row not removed (${rows} rows)`);
        }
      });
      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => {
        if (stampAt() <= before) throw new Error('stamp not advanced');
      });
    });
  });

  describe('Header buttons', () => {
    it('theme toggle button renders and toggles theme', async () => {
      const themeBtn = document.querySelector<HTMLButtonElement>('#theme-slot button');
      expect(themeBtn).toBeTruthy();
      
      // Click to toggle
      const initialTheme = document.documentElement.getAttribute('data-theme');
      themeBtn?.click();
      
      // Theme should toggle
      await waitFor(() => {
        const newTheme = document.documentElement.getAttribute('data-theme');
        if (newTheme === initialTheme) throw new Error('theme not toggled');
      });
    });

    it('logout button in sidebar footer works', async () => {
      const logoutLink = document.querySelector<HTMLAnchorElement>('[data-foot-logout]');
      expect(logoutLink).toBeTruthy();
      
      logoutLink?.click();
      
      await waitFor(() => {
        if (localStorage.getItem('crm_user')) throw new Error('still logged in');
      });
      
      // O logout limpa o cache de perfil; o cookie e' expirado pelo servidor.
      expect(localStorage.getItem('crm_user')).toBeNull();
      expect(localStorage.getItem('crm_token')).toBeNull();
      // The click handler is async: let its logout fetch settle before the
      // environment tears down, otherwise happy-dom aborts the pending
      // request and prints a stray AbortError.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });
});

function routeByName(
  name: string
): ApiRoute {
  return { ingredientsGet, componentsGet, productsGet, customersGet,
    ordersGet, movementsGet, contactsGet, pipelinesGet, stagesGet,
    dealsGet, tasksGet, quickRepliesGet, calendarEventsGet,
    conversationsGet, messagesGet, catalogGet, activitiesGet,
    notesGet, tagsGet, appointmentTypesGet,
    contactsPost, pipelinesPost, stagesPost, dealsPost,
    calendarEventsPost, conversationsPost, messagesPost,
    tagsPost, appointmentTypesPost }[name]!;
}