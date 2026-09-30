// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppContext } from '../../src/state/AppContext';
import type {
  Ingredient, Order, OrderLine, OrderStatus, Product,
  RecipeComponent, StockMovement
} from '../../src/domain/types';
import { todayISO } from '../../src/domain/format';
import { OrderService } from '../../src/services/OrderService';
import { StockService } from '../../src/services/StockService';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { renderOrdersView } from '../../src/ui/views/OrdersView';
import { qs } from '../../src/ui/dom';

vi.mock('../../src/ui/Toast', () => ({ showToast: vi.fn() }));

import { showToast } from '../../src/ui/Toast';

const DAY = todayISO();
const y = DAY.slice(0, 4);

const flour: Ingredient = {
  id: 'ing-1', name: 'Farinha 1000g', unit: 'g',
  packageSize: 1000, packagePrice: 10, stock: 1000, minStock: 200
};

// Receita do produto p1 usa 300g de Farinha por unidade — o pedido de 1
// unidade cai o saldo de 1000g para 700g (AC-034).
const cake: Product = {
  id: 'p1', name: 'Bolo de limão', category: 'Doces', yieldUnits: 1,
  prepTime: 60,
  labor: { salary: 1800, daysPerMonth: 24, hoursPerDay: 8 },
  fixedExpenses: {
    rent: 800, energy: 250, water: 90, internet: 120,
    office: 60, mei: 76
  },
  variablePercent: 10, markupPercent: 70,
  items: [{ kind: 'ingredient', refId: 'ing-1', qty: 300 }]
};

const products = InMemoryRepository.seeded<Product>([cake]);

function order(
  id: string, status: OrderStatus, stockDeducted = false
): Order {
  const lines: OrderLine[] = [
    { productId: 'p1', productName: 'Bolo de limão', qty: 1, unitPrice: 89.9 }
  ];
  return {
    id, customerId: 'c1', customerName: 'Ana', lines,
    deliveryDate: DAY, status, paymentStatus: 'a_pagar', notes: '',
    stockDeducted, createdAt: `${y}-01-02T10:00:00.000Z`
  };
}

function buildCtx(seedOrders: Order[]): {
  ctx: AppContext;
  ingredients: InMemoryRepository<Ingredient>;
  movements: InMemoryRepository<StockMovement>;
  root: HTMLElement;
} {
  const orders = InMemoryRepository.seeded<Order>(seedOrders);
  const ingredients = InMemoryRepository.seeded<Ingredient>([flour]);
  const movements = InMemoryRepository.seeded<StockMovement>([]);
  const stock = new StockService(
    ingredients, InMemoryRepository.seeded<RecipeComponent>([]),
    products, movements
  );
  const ctx = {
    orders,
    customers: InMemoryRepository.seeded([]),
    products,
    pricing: { productPricing: () => ({ suggestedPrice: 89.9 }) },
    order: new OrderService(orders, stock)
  } as unknown as AppContext;
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderOrdersView(root, ctx);
  return { ctx, ingredients, movements, root };
}

function pickDay(root: HTMLElement): void {
  const input = qs<HTMLInputElement>('#day-input', root);
  input.value = DAY;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// happy-dom não tem DataTransfer: o drop usa o stash de dragstart do
// módulo, igual a ordersKanban.test.ts.
function dragCardTo(root: HTMLElement, id: string, status: string): void {
  const card = qs<HTMLElement>(`[data-order="${id}"]`, root);
  card.dispatchEvent(new Event('dragstart', { bubbles: true }));
  const col = qs<HTMLElement>(`.kanban-col[data-status="${status}"]`, root);
  col.dispatchEvent(new Event('drop', { bubbles: true }));
}

function deductBtn(root: HTMLElement, id: string): Element | null {
  return root.querySelector(`[data-deduct="${id}"]`);
}

// Drena a cadeia de microtasks do repositório (notify + rerender + baixa).
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Pedidos — baixa de estoque no quadro', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(showToast).mockClear();
  });

  it('@spec:AC-034 mover para Em produção desconta o estoque', async () => {
    const { ctx, ingredients, root } = buildCtx([order('a', 'pendente')]);
    pickDay(root);

    dragCardTo(root, 'a', 'producao');
    await flush();

    expect(ctx.orders.getById('a')?.status).toBe('producao');
    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    expect(ctx.orders.getById('a')?.stockDeducted).toBe(true);
  });

  it('@spec:AC-039 mostra Baixar estoque só quando elegível', () => {
    const { root } = buildCtx([
      order('ready', 'pronto'),
      order('prod', 'producao'),
      order('pend', 'pendente'),
      order('canc', 'cancelado'),
      order('done', 'pronto', true)
    ]);
    pickDay(root);

    expect(deductBtn(root, 'ready')).not.toBeNull();
    expect(deductBtn(root, 'prod')).not.toBeNull();
    expect(deductBtn(root, 'pend')).toBeNull();
    expect(deductBtn(root, 'canc')).toBeNull();
    expect(deductBtn(root, 'done')).toBeNull();
  });

  it('@spec:AC-040 confirmar desconta e esconde o botão', async () => {
    window.confirm = vi.fn(() => true);
    const { ctx, ingredients, root } = buildCtx([order('ready', 'pronto')]);
    pickDay(root);

    qs<HTMLElement>('[data-deduct="ready"]', root).dispatchEvent(
      new Event('click', { bubbles: true })
    );
    await flush();

    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    expect(ctx.orders.getById('ready')?.stockDeducted).toBe(true);
    expect(deductBtn(root, 'ready')).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Estoque atualizado');
  });

  it('@spec:AC-041 cancelar a confirmação não altera saldo', async () => {
    const confirmSpy = vi.fn(() => false);
    window.confirm = confirmSpy;
    const { ctx, ingredients, movements, root } = buildCtx([
      order('ready', 'pronto')
    ]);
    pickDay(root);

    qs<HTMLElement>('[data-deduct="ready"]', root).dispatchEvent(
      new Event('click', { bubbles: true })
    );
    await flush();

    expect(confirmSpy).toHaveBeenCalled();
    expect(ingredients.getById('ing-1')?.stock).toBe(1000);
    expect(movements.getAll()).toHaveLength(0);
    expect(ctx.orders.getById('ready')?.stockDeducted).toBe(false);
    expect(deductBtn(root, 'ready')).not.toBeNull();
  });
});
