// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  AppointmentType, CalendarEvent, CatalogProduct, Contact,
  Conversation, ConversationNote, CrmActivity, Deal, Message, Pipeline,
  QuickReply, Stage, Tag, Task
} from '../../src/domain/crm';
import type { Customer, Order, OrderLine, Product } from '../../src/domain/types';
import { CrmService } from '../../src/services/CrmService';
import { OrderService } from '../../src/services/OrderService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderCrmInboxView } from '../../src/ui/views/crm/CrmInboxView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/realtimeRefresh', () => ({
  startRealtimeRefresh: () => () => {}
}));

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

const { showToast } = await import('../../src/ui/Toast');

const NOW = '2026-09-20T10:00:00.000Z';

function line(name: string, qty: number, unitPrice: number): OrderLine {
  return { productId: name, productName: name, qty, unitPrice };
}

function order(
  id: string,
  customerName: string,
  createdAt: string,
  lines: OrderLine[]
): Order {
  return {
    id,
    customerId: customerName,
    customerName,
    lines,
    deliveryDate: '2026-02-24',
    status: 'pendente',
    paymentStatus: 'a_pagar',
    notes: '',
    stockDeducted: false,
    createdFrom: '',
    createdAt
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

function buildCtx(): {
  ctx: AppContext;
  root: HTMLElement;
} {
  const contacts = InMemoryRepository.seeded<Contact>([
    contact('p1', 'Ana Beatriz', '5511999990001'),
    contact('p2', 'Carla Menezes', '5511999990002')
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    conversation('conv-1', 'p1'),
    conversation('conv-2', 'p2')
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'oi ana', createdBy: '', createdAt: NOW },
    { id: 'm2', conversationId: 'conv-2', direction: 'inbound',
      text: 'oi carla', createdBy: '', createdAt: NOW }
  ]);
  const customers = InMemoryRepository.seeded<Customer>([
    { id: 'seed-customer-ana', name: 'Ana Beatriz',
      phone: '5511999990001', email: '', notes: '' }
  ]);
  const products = InMemoryRepository.seeded<Product>([
    product('cat-docinhos', 'Docinhos (centena)'),
    product('cat-bolo-limao', 'Bolo de limão'),
    product('cat-bolo-casamento', 'Bolo de casamento (2 andares)')
  ]);
  const orders = InMemoryRepository.seeded<Order>([
    order('oana-old', 'Ana Beatriz', '2026-01-06T08:00:00.000Z',
      [line('Docinhos (centena)', 2, 130)]),
    order('oana-new', 'Ana Beatriz', '2026-01-19T09:30:00.000Z',
      [line('Bolo de limão', 1, 89.9)])
  ]);
  const orderService = new OrderService(
    orders, { deductForOrder: vi.fn() } as never
  );
  const quickReplies = InMemoryRepository.seeded<QuickReply>([]);
  const crm = new CrmService({
    contacts,
    conversations,
    messages,
    quickReplies,
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
    crm,
    conversations,
    messages,
    contacts,
    quickReplies,
    orders,
    order: orderService,
    customers,
    products,
    pricing,
    auth,
    whatsapp: { sendText: vi.fn(async () => undefined) }
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderCrmInboxView(root, ctx);
  resetToHistory(root);
  return { ctx, root };
}

// The composer lives in module-level state, so a test always starts from the
// history view by cancelling any leftover composer first.
function resetToHistory(root: HTMLElement): void {
  const cancel = root.querySelector<HTMLElement>('#cancel-order');
  if (cancel) cancel.click();
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function openComposer(root: HTMLElement): void {
  qs<HTMLElement>('#new-order', root).click();
}

// The composer re-renders on every change, replacing the picker DOM nodes,
// so each add re-queries the live select before clicking.
function addProduct(root: HTMLElement, productId: string): void {
  const select = qs<HTMLSelectElement>('#product-pick', root);
  select.value = productId;
  qs<HTMLElement>('#add-pick', root).click();
}

// The stack re-renders after every change, so the stepper button is queried
// fresh on each bump (the rows keep their order during a counter change).
function bumpUnit(
  root: HTMLElement, index: number, delta: number
): void {
  const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
  const sel = delta > 0 ? '[data-qty-up]' : '[data-qty-down]';
  rows[index].querySelector<HTMLElement>(sel)!.click();
}

function panel(root: HTMLElement): HTMLElement {
  return qs<HTMLElement>('.inbox-orders', root);
}

// happy-dom does not resolve layout from external stylesheets, so the CSS
// contract for the composer is verified against the stylesheet itself.
const globalCss = readFileSync('src/styles/global.css', 'utf8');

function subtotalClass(): string {
  return '.composer-subtotal';
}

function cssRule(selector: string): string {
  const rule = globalCss.match(
    new RegExp(`${selector}\\s*\\{[^}]*\\}`)
  )?.[0];
  return rule ?? '';
}

describe('Inbox "Novo pedido" composer', () => {
  it('shows a "+ Novo pedido" action on the Pedidos header', () => {
    const { root } = buildCtx();
    const btn = qs<HTMLElement>('#new-order', root);
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Novo pedido');
    expect(panel(root).textContent).toContain('Pedidos');
  });

  it('opens the composer and hides the order history while composing', () => {
    const { root } = buildCtx();
    expect(root.querySelector('.order-composer')).toBeNull();
    openComposer(root);
    const body = panel(root);
    expect(qs<HTMLElement>('.order-composer', body)).not.toBeNull();
    expect(body.querySelectorAll('.order-card')).toHaveLength(0);
    expect(qs<HTMLSelectElement>('#product-pick', body).options).toHaveLength(3);
  });

  it('keeps "+ Novo pedido" on the opposite side of the PEDIDOS title',
    () => {
      const { root } = buildCtx();
      const head = qs<HTMLElement>('.inbox-orders .inbox-list-head', root);
      const btn = qs<HTMLElement>('#new-order', root);
      expect(head.firstElementChild?.textContent).toContain('Pedidos');
      expect(head.lastElementChild).toBe(btn);
      expect(head.contains(btn)).toBe(true);
      expect(cssRule('.inbox-list-head'))
        .toMatch(/justify-content:\s*space-between/);
      expect(cssRule('.inbox-new-order')).toMatch(/margin-left:\s*auto/);
      expect(root.querySelector('.composer-add-bar')).toBeNull();
    });

  it('toggles the action to "+ Adicionar" beside the PEDIDOS title',
    () => {
      const { root } = buildCtx();
      openComposer(root);
      expect(root.querySelector('#new-order')).toBeNull();
      const head = qs<HTMLElement>('.inbox-orders .inbox-list-head', root);
      const add = qs<HTMLElement>('#add-pick', root);
      expect(add.textContent).toContain('Adicionar');
      expect(head.firstElementChild?.textContent).toBe('Pedidos');
      expect(head.lastElementChild).toBe(add);
      expect(head.contains(add)).toBe(true);
      expect(root.querySelector('.composer-add-bar')).toBeNull();
      qs<HTMLElement>('#cancel-order', root).click();
      expect(root.querySelector('#add-pick')).toBeNull();
      expect(qs<HTMLElement>('#new-order', root)).not.toBeNull();
    });

  it('loads every product from the Produtos menu with its value', () => {
    const { root } = buildCtx();
    openComposer(root);
    const select = qs<HTMLSelectElement>('#product-pick', root);
    const options = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(options).toContain('Docinhos (centena) — R$\u00A0130,00');
    expect(options).toContain('Bolo de limão — R$\u00A089,90');
    expect(options).toContain(
      'Bolo de casamento (2 andares) — R$\u00A0650,00'
    );
    resetToHistory(root);
  });

  it('stacks the picked products as a LIFO queue (newest on top)', () => {
    const { root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    addProduct(root, 'cat-bolo-limao');
    const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Bolo de limão');
    expect(rows[1].textContent).toContain('Docinhos (centena)');
    resetToHistory(root);
  });

  it('bumps the counter of a repeated product instead of duplicating it',
    () => {
      const { root } = buildCtx();
      openComposer(root);
      addProduct(root, 'cat-bolo-limao');
      addProduct(root, 'cat-bolo-limao');
      const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
      expect(rows).toHaveLength(1);
      expect(rows[0].querySelector('.composer-qty-value')?.textContent)
        .toBe('2×');
      expect(rows[0].querySelector('.composer-pick-value')?.textContent?.trim())
        .toBe('R$\u00A0179,80');
      expect(qs<HTMLElement>('#composer-total', root).textContent)
        .toBe('R$\u00A0179,80');
      resetToHistory(root);
    });

  it('steppers a unit counter and multiply it into the subtotal', () => {
    const { root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    addProduct(root, 'cat-bolo-limao');
    bumpUnit(root, 1, 1);
    bumpUnit(root, 1, 1);
    const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
    expect(rows[1].textContent).toContain('3×');
    expect(rows[1].textContent).toContain('R$\u00A0390,00');
    expect(qs<HTMLElement>('#composer-total', root).textContent)
      .toBe('R$\u00A0479,90');
    bumpUnit(root, 1, -1);
    expect(qs<HTMLElement>('#composer-total', root).textContent)
      .toBe('R$\u00A0349,90');
    resetToHistory(root);
  });

  it('clamps a unit counter at one, never removing the row', () => {
    const { root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    bumpUnit(root, 0, -1);
    const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.composer-qty-value')?.textContent)
      .toBe('1×');
    expect(qs<HTMLElement>('#composer-total', root).textContent)
      .toBe('R$\u00A0130,00');
    resetToHistory(root);
  });

  it('shows the subtotal at the bottom, absolutely over the stack', () => {
    const { root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    addProduct(root, 'cat-bolo-limao');
    const wrap = qs<HTMLElement>('.composer-stack-wrap', root);
    const subtotal = qs<HTMLElement>('.composer-subtotal', root);
    expect(subtotal).not.toBeNull();
    expect(subtotal.textContent).toContain('Subtotal');
    expect(subtotal.textContent).toContain('R$\u00A0219,90');
    expect(wrap.contains(subtotal)).toBe(true);
    expect(subtotal.classList.contains('composer-subtotal')).toBe(true);
    expect(cssRule(subtotalClass())).toMatch(/position:\s*absolute/);
    resetToHistory(root);
  });

  it('removes a pick and recomputes the subtotal', () => {
    const { root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    addProduct(root, 'cat-bolo-limao');
    addProduct(root, 'cat-bolo-casamento');
    const rows = root.querySelectorAll<HTMLElement>('.composer-pick');
    rows[0].querySelector<HTMLElement>('.composer-pick-remove')!.click();
    expect(root.querySelectorAll('.composer-pick')).toHaveLength(2);
    expect(qs<HTMLElement>('#composer-total', root).textContent)
      .toBe('R$\u00A0219,90');
    resetToHistory(root);
  });

  it('finishes the order, then re-shows the updated history on top', async () => {
    const { ctx, root } = buildCtx();
    openComposer(root);
    addProduct(root, 'cat-docinhos');
    addProduct(root, 'cat-bolo-limao');
    bumpUnit(root, 1, 1);
    qs<HTMLElement>('#finish-order', root).click();
    await flush();
    const body = panel(root);
    expect(body.querySelector('.order-composer')).toBeNull();
    const cards = body.querySelectorAll<HTMLElement>('.order-card');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0].textContent).toContain('2× Docinhos (centena)');
    expect(cards[0].textContent).toContain('Bolo de limão');
    const created = ctx.orders.getAll()[ctx.orders.getAll().length - 1];
    expect(created.createdFrom).toBe('inbox');
    expect(created.customerId).toBe('seed-customer-ana');
    expect(created.lines).toHaveLength(2);
    expect(created.lines[0]).toMatchObject({
      productName: 'Bolo de limão', qty: 1
    });
    expect(created.lines[1]).toMatchObject({
      productName: 'Docinhos (centena)', qty: 2
    });
    expect(showToast).toHaveBeenCalledWith('Pedido criado');
  });

  it('does not finish with an empty pick stack', async () => {
    const { ctx, root } = buildCtx();
    const before = ctx.orders.getAll().length;
    openComposer(root);
    qs<HTMLElement>('#finish-order', root).click();
    await flush();
    expect(showToast).toHaveBeenCalledWith('Adicione ao menos um produto');
    expect(ctx.orders.getAll()).toHaveLength(before);
    expect(qs<HTMLElement>('.order-composer', root)).not.toBeNull();
    resetToHistory(root);
  });

  it('cancels the composer and returns to the order history', () => {
    const { root } = buildCtx();
    openComposer(root);
    expect(root.querySelectorAll('.order-card')).toHaveLength(0);
    qs<HTMLElement>('#cancel-order', root).click();
    expect(root.querySelector('.order-composer')).toBeNull();
    const cards = root.querySelectorAll<HTMLElement>('.order-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Bolo de limão');
  });

  it('refuses to compose while the Produtos menu has no products', () => {
    const { ctx, root } = buildCtx();
    (ctx as unknown as { products: InMemoryRepository<Product> }).products =
      InMemoryRepository.seeded<Product>([]);
    qs<HTMLElement>('#new-order', root).click();
    expect(showToast).toHaveBeenCalledWith(
      'Cadastre produtos no menu Produtos primeiro'
    );
    const body = panel(root);
    expect(body.querySelector('.order-composer')).toBeNull();
    expect(body.querySelectorAll('.order-card')).toHaveLength(2);
  });
});