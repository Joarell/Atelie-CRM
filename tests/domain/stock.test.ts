import { describe, it, expect } from 'vitest';
import type { Product, RecipeComponent, Order } from '../../src/domain/types';
import { expandProductUsage, expandOrderUsage } from '../../src/domain/stock';

const dough: RecipeComponent = {
  id: 'dough', name: 'Massa', type: 'base', yieldDesc: '1x', prepTime: 10,
  items: [{ ingredientId: 'flour', qty: 500 }]
};
const cream: RecipeComponent = {
  id: 'cream', name: 'Creme', type: 'recheio', yieldDesc: '1x', prepTime: 5,
  items: [{ ingredientId: 'butter', qty: 100 }]
};

const cake: Product = {
  id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
  labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
  fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
  variablePercent: 10, markupPercent: 70,
  items: [
    { kind: 'ingredient', refId: 'chocolate', qty: 200 },
    { kind: 'component', refId: 'dough', qty: 2 }
  ]
};

const resolveComponent = (id: string) =>
  ({ dough, cream } as Record<string, RecipeComponent>)[id];

describe('expandProductUsage', () => {
  it('flattens ingredients and components into raw usage', () => {
    const usage = expandProductUsage(cake, resolveComponent);
    expect(usage.chocolate).toBe(200);
    expect(usage.flour).toBe(2 * 500);
  });

  it('sums repeated ingredients within the recipe', () => {
    const product: Product = {
      ...cake,
      items: [
        { kind: 'ingredient', refId: 'flour', qty: 300 },
        { kind: 'component', refId: 'dough', qty: 1 }
      ]
    };
    const usage = expandProductUsage(product, resolveComponent);
    expect(usage.flour).toBe(300 + 500);
  });

  it('skips unresolvable components', () => {
    const usage = expandProductUsage(cake, () => undefined);
    expect(usage.flour).toBeUndefined();
    expect(usage.chocolate).toBe(200);
  });
});

describe('expandOrderUsage', () => {
  const order: Order = {
    id: 'o1', customerId: 'c1', customerName: 'Ana', lines: [
      { productId: 'cake', productName: 'Bolo', qty: 3, unitPrice: 40 }
    ],
    deliveryDate: '2026-09-20', status: 'pendente', paymentStatus: 'a_pagar',
    notes: '', stockDeducted: false, createdAt: '2026-09-17T10:00:00Z'
  };

  const resolveProduct = (id: string) => (id === 'cake' ? cake : undefined);

  it('scales per-batch usage by the ordered quantity', () => {
    const usage = expandOrderUsage(order, resolveProduct, resolveComponent);
    expect(usage.chocolate).toBe(200 * 3);
    expect(usage.flour).toBe(2 * 500 * 3);
  });

  it('merges usage across multiple lines', () => {
    const multiLine: Order = {
      ...order,
      lines: [
        { productId: 'cake', productName: 'Bolo', qty: 1, unitPrice: 40 },
        { productId: 'cake', productName: 'Bolo', qty: 2, unitPrice: 40 }
      ]
    };
    const usage = expandOrderUsage(multiLine, resolveProduct, resolveComponent);
    expect(usage.chocolate).toBe(200 * 3);
  });

  it('skips lines whose product cannot be resolved', () => {
    const empty = expandOrderUsage({ ...order, lines: [{ ...order.lines[0], productId: 'missing' }] }, resolveProduct, resolveComponent);
    expect(empty).toEqual({});
  });

  it('returns an empty map for an order without lines', () => {
    expect(expandOrderUsage({ ...order, lines: [] }, resolveProduct, resolveComponent)).toEqual({});
  });
});