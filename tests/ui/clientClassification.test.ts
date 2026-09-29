// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message, Pipeline,
  QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type {
  Customer, Order, OrderLine, OrderStatus, Product
} from '../../src/domain/types';
import { CrmService } from '../../src/services/CrmService';
import { OrderService } from '../../src/services/OrderService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmInboxView } from '../../src/ui/views/crm/CrmInboxView';
import { qs } from '../../src/ui/dom';

const refreshHook = vi.hoisted(() => ({
  fn: null as (() => Promise<void>) | null
}));

vi.mock('../../src/ui/realtimeRefresh', () => ({
  startRealtimeRefresh: (fn: () => Promise<void>) => {
    refreshHook.fn = fn;
    return () => {};
  }
}));

vi.mock('../../src/ui/Toast', () => ({ showToast: vi.fn() }));

const NOW = '2026-09-20T10:00:00.000Z';

function line(name: string, qty: number, unitPrice: number): OrderLine {
  return { productId: name, productName: name, qty, unitPrice };
}

function order(
  id: string,
  name: string,
  createdAt: string,
  status: OrderStatus,
  lines: OrderLine[] = []
): Order {
  return {
    id, customerId: name, customerName: name, lines,
    deliveryDate: '2026-01-24', status, paymentStatus: 'a_pagar',
    notes: '', stockDeducted: false, createdFrom: '', createdAt
  };
}

function contact(id: string, name: string, phone: string): Contact {
  return {
    id, name, phone, email: '', notes: '', tags: [], assignedUserId: '',
    createdAt: NOW
  };
}

function conversation(id: string, contactId: string): Conversation {
  return {
    id, contactId, channel: 'whatsapp', channelPhone: '5511999990000',
    lastMessageAt: NOW, assignedUserId: '', status: 'open',
    snoozedUntil: '', createdAt: NOW
  };
}

function product(id: string, name: string): Product {
  return {
    id, name, category: 'Doces', yieldUnits: 1, prepTime: 60,
    labor: { salary: 1800, daysPerMonth: 24, hoursPerDay: 8 },
    fixedExpenses: { rent: 800, energy: 250, water: 90,
      internet: 120, office: 60, mei: 76 },
    variablePercent: 10, markupPercent: 70, items: []
  };
}

const SUGGESTED_BY_NAME: Record<string, number> = {
  'Docinhos (centena)': 130,
  'Bolo de limão': 89.9,
  'Bolo de casamento (2 andares)': 650
};

const pricing = {
  productPricing: (p: Product) => ({
    suggestedPrice: SUGGESTED_BY_NAME[p.name],
    unitPrice: SUGGESTED_BY_NAME[p.name]
  })
} as unknown as AppContext['pricing'];

// Ana's orders add up to exactly 1000, so her top order sits at exactly 80%
// of her value (class A). Carla has a single order (also A); Zeca has none.
const ORDER_SEEDS: Order[] = [
  order('ana-26-a', 'Ana Beatriz', '2026-01-15T10:00:00.000Z',
    'pendente', [line('Bolo de casamento (2 andares)', 1, 800)]),
  order('ana-25-e', 'Ana Beatriz', '2025-05-01T10:00:00.000Z',
    'entregue', [line('Docinhos (centena)', 1, 150)]),
  order('ana-25-a', 'Ana Beatriz', '2025-11-10T10:00:00.000Z',
    'producao', [line('Bolo de limão', 1, 50)]),
  order('carla-24-c', 'Carla Menezes', '2024-03-05T10:00:00.000Z',
    'cancelado', [line('Docinhos (centena)', 1, 130)]),
  order('renata-24', 'Renata Vaz', '2026-01-20T10:00:00.000Z', 'cancelado')
];

function buildCtx(): { ctx: AppContext; root: HTMLElement } {
  const contacts = InMemoryRepository.seeded<Contact>([
    contact('p1', 'Ana Beatriz', '5511999990001'),
    contact('p2', 'Carla Menezes', '5511999990002'),
    contact('p3', 'Zeca', '5511999990003')
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    conversation('conv-1', 'p1'),
    conversation('conv-2', 'p2'),
    conversation('conv-3', 'p3')
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'oi ana', createdBy: '', createdAt: NOW },
    { id: 'm2', conversationId: 'conv-2', direction: 'inbound',
      text: 'oi carla', createdBy: '', createdAt: NOW }
  ]);
  const orders = InMemoryRepository.seeded<Order>(ORDER_SEEDS);
  const customers = InMemoryRepository.seeded<Customer>([
    { id: 'seed-customer-ana', name: 'Ana Beatriz',
      phone: '5511999990001', email: '', notes: '' }
  ]);
  const products = InMemoryRepository.seeded<Product>([
    product('cat-docinhos', 'Docinhos (centena)'),
    product('cat-bolo-limao', 'Bolo de limão'),
    product('cat-bolo-casamento', 'Bolo de casamento (2 andares)')
  ]);
  const orderService = new OrderService(
    orders, { deductForOrder: vi.fn() } as never
  );
  const quickReplies = InMemoryRepository.seeded<QuickReply>([]);
  const crm = new CrmService({
    contacts, conversations, messages, quickReplies,
    pipelines: InMemoryRepository.seeded<Pipeline>([]),
    stages: InMemoryRepository.seeded<Stage>([]),
    deals: InMemoryRepository.seeded<Deal>([]),
    tasks: InMemoryRepository.seeded<Task>([]),
    events: InMemoryRepository.seeded<CalendarEvent>([]),
    catalog: InMemoryRepository.seeded<CatalogProduct>([]),
    activities: InMemoryRepository.seeded<CrmActivity>([]),
    notes: InMemoryRepository.seeded<ConversationNote>([]),
    appointmentTypes: InMemoryRepository.seeded<AppointmentType>([]),
    tags: InMemoryRepository.seeded<Tag>([])
  });
  const auth = {
    currentUser: () => ({ id: 'u1' })
  } as unknown as AppContext['auth'];
  const ctx = {
    crm, conversations, messages, contacts, quickReplies, orders,
    order: orderService, customers, products, pricing, auth,
    whatsapp: { sendText: vi.fn(async () => undefined) }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  // activeId is module-level and leaks across tests (earlier tests switch
  // contact), so every scenario starts pinned to the Ana conversation.
  qs<HTMLElement>('[data-open="conv-1"]', root).click();
  return { ctx, root };
}

const globalCss = readFileSync('src/styles/global.css', 'utf8');

function cssRule(selector: string): string {
  return globalCss.match(
    new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`)
  )?.[0] ?? '';
}

describe('Inbox client ABC classification badge', () => {
  it('renders the tier in front of the Caixa de entrada heading', () => {
    const { root } = buildCtx();
    const head = qs<HTMLElement>('.section-head', root).innerHTML;
    const badge = qs<HTMLElement>('.client-class', root);
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Cliente A');
    expect(head.indexOf('client-class')).toBeLessThan(
      head.indexOf('Caixa de entrada'));
    expect(qs<HTMLElement>('.section-title', root)).not.toBeNull();
  });

  it('labels Ana (top order at 80%) as tier A with its own color', () => {
    const { root } = buildCtx();
    const badge = qs<HTMLElement>('.client-class', root);
    expect(badge.classList.contains('client-class-a')).toBe(true);
    expect(cssRule('.client-class-a')).toContain('var(--color-success-bg)');
    expect(cssRule('.client-class')).toContain('font-size: 16px');
    expect(cssRule('.client-class')).toContain('font-weight: 800');
  });

  it('recomputes the tier when switching to another contact', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-open="conv-2"]', root).click();
    const badge = qs<HTMLElement>('.client-class', root);
    expect(badge.textContent).toBe('Cliente A');
    qs<HTMLElement>('[data-open="conv-3"]', root).click();
    expect(root.querySelector('.client-class')).toBeNull();
  });

  it('defines the three tier colors in the stylesheet', () => {
    expect(cssRule('.client-class-b')).toContain('var(--color-info-bg)');
    expect(cssRule('.client-class-c')).toContain('var(--color-error-bg)');
  });
});