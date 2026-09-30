import { describe, it, expect, vi } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { OrderService, type NewOrderInput } from '../../src/services/OrderService';
import { StockService } from '../../src/services/StockService';
import type { Order, OrderLine } from '../../src/domain/types';
import type {
  Ingredient, Product, RecipeComponent, StockMovement
} from '../../src/domain/types';

const line = (productId: string, qty: number, unitPrice: number): OrderLine => ({ productId, productName: 'Bolo', qty, unitPrice });

function emptyOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1', customerId: 'c1', customerName: 'Ana', lines: [line('cake', 1, 40)],
    deliveryDate: '2026-09-20', status: 'pendente', paymentStatus: 'a_pagar',
    notes: '', stockDeducted: false, createdAt: '2026-09-17T10:00:00Z',
    ...overrides
  };
}

function makeHarness() {
  const orders = new InMemoryRepository<Order>();
  const stock = { deductForOrder: vi.fn() };
  const service = new OrderService(orders, stock as never);
  return { orders, stock, service };
}

const farinha: Ingredient = {
  id: 'ing-1', name: 'Farinha 1000g', unit: 'g', packageSize: 1000,
  packagePrice: 10, stock: 1000, minStock: 200
};

const bolo: Product = {
  id: 'p1', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
  labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
  fixedExpenses: {
    rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76
  },
  variablePercent: 10, markupPercent: 70,
  items: [{ kind: 'ingredient', refId: 'ing-1', qty: 300 }]
};

function makeRealHarness() {
  const orders = new InMemoryRepository<Order>();
  const ingredients = InMemoryRepository.seeded([farinha]);
  const components = new InMemoryRepository<RecipeComponent>();
  const products = InMemoryRepository.seeded([bolo]);
  const movements = new InMemoryRepository<StockMovement>();
  const stock = new StockService(ingredients, components, products, movements);
  const service = new OrderService(orders, stock);
  return { orders, ingredients, movements, service };
}

function input(overrides: Partial<NewOrderInput> = {}): NewOrderInput {
  return {
    customerId: 'c1', customerName: 'Ana', lines: [line('cake', 2, 40)],
    deliveryDate: '2026-09-20', notes: '', ...overrides
  };
}

describe('OrderService.orderTotal', () => {
  const { service } = makeHarness();

  it('sums qty times unit price', () => {
    expect(service.orderTotal(emptyOrder({ lines: [line('a', 2, 15.5), line('b', 1, 10)] }))).toBe(41);
  });

  it('is zero for an order without lines', () => {
    expect(service.orderTotal(emptyOrder({ lines: [] }))).toBe(0);
  });
});

describe('OrderService.create', () => {
  it('persists a new order with default statuses', async () => {
    const { orders, service } = makeHarness();
    const created = await service.create(input({ lines: [line('cake', 2, 40)], notes: 'Entregar de manhã' }));
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('pendente');
    expect(created.paymentStatus).toBe('a_pagar');
    expect(created.stockDeducted).toBe(false);
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(orders.getById(created.id)).toMatchObject({ customerName: 'Ana' });
  });

  it('persists createdFrom when the order came from the inbox', async () => {
    const { orders, service } = makeHarness();
    const created = await service.create(input({ createdFrom: 'inbox' }));
    expect(orders.getById(created.id)?.createdFrom).toBe('inbox');
  });

  it('defaults createdFrom to an empty string for ERP orders', async () => {
    const { orders, service } = makeHarness();
    const created = await service.create(input());
    expect(orders.getById(created.id)?.createdFrom).toBe('');
  });
});

describe('OrderService status updates', () => {
  it('setStatus updates the order', async () => {
    const { orders, service } = makeHarness();
    const created = await service.create(input({ lines: [] }));
    await service.setStatus(created.id, 'pronto');
    expect(orders.getById(created.id)?.status).toBe('pronto');
  });

  it('setPaymentStatus updates the order', async () => {
    const { orders, service } = makeHarness();
    const created = await service.create(input({ lines: [] }));
    await service.setPaymentStatus(created.id, 'pago');
    expect(orders.getById(created.id)?.paymentStatus).toBe('pago');
  });
});

describe('OrderService.deductStock', () => {
  it('skips missing orders', async () => {
    const { stock, service } = makeHarness();
    await service.deductStock('missing');
    expect(stock.deductForOrder).not.toHaveBeenCalled();
  });

  it('is a no-op when stock was already deducted', async () => {
    const { orders, stock, service } = makeHarness();
    const order = await orders.add(emptyOrder({ stockDeducted: true }));
    await service.deductStock(order.id);
    expect(stock.deductForOrder).not.toHaveBeenCalled();
  });

  it('deducts stock and flags the order', async () => {
    const { orders, stock, service } = makeHarness();
    const order = await orders.add(emptyOrder());
    await service.deductStock(order.id);
    expect(stock.deductForOrder).toHaveBeenCalledWith(order);
    expect(orders.getById(order.id)?.stockDeducted).toBe(true);
  });
});

describe('OrderService.monthRevenue', () => {
  const reference = new Date('2026-09-17T12:00:00Z');

  it('sums only delivered orders from the same month', async () => {
    const { orders, service } = makeHarness();
    const sameMonth: Order = {
      ...emptyOrder(), id: 'o2', status: 'entregue', paymentStatus: 'pago', createdAt: '2026-09-02T08:00:00Z'
    };
    const lastMonth: Order = {
      ...emptyOrder(), id: 'o3', status: 'entregue', paymentStatus: 'pago', createdAt: '2026-08-30T08:00:00Z'
    };
    await orders.add(emptyOrder({ status: 'entregue', paymentStatus: 'pago' }));
    await orders.add(sameMonth);
    await orders.add(lastMonth);
    await orders.add(emptyOrder({ id: 'o4', status: 'pendente' }));
    expect(service.monthRevenue(reference)).toBe(80);
  });

  it('is zero with no deliveries', async () => {
    const { orders, service } = makeHarness();
    await orders.add(emptyOrder({ status: 'producao' }));
    expect(service.monthRevenue(reference)).toBe(0);
  });
});

describe('OrderService.setStatus baixa automática', () => {
  it('mover para producao desconta a receita @spec:AC-034', async () => {
    const { orders, ingredients, service } = makeRealHarness();
    const order = await orders.add(emptyOrder({ lines: [line('p1', 1, 40)] }));
    await service.setStatus(order.id, 'producao');
    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    expect(orders.getById(order.id)?.stockDeducted).toBe(true);
  });

  it('segunda passagem por producao nao desconta de novo @spec:AC-035', async () => {
    const { orders, ingredients, service } = makeRealHarness();
    const order = await orders.add(emptyOrder({ lines: [line('p1', 1, 40)] }));
    await service.setStatus(order.id, 'producao');
    await service.setStatus(order.id, 'pendente');
    await service.setStatus(order.id, 'producao');
    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    expect(orders.getById(order.id)?.stockDeducted).toBe(true);
  });

  it('sair de producao nao devolve estoque @spec:AC-038', async () => {
    const { orders, ingredients, movements, service } = makeRealHarness();
    const order = await orders.add(emptyOrder({ lines: [line('p1', 1, 40)] }));
    await service.setStatus(order.id, 'producao');
    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    await service.setStatus(order.id, 'pendente');
    expect(ingredients.getById('ing-1')?.stock).toBe(700);
    expect(movements.getAll().length).toBe(1);
  });
});