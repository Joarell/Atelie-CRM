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

function makeHarness() {
  const ingredients = InMemoryRepository.seeded([flour, butter]);
  const components = InMemoryRepository.seeded([dough]);
  const products = InMemoryRepository.seeded([cake]);
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
});