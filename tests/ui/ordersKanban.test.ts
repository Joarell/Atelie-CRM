// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  Ingredient, Order, OrderLine, OrderStatus,
  Product, RecipeComponent, StockMovement
} from '../../src/domain/types';
import { formatBRL, todayISO } from '../../src/domain/format';
import { shiftDay, ORDER_STATUSES } from '../../src/domain/orderKanban';
import { OrderService } from '../../src/services/OrderService';
import { StockService } from '../../src/services/StockService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderOrdersView } from '../../src/ui/views/OrdersView';
import { qs, qsa } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({
  showToast: vi.fn()
}));

const DAY = todayISO();
const y = DAY.slice(0, 4);

function order(
  id: string, day: string, status: OrderStatus, customer = 'Ana',
  unitPrice = 89.9
): Order {
  const lines: OrderLine[] = [
    { productId: 'p1', productName: 'Bolo de limão', qty: 1, unitPrice }
  ];
  return {
    id, customerId: 'c1', customerName: customer, lines,
    deliveryDate: day, status, paymentStatus: 'a_pagar', notes: '',
    stockDeducted: false, createdAt: `${y}-01-02T10:00:00.000Z`
  };
}

const products = InMemoryRepository.seeded<Product>([
  { id: 'p1', name: 'Bolo de limão', category: 'Doces', yieldUnits: 1,
    prepTime: 60, labor: { salary: 1800, daysPerMonth: 24, hoursPerDay: 8 },
    fixedExpenses: { rent: 800, energy: 250, water: 90,
      internet: 120, office: 60, mei: 76 },
    variablePercent: 10, markupPercent: 70, items: [] }
]);

function buildCtx(seedOrders: Order[]): {
  ctx: AppContext;
  orders: InMemoryRepository<Order>;
  root: HTMLElement;
} {
  const orders = InMemoryRepository.seeded<Order>(seedOrders);
  const stock = new StockService(
    InMemoryRepository.seeded<Ingredient>([]),
    InMemoryRepository.seeded<RecipeComponent>([]),
    products,
    InMemoryRepository.seeded<StockMovement>([])
  );
  const customers = InMemoryRepository.seeded([]);
  const ctx = {
    orders,
    customers,
    products,
    pricing: { productPricing: () => ({ suggestedPrice: 89.9 }) },
    order: new OrderService(orders, stock)
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderOrdersView(root, ctx);
  return { ctx, orders, root };
}

function pickDay(root: HTMLElement, day: string): void {
  const input = qs<HTMLInputElement>('#day-input', root);
  input.value = day;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function dragCardTo(root: HTMLElement, orderId: string, status: string): void {
  const card = qs<HTMLElement>(`[data-order="${orderId}"]`, root);
  card.dispatchEvent(new Event('dragstart', { bubbles: true }));
  const column = qs<HTMLElement>(`.kanban-col[data-status="${status}"]`, root);
  column.dispatchEvent(new Event('drop', { bubbles: true }));
}

function cardIn(root: HTMLElement, status: string, id: string): boolean {
  return root.querySelector(
    `.kanban-col[data-status="${status}"] [data-order="${id}"]`
  ) !== null;
}

function columnMeta(root: HTMLElement, status: string): HTMLElement {
  return qs<HTMLElement>(
    `.kanban-col[data-status="${status}"] .kanban-meta`, root
  );
}

// happy-dom does not resolve layout from external stylesheets, so the CSS
// contract for the board's per-status accents is checked against the file.
const globalCss = readFileSync('src/styles/global.css', 'utf8');

function cssRule(selector: string): string {
  return globalCss.match(
    new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*\\}`)
  )?.[0] ?? '';
}

// Extracts every @media block for a breakpoint (brace-counted) so the board
// layout contract on phone screens can be asserted against the stylesheet.
function mediaBlocks(maxWidth: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from !== -1) {
    const start = globalCss.indexOf(`@media (max-width: ${maxWidth})`, from);
    if (start === -1) break;
    let depth = 0;
    let i: number;
    for (i = start; i < globalCss.length; i += 1) {
      const ch = globalCss[i];
      if (ch === '{') depth += 1;
      if (ch !== '}') continue;
      depth -= 1;
      if (depth === 0) break;
    }
    blocks.push(globalCss.slice(start, i + 1));
    from = i + 1;
  }
  return blocks;
}

describe('Pedidos kanban — board por dia', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders one column per status for the selected day', () => {
    const { root } = buildCtx([
      order('a', DAY, 'pendente'), order('b', DAY, 'producao')
    ]);
    pickDay(root, DAY);

    const columns = Array.from(qsa<HTMLElement>('.kanban-col', root));
    expect(columns.map((c) => c.dataset.status)).toEqual(ORDER_STATUSES);
    expect(columns.map((c) => qs<HTMLElement>('.kanban-title', c)
      ?.textContent)).toEqual([
      'Pendente', 'Em produção', 'Pronto', 'Entregue', 'Cancelado'
    ]);
    expect(cardIn(root, 'pendente', 'a')).toBe(true);
    expect(cardIn(root, 'producao', 'b')).toBe(true);
  });

  it('only shows orders delivered on the selected day', () => {
    const { root } = buildCtx([
      order('today', DAY, 'pendente'),
      order('other', shiftDay(DAY, 1), 'pendente')
    ]);
    pickDay(root, DAY);
    expect(cardIn(root, 'pendente', 'today')).toBe(true);
    expect(cardIn(root, 'pendente', 'other')).toBe(false);
  });

  it('moves between days with the prev/next buttons', () => {
    const later = shiftDay(DAY, 1);
    const { root } = buildCtx([
      order('in-later', later, 'pronto')
    ]);
    pickDay(root, DAY);
    expect(cardIn(root, 'pronto', 'in-later')).toBe(false);

    qs<HTMLElement>('#day-next', root).dispatchEvent(
      new Event('click', { bubbles: true })
    );
    expect(cardIn(root, 'pronto', 'in-later')).toBe(true);
    expect(qs<HTMLInputElement>('#day-input', root).value).toBe(later);

    qs<HTMLElement>('#day-prev', root).dispatchEvent(
      new Event('click', { bubbles: true })
    );
    expect(qs<HTMLInputElement>('#day-input', root).value).toBe(DAY);
  });

  it('shows count and total value in every column header', () => {
    const { root } = buildCtx([
      order('a', DAY, 'pendente', 'Ana', 100),
      order('b', DAY, 'pendente', 'Carla', 30),
      order('c', DAY, 'pronto', 'Bruno', 50)
    ]);
    pickDay(root, DAY);

    expect(columnMeta(root, 'pendente').textContent).toContain('2');
    expect(columnMeta(root, 'pendente').textContent)
      .toContain(formatBRL(130));
    expect(columnMeta(root, 'pronto').textContent)
      .toContain(formatBRL(50));
    expect(columnMeta(root, 'entregue').textContent).toContain('0');
  });

  it('moves a card to its new status column when dropped', async () => {
    const { ctx, root } = buildCtx([order('a', DAY, 'pendente')]);
    pickDay(root, DAY);
    expect(cardIn(root, 'pendente', 'a')).toBe(true);

    dragCardTo(root, 'a', 'pronto');
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.orders.getById('a')?.status).toBe('pronto');
    expect(cardIn(root, 'pronto', 'a')).toBe(true);
    expect(cardIn(root, 'pendente', 'a')).toBe(false);
  });

  it('toggles the payment status from the card badge', async () => {
    const { ctx, root } = buildCtx([order('a', DAY, 'pronto')]);
    pickDay(root, DAY);

    const badge = qs<HTMLElement>('[data-toggle-payment]', root);
    badge.dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.orders.getById('a')?.paymentStatus).toBe('pago');
    expect(qs<HTMLElement>('[data-toggle-payment]', root).textContent)
      .toContain('Pago');
  });

  it('deletes the card from the day board after confirmation', async () => {
    window.confirm = vi.fn(() => true);
    const { ctx, root } = buildCtx([order('a', DAY, 'pendente')]);
    pickDay(root, DAY);
    expect(cardIn(root, 'pendente', 'a')).toBe(true);

    qs<HTMLElement>('[data-delete]', root).dispatchEvent(
      new Event('click', { bubbles: true })
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.orders.getById('a')).toBeUndefined();
    expect(cardIn(root, 'pendente', 'a')).toBe(false);
  });

  it('tags every column with its own status accent class', () => {
    const { root } = buildCtx([
      order('a', DAY, 'pendente'), order('b', DAY, 'cancelado')
    ]);
    pickDay(root, DAY);

    const columns = Array.from(qsa<HTMLElement>('.kanban-col', root));
    expect(columns.map((c) => c.className)).toEqual(
      ORDER_STATUSES.map((s) => `kanban-col kanban-col--${s}`)
    );
  });

  it('defines a distinct, coherent accent color per status column', () => {
    const accents = ORDER_STATUSES.map((status) => {
      const rule = cssRule(`.kanban-col--${status}`);
      const accent = rule.match(/--kanban-accent:\s*([^;]+);/)?.[1];
      return accent?.trim() ?? '';
    });

    expect(new Set(accents).size).toBe(ORDER_STATUSES.length);
    expect(accents).toContain('var(--color-warning)');
    expect(accents).toContain('var(--color-success)');
    expect(accents).toContain('var(--color-error)');
  });

  it('stacks the board one column per row on phone screens', () => {
    const phone = mediaBlocks('720px')
      .find((block) => block.includes('.kanban'))
      ?.toString() ?? '';
    expect(phone).toContain('.kanban');
    expect(phone).toContain('grid-auto-flow: row');
    expect(phone).toContain('grid-template-columns: 1fr');
    expect(phone).toContain('overflow-x: visible');
    expect(phone).toContain('.kanban-col');
    expect(phone).toContain('min-height: 0');
  });
});