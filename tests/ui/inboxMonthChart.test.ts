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
import {
  inboxMonthChartHtml, monthChartLabel
} from '../../src/ui/views/crm/inboxMonthChart';
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
// Same default the view uses: the calendar month of "today".
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

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

// Seeds deliberately contain NO order in the current month, so the chart
// starts on the (empty) current month by default and stays deterministic
// regardless of the date the tests run.
const ORDER_SEEDS: Order[] = [
  order('ana-25-e', 'Ana Beatriz', '2025-05-01T10:00:00.000Z',
    'entregue', [line('Docinhos (centena)', 2, 130)]),
  order('ana-26-a', 'Ana Beatriz', '2026-01-15T10:00:00.000Z',
    'pendente', [line('Bolo de limão', 1, 89.9)])
];

function buildCtx(): { ctx: AppContext; root: HTMLElement } {
  const contacts = InMemoryRepository.seeded<Contact>([
    contact('p1', 'Ana Beatriz', '5511999990001'),
    contact('p3', 'Zeca', '5511999990003')
  ]);
  const conversations = InMemoryRepository.seeded<Conversation>([
    conversation('conv-1', 'p1'),
    conversation('conv-3', 'p3')
  ]);
  const messages = InMemoryRepository.seeded<Message>([
    { id: 'm1', conversationId: 'conv-1', direction: 'inbound',
      text: 'oi ana', createdBy: '', createdAt: NOW }
  ]);
  const orders = InMemoryRepository.seeded<Order>(ORDER_SEEDS);
  const customers = InMemoryRepository.seeded<Customer>([]);
  const products = InMemoryRepository.seeded<Product>([
    product('cat-docinhos', 'Docinhos (centena)'),
    product('cat-bolo-limao', 'Bolo de limão')
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
  qs<HTMLElement>('[data-open="conv-1"]', root).click();
  qs<HTMLElement>('[data-period="mes"]', root).click();
  // chartMonth is module-level and leaks between tests (previous test may
  // have picked another month), so every scenario starts pinned to the
  // current calendar month.
  pickMonth(root, CURRENT_MONTH);
  return { ctx, root };
}

function pickMonth(root: HTMLElement, value: string): void {
  const select = qs<HTMLSelectElement>('select.month-select', root);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectedMonth(root: HTMLElement): string {
  return qs<HTMLSelectElement>('select.month-select', root).value;
}

function monthChartHtml(root: HTMLElement): string {
  const section = root.querySelector('.month-chart');
  return section?.innerHTML ?? '';
}

const globalCss = readFileSync('src/styles/global.css', 'utf8');

function monthDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function tipText(html: string, day: string): string {
  const tip = monthDoc(html).querySelector<HTMLElement>(
    `.month-chart-col[data-key="${day}"] .inbox-chart-tip`);
  return tip?.textContent ?? '';
}

// Matches a rule by the FIRST selector even when several selectors are
// combined before the brace.
function rule(selector: string): string {
  return globalCss.match(
    new RegExp(`${selector.replace(/\./g, '\\.')}[^\\{]*\\{[^}]*\\}`)
  )?.[0] ?? '';
}

describe('Inbox month chart (all orders of the current month)', () => {
  it('renders second, inside the side-by-side charts grid', () => {
    const { root } = buildCtx();
    const html = root.innerHTML;
    const period = html.indexOf('inbox-chart--period');
    const month = html.indexOf('inbox-chart month-chart');
    const heading = html.indexOf('Caixa de entrada');
    expect(html.indexOf('class="inbox-charts"')).toBeGreaterThan(-1);
    expect(period).toBeGreaterThan(-1);
    expect(month).toBeGreaterThan(period);
    expect(month).toBeLessThan(heading);
    expect(root.querySelector('.inbox-charts')?.children.length).toBe(2);
  });

  it('lays the two charts side by side with clear padding', () => {
    const { root } = buildCtx();
    void root;
    const grid = rule('.inbox-charts');
    expect(grid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(grid).toContain('gap: var(--space-4)');
    const card = rule('.inbox-charts > *');
    expect(card).toContain('padding: var(--space-3)');
    // Responsive collapse keeps a single column under 1100px.
    const media = globalCss.match(
      /@media \(max-width: 1100px\)\s*\{[^}]*\}/g) ?? [];
    expect(media.some((block) =>
      block.includes('.inbox-charts') &&
      block.includes('grid-template-columns: 1fr')
    )).toBe(true);
  });

  it('shows a menu of every month with orders plus the current one', () => {
    const { root } = buildCtx();
    const options = [...root.querySelectorAll<HTMLOptionElement>(
      'select.month-select option')].map((o) => o.value);
    expect(options[0]).toBe(CURRENT_MONTH);
    expect(options).toContain('2026-01');
    expect(options).toContain('2025-05');
    expect(selectedMonth(root)).toBe(CURRENT_MONTH);
    expect(root.querySelector('.month-menu')?.getAttribute('role'))
      .toBe('group');
  });

  it('shows the empty card for the current month' +
    ' (seeds have no orders there)', () => {
    const { root } = buildCtx();
    expect(root.querySelector('.month-chart-bar')).toBeNull();
    expect(qs<HTMLElement>('.month-chart-empty', root).textContent)
      .toContain('Sem pedidos neste mês');
  });

  it('switches the shown month from the menu', () => {
    const { root } = buildCtx();
    pickMonth(root, '2026-01');
    expect(selectedMonth(root)).toBe('2026-01');
    expect(root.querySelector('.month-chart-empty')).toBeNull();
    expect(root.querySelectorAll('.month-chart-bar')).toHaveLength(1);
    expect(monthChartHtml(root)).toContain('janeiro 2026');
  });

  it('keeps the chosen month across a refresh redraw', async () => {
    const { root } = buildCtx();
    pickMonth(root, '2026-01');
    expect(selectedMonth(root)).toBe('2026-01');
    await refreshHook.fn?.();
    expect(selectedMonth(root)).toBe('2026-01');
    expect(root.querySelectorAll('.month-chart-bar')).toHaveLength(1);
  });

  it('keeps the month chart global — independent of the open contact', () => {
    const { root } = buildCtx();
    pickMonth(root, '2026-01');
    const before = monthChartHtml(root);
    expect(before).toContain('janeiro 2026');
    qs<HTMLElement>('[data-open="conv-3"]', root).click();
    expect(monthChartHtml(root)).toBe(before);
  });

  it('titles a month in Portuguese', () => {
    expect(monthChartLabel('2026-09')).toBe('setembro 2026');
    expect(monthChartLabel('2026-01')).toBe('janeiro 2026');
  });

  it('keeps the chart legends inside the plot, above the axis row', () => {
    const { root } = buildCtx();
    // Every card: a 170px plot whose legend is pinned inside it, BEFORE the
    // 18px axis row — so both legends sit on the same line above the bullets
    // instead of drifting below them.
    for (const card of root.querySelectorAll('.inbox-charts > *')) {
      const html = card.innerHTML;
      const open = html.indexOf('class="inbox-chart-plot"');
      const axis = Math.max(html.indexOf('inbox-chart-x"'),
        html.indexOf('period-chart-x"'), html.indexOf('month-chart-x"'));
      expect(open).toBeGreaterThan(-1);
      expect(axis).toBeGreaterThan(open);
      expect(html.slice(open, axis)).toContain('inbox-chart-legend');
      expect(rule('.inbox-chart-plot > .inbox-chart-legend'))
        .toContain('position: absolute');
    }
    for (const sel of ['.inbox-chart-x', '.period-chart-x', '.month-chart-x']) {
      expect(rule(sel)).toContain('height: 18px');
    }
  });
});

describe('inboxMonthChartHtml (direct)', () => {
  const monthOrders = [
    order('a', 'Ana Beatriz', '2026-09-02T09:00:00.000Z', 'entregue',
      [line('Docinhos (centena)', 2, 130)]),
    order('c', 'Carla Menezes', '2026-09-14T10:00:00.000Z', 'producao',
      [line('Bolo de limão', 2, 89.9)]),
    order('c2', 'Carla Menezes', '2026-09-14T18:00:00.000Z', 'cancelado',
      [line('Docinhos (centena)', 1, 130)]),
    order('o', 'Bruno Alves', '2026-10-01T10:00:00.000Z', 'pendente')
  ];

  it('buckets every customer by day and renders one bar per day', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    expect(monthDoc(html).querySelectorAll('.month-chart-col')).toHaveLength(2);
    expect(monthDoc(html).querySelectorAll('.month-chart-bar')).toHaveLength(2);
    expect(tipText(html, '2026-09-02')).toContain('1 pedido');
    expect(tipText(html, '2026-09-02')).toContain('260,00');
    expect(tipText(html, '2026-09-14')).toContain('2 pedidos');
    expect(tipText(html, '2026-09-14')).toContain('309,80');
  });

  it('excludes orders from other months', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    expect(html).not.toContain('2026-10-01');
  });

  it('shows the selected month in the subtitle and the legend', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    expect(html).toContain('setembro 2026 · todos os clientes');
    expect(html).toContain('3 pedidos');
  });

  it('builds the menu from the months that have orders', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    expect(html).toContain('setembro 2026</option>');
    expect(html).toContain('outubro 2026</option>');
    expect(monthDoc(html).querySelector(
      'select.month-select option[value="2026-09"]'
    )?.getAttribute('selected')).not.toBeNull();
  });

  it('keeps the selected month in the menu even with no orders', () => {
    const html = inboxMonthChartHtml([], '2026-08');
    expect(html).toContain('agosto 2026</option>');
    expect(html).toContain('month-chart-empty');
    expect(html).not.toContain('month-chart-bar');
  });

  it('draws a single order as one bar with a label', () => {
    const html = inboxMonthChartHtml([monthOrders[0]], '2026-09');
    expect(monthDoc(html).querySelectorAll('.month-chart-col')).toHaveLength(1);
    expect(html).toContain('>02/09<');
    expect(html).toContain('inbox-chart-tip-left');
  });

  it('renders day labels in an HTML axis row below the plot, ' +
    'centred and not clipped inside the SVG', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    const doc = monthDoc(html);
    const row = doc.querySelector('.month-chart-x');
    expect(row).not.toBeNull();
    expect(doc.querySelectorAll('.inbox-chart-plot ~ .month-chart-x'))
      .toHaveLength(1);
    expect(doc.querySelectorAll('svg .month-chart-xlabel')).toHaveLength(0);
    const labels = [...(row?.querySelectorAll('.month-chart-xlabel') ?? [])]
      .map((el) => el.textContent ?? '');
    expect(labels).toEqual(['02/09', '14/09']);
    const first = row?.querySelector<HTMLElement>('.month-chart-xlabel');
    expect(first?.style.left).toBe('25%');
    expect(row?.querySelector('.month-chart-xlabel.is-last')).not.toBeNull();
    expect(rule('.month-chart-xlabel.is-last'))
      .toContain('translateX(-100%)');
  });

  it('keys the legend bullet to the bar colour (accent round swatch)', () => {
    const html = inboxMonthChartHtml(monthOrders, '2026-09');
    const swatch = monthDoc(html).querySelector(
      '.inbox-chart-legend .chart-swatch');
    expect(swatch?.classList.contains('month-chart-swatch')).toBe(true);
    expect(rule('.month-chart-swatch')).toContain('var(--color-accent)');
    expect(rule('.chart-swatch')).toContain('border-radius: 50%');
  });
});