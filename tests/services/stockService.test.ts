import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { StockService } from '../../src/services/StockService';
import type { Ingredient, RecipeComponent, Product, Order, StockMovement } from '../../src/domain/types';

const flour: Ingredient = {
  id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 100, minStock: 20
};
const butter: Ingredient = {
  id: 'butter', name: 'Manteiga', unit: 'g', packageSize: 200, packagePrice: 16, stock: 3, minStock: 10
};
const dough: RecipeComponent = {
  id: 'dough', name: 'Massa', type: 'base', yieldDesc: '1x', prepTime: 10,
  items: [{ ingredientId: 'flour', qty: 500 }]
};
const cake: Product = {
  id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
  labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
  fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
  variablePercent: 10, markupPercent: 70,
  items: [
    { kind: 'ingredient', refId: 'flour', qty: 1000 },
    { kind: 'component', refId: 'dough', qty: 1 }
  ]
};

const order: Order = {
  id: 'o1', customerId: 'c1', customerName: 'Ana',
  lines: [{ productId: 'cake', productName: 'Bolo', qty: 2, unitPrice: 80 }],
  deliveryDate: '2026-09-20', status: 'pendente', paymentStatus: 'a_pagar',
  notes: '', stockDeducted: false, createdAt: '2026-09-17T10:00:00Z'
};

const filling: RecipeComponent = {
  id: 'filling', name: 'Recheio', type: 'recheio', yieldDesc: '1x',
  prepTime: 15, items: [{ ingredientId: 'butter', qty: 50 }]
};
const pie: Product = {
  ...cake, id: 'pie', name: 'Torta', prepTime: 50,
  items: [
    { kind: 'ingredient', refId: 'flour', qty: 300 },
    { kind: 'component', refId: 'filling', qty: 1 }
  ]
};

const pieOrder: Order = {
  id: 'o2', customerId: 'c1', customerName: 'Ana',
  lines: [{ productId: 'pie', productName: 'Torta', qty: 1, unitPrice: 60 }],
  deliveryDate: '2026-09-21', status: 'producao', paymentStatus: 'a_pagar',
  notes: '', stockDeducted: true, createdAt: '2026-09-17T11:00:00Z'
};

function makeHarness() {
  const ingredients = InMemoryRepository.seeded([flour, butter]);
  const components = InMemoryRepository.seeded([dough, filling]);
  const products = InMemoryRepository.seeded([cake, pie]);
  const movements = new InMemoryRepository<StockMovement>();
  const stock = new StockService(ingredients, components, products, movements);
  return { ingredients, movements, stock };
}

describe('StockService.lowStock', () => {
  it('returns ingredients at or below their minimum stock', () => {
    const { stock } = makeHarness();
    const low = stock.lowStock().map((i) => i.id);
    expect(low).toEqual(['butter']);
  });
});

describe('StockService.registerMovement', () => {
  it('increases stock on an entrada', async () => {
    const { ingredients, movements, stock } = makeHarness();
    await stock.registerMovement('flour', 'entrada', 500, 'Compra');
    expect(ingredients.getById('flour')?.stock).toBe(600);
    expect(movements.getAll().length).toBe(1);
  });

  it('decreases stock on a saida', async () => {
    const { ingredients, movements, stock } = makeHarness();
    await stock.registerMovement('flour', 'saida', 40, 'Uso');
    expect(ingredients.getById('flour')?.stock).toBe(60);
    expect(movements.getAll().length).toBe(1);
  });

  it('ignores unknown ingredients', async () => {
    const { movements, stock } = makeHarness();
    await stock.registerMovement('nope', 'entrada', 10, '');
    expect(movements.getAll().length).toBe(0);
  });
});

describe('StockService.usageForOrder', () => {
  it('flattens the order into raw ingredient usage', () => {
    const { stock } = makeHarness();
    const usage = stock.usageForOrder(order);
    expect(usage.flour).toBe((1000 + 500) * 2);
  });
});

describe('StockService.deductForOrder', () => {
  it('deducts stock for every ingredient in the order', async () => {
    const { ingredients, movements, stock } = makeHarness();
    await stock.deductForOrder(order);
    expect(ingredients.getById('flour')?.stock).toBe(100 - 3000);
    expect(movements.getAll().length).toBe(1);
  });

  it('each of two ingredients gets its own saida @spec:AC-036', async () => {
    const { movements, stock } = makeHarness();
    await stock.deductForOrder(pieOrder);
    const moves = movements.getAll();
    expect(moves.length).toBe(2);
    const ids = moves.map((m) => m.ingredientId).sort();
    expect(ids).toEqual(['butter', 'flour']);
    expect(moves.every((m) => m.type === 'saida')).toBe(true);
    const flourMove = moves.find((m) => m.ingredientId === 'flour');
    const butterMove = moves.find((m) => m.ingredientId === 'butter');
    expect([flourMove?.qty, butterMove?.qty]).toEqual([300, 50]);
  });

  it('negative balance is allowed, not clamped @spec:AC-037', async () => {
    const { ingredients, movements, stock } = makeHarness();
    expect(ingredients.getById('flour')?.stock).toBe(100);
    await stock.deductForOrder(pieOrder);
    expect(ingredients.getById('flour')?.stock).toBe(-200);
    expect(movements.getAll().length).toBe(2);
    const flourSaida = movements.getAll().find(
      (m) => m.ingredientId === 'flour' && m.type === 'saida'
    );
    expect(flourSaida?.qty).toBe(300);
  });
});