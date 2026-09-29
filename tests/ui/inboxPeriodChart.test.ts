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
import { renderCrmInboxView, getTestRefreshInbox } from '../../src/ui/views/crm/CrmInboxView';
import { inboxPeriodChartHtml } from '../../src/ui/views/crm/inboxPeriodChart';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

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
    id, name, phone, email: '', notes: '', tags: [], createdAt: NOW
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

const ORDER_SEEDS: Order[] = [
  order('ana-25-e', 'Ana Beatriz', '2025-05-01T10:00:00.000Z',
    'entregue', [line('Entregue adoçado', 2, 130)]),
  order('ana-25-a', 'Ana Beatriz', '2025-11-10T10:00:00.000Z',
    'producao', [line('Bolo de limão', 1, 89.9)]),
  order('ana-26-a', 'Ana Beatriz', '2026-01-15T10:00:00.000Z',
    'pendente', [line('Bolo de casamento (2 andares)', 1, 650)]),
  order('carla-24-c', 'Carla Menezes', '2024-03-05T10:00:00.000Z',
    'cancelado', [line('Docinhos (centena)', 1, 130)])
];

class DelayedOrderRepo extends InMemoryRepository<Order> {
  queued?: { id: string; patch: Partial<Order>; applied: boolean };

  override async load(): Promise<void> {
    if (this.queued && !this.queued.applied) {
      this.queued.applied = true;
      await this.update(this.queued.id, this.queued.patch);
    }
  }
}

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
      text: 'oi ana', createdBy: '', createdAt: NOW }
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
  qs<HTMLElement>('[data-open="conv-1"]', root).click();
  // chartPeriod is module-level and leaks across tests (previous test may
  // have picked Semana/Ano), so every scenario starts pinned to Mês.
  qs<HTMLElement>('[data-period="mes"]', root).click();
  return { ctx, root };
}

function periodLabels(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.period-chart-xlabel')]
    .map((el) => el.textContent ?? '');
}

function tipText(root: HTMLElement, key: string): string {
  const tip = qs<HTMLElement>(
    `.period-chart-col[data-key="${key}"] .inbox-chart-tip`, root);
  return tip.textContent ?? '';
}

function pressedPeriod(root: HTMLElement): string {
  const pressed = root.querySelector<HTMLElement>(
    '.period-option[aria-pressed="true"]');
  return pressed?.dataset.period ?? '';
}

const globalCss = readFileSync('src/styles/global.css', 'utf8');

describe('Inbox period chart with week/month/year menu', () => {
  it('renders below the yearly chart and above the Caixa de entrada', () => {
    const { root } = buildCtx();
    const html = root.innerHTML;
    const yearly = html.indexOf('class="inbox-chart"');
    const period = html.indexOf('inbox-chart--period');
    const heading = html.indexOf('Caixa de entrada');
    expect(period).toBeGreaterThan(yearly);
    expect(period).toBeLessThan(heading);
    expect(root.querySelector('.period-chart-x')).not.toBeNull();
  });

  it('shows a menu with Semana/Mês/Ano defaulting to Mês', () => {
    const { root } = buildCtx();
    const labels = [...root.querySelectorAll('.period-option')]
      .map((el) => el.textContent ?? '');
    expect(labels).toEqual(['Semana', 'Mês', 'Ano']);
    expect(pressedPeriod(root)).toBe('mes');
    expect(root.querySelector('.period-menu')?.getAttribute('role'))
      .toBe('group');
  });

  it('aggregates the contact orders by month in the default view', () => {
    const { root } = buildCtx();
    expect(periodLabels(root))
      .toEqual(['05/2025', '11/2025', '01/2026']);
    expect(root.querySelectorAll('.period-chart-col')).toHaveLength(3);
    expect(tipText(root, '2026-01')).toContain('Em andamento 1');
    expect(tipText(root, '2026-01')).toContain('650,00');
    expect(tipText(root, '2025-05')).toContain('Entregue 1');
    expect(tipText(root, '2025-05')).toContain('260,00');
  });

  it('switches to the year view when Ano is picked', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-period="ano"]', root).click();
    expect(pressedPeriod(root)).toBe('ano');
    expect(periodLabels(root)).toEqual(['2025', '2026']);
    expect(tipText(root, '2026')).toContain('Em andamento 1');
  });

  it('switches to ISO-week buckets when Semana is picked', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-period="semana"]', root).click();
    expect(pressedPeriod(root)).toBe('semana');
    expect(periodLabels(root)).toEqual(['S18/25', 'S46/25', 'S03/26']);
    expect(tipText(root, '2026-W03')).toContain('650,00');
  });

  it('reuses the tip tooltip classes but keeps bullets distinct', () => {
    const { root, ctx } = buildCtx();
    expect(root.querySelectorAll('.period-chart-bullet')).toHaveLength(3);
    expect(root.querySelector('.abc-dot')).toBeNull();
    expect(css('.period-chart-point')).toContain('border-radius: 50%;');
    expect(css('.period-chart-col:hover .inbox-chart-tip'))
      .toContain('opacity: 1;');
    // The active pill shares one combined rule with the aria-pressed state.
    expect(globalCss).toContain('.period-option.is-active');
    expect(rule('.period-option.is-active'))
      .toContain('background: var(--color-accent)');
    void ctx;
  });

  it('orders the legend series bullets before each label', () => {
    const { root } = buildCtx();
    const items = [...root.querySelectorAll('.inbox-chart--period ' +
      '.chart-legend-item')];
    expect(items).toHaveLength(3);
    const expected = [
      ['period-series-entregue', 'Entregue'],
      ['period-series-ativo', 'Em andamento'],
      ['period-series-cancelado', 'Cancelado']
    ];
    items.forEach((item, i) => {
      const swatch = item.querySelector('i.chart-swatch');
      expect(swatch?.classList.contains(expected[i][0])).toBe(true);
      expect(item.innerHTML.indexOf('chart-swatch'))
        .toBeLessThan(item.innerHTML.indexOf(expected[i][1]));
      expect(css('.chart-swatch')).toContain('border-radius: 50%;');
    });
  });

  it('rebuilds the buckets for the selected contact', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-open="conv-2"]', root).click();
    expect(periodLabels(root)).toEqual(['03/2024']);
    expect(tipText(root, '2024-03')).toContain('Cancelado 1');
  });

  it('shows an empty card for a contact with no orders', () => {
    const { root } = buildCtx();
    qs<HTMLElement>('[data-open="conv-3"]', root).click();
    expect(root.querySelector('.period-chart-col')).toBeNull();
    expect(qs<HTMLElement>('.period-chart-empty', root).textContent)
      .toContain('Sem pedidos');
  });

  it('keeps the chosen period across a refresh redraw', async () => {
    const { ctx, root } = buildCtx();
    qs<HTMLElement>('[data-period="ano"]', root).click();
    expect(periodLabels(root)).toEqual(['2025', '2026']);
    const repo = InMemoryRepository.seeded<Order>(ORDER_SEEDS);
    Object.setPrototypeOf(repo, DelayedOrderRepo.prototype);
    (repo as unknown as DelayedOrderRepo).queued = {
      id: 'ana-26-a', patch: { status: 'entregue' }, applied: false
    };
    (ctx as unknown as { orders: unknown }).orders = repo;
    await getTestRefreshInbox()!();
    expect(pressedPeriod(root)).toBe('ano');
    expect(periodLabels(root)).toEqual(['2025', '2026']);
    expect(tipText(root, '2026')).toContain('Entregue 1');
  });
});

describe('inboxPeriodChartHtml (direct)', () => {
  it('renders only the empty card when there are no orders', () => {
    const html = inboxPeriodChartHtml([], 'mes');
    expect(html).toContain('period-chart-empty');
    expect(html).not.toContain('period-chart-col');
  });

  it('draws a single bucket as a centered band with one label', () => {
    const html = inboxPeriodChartHtml([
      order('o1', 'Ana Beatriz', '2026-01-15T10:00:00.000Z', 'pendente')
    ], 'mes');
    expect(html).toContain('data-key="2026-01"');
    expect(html.match(/period-chart-col/g)).toHaveLength(1);
    expect(html).toContain('style="left:50%;top:96.25%"></span>');
  });
});

function css(selector: string): string {
  return globalCss.match(
    new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`)
  )?.[0] ?? '';
}

// Matches a rule even when several selectors are combined before the brace.
function rule(selector: string): string {
  return globalCss.match(
    new RegExp(`${selector.replace(/\./g, '\\.')}[^\\{]*\\{[^}]*\\}`)
  )?.[0] ?? '';
}