import { describe, it, expect } from 'vitest';
import type { Ingredient, RecipeComponent, Product } from '../../src/domain/types';
import {
  ingredientUnitCost,
  componentTotalCost,
  productDirectCost,
  hoursPerMonth,
  laborCostPerMinute,
  fixedMonthlyTotal,
  fixedCostPerMinute,
  calculateProductPricing
} from '../../src/domain/pricing';

const flour: Ingredient = {
  id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 100, minStock: 20
};
const butter: Ingredient = {
  id: 'butter', name: 'Manteiga', unit: 'g', packageSize: 200, packagePrice: 16, stock: 50, minStock: 10
};

const byId = (map: Record<string, Ingredient>) => (id: string) => map[id];

describe('ingredientUnitCost', () => {
  it('returns 0 for a missing ingredient', () => {
    expect(ingredientUnitCost(undefined)).toBe(0);
  });

  it('returns 0 when the package size is missing', () => {
    expect(ingredientUnitCost({ ...flour, packageSize: 0 })).toBe(0);
  });

  it('divides package price by package size', () => {
    expect(ingredientUnitCost(flour)).toBeCloseTo(0.01);
    expect(ingredientUnitCost(butter)).toBeCloseTo(0.08);
  });
});

describe('componentTotalCost', () => {
  const component: RecipeComponent = {
    id: 'dough', name: 'Massa', type: 'base', yieldDesc: '1x', prepTime: 10,
    items: [
      { ingredientId: 'flour', qty: 500 },
      { ingredientId: 'butter', qty: 100 }
    ]
  };

  it('sums ingredient costs by usage quantity', () => {
    const total = componentTotalCost(component, byId({ flour, butter }));
    expect(total).toBeCloseTo(500 * 0.01 + 100 * 0.08);
  });

  it('counts a missing ingredient as zero cost', () => {
    const total = componentTotalCost(component, byId({ flour }));
    expect(total).toBeCloseTo(500 * 0.01);
  });
});

describe('productDirectCost', () => {
  const filling: RecipeComponent = {
    id: 'recheio', name: 'Creme', type: 'recheio', yieldDesc: '1x', prepTime: 5,
    items: [{ ingredientId: 'butter', qty: 50 }]
  };
  const product: Product = {
    id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
    labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
    fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
    variablePercent: 10, markupPercent: 70,
    items: [
      { kind: 'ingredient', refId: 'flour', qty: 1000 },
      { kind: 'component', refId: 'recheio', qty: 2 }
    ]
  };

  it('adds direct ingredient costs plus component usage', () => {
    const total = productDirectCost(
      product,
      byId({ flour, butter }),
      (id) => (id === 'recheio' ? filling : undefined)
    );
    expect(total).toBeCloseTo(1000 * 0.01 + 2 * (50 * 0.08));
  });

  it('skips unresolvable components', () => {
    const total = productDirectCost(product, byId({ flour, butter }), () => undefined);
    expect(total).toBeCloseTo(1000 * 0.01);
  });
});

describe('hoursPerMonth / laborCostPerMinute', () => {
  const labor = { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 };

  it('computes monthly working hours', () => {
    expect(hoursPerMonth(labor)).toBe(192);
  });

  it('computes cost per minute', () => {
    expect(laborCostPerMinute(labor)).toBeCloseTo(2400 / 192 / 60);
  });

  it('guards against zero hours', () => {
    expect(laborCostPerMinute({ salary: 2400, daysPerMonth: 0, hoursPerDay: 0 })).toBe(0);
  });
});

describe('fixedMonthlyTotal / fixedCostPerMinute', () => {
  const fixed = { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 };

  it('sums every fixed expense', () => {
    expect(fixedMonthlyTotal(fixed)).toBe(1396);
  });

  it('spreads the total over monthly minutes', () => {
    const labor = { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 };
    expect(fixedCostPerMinute(fixed, labor)).toBeCloseTo(1396 / 192 / 60);
  });

  it('guards against zero hours', () => {
    expect(fixedCostPerMinute(fixed, { salary: 0, daysPerMonth: 0, hoursPerDay: 0 })).toBe(0);
  });
});

describe('calculateProductPricing', () => {
  const product: Product = {
    id: 'cake', name: 'Bolo', category: 'Doce', yieldUnits: 8, prepTime: 60,
    labor: { salary: 2400, daysPerMonth: 24, hoursPerDay: 8 },
    fixedExpenses: { rent: 800, energy: 250, water: 90, internet: 120, office: 60, mei: 76 },
    variablePercent: 10,
    markupPercent: 70,
    items: []
  };

  it('derives the full cost stack', () => {
    const pricing = calculateProductPricing(product, 10);
    const labor = 2400 / 192 / 60 * 60;
    const fixed = 1396 / 192 / 60 * 60;
    const variable = 10 * 0.1;
    const total = 10 + labor + fixed + variable;
    expect(pricing.laborCost).toBeCloseTo(labor);
    expect(pricing.fixedCost).toBeCloseTo(fixed);
    expect(pricing.variableCost).toBeCloseTo(variable);
    expect(pricing.totalCost).toBeCloseTo(total);
    expect(pricing.markupValue).toBeCloseTo(total * 0.7);
    expect(pricing.suggestedPrice).toBeCloseTo(total * 1.7);
  });

  it('splits the suggested price across yield units', () => {
    const pricing = calculateProductPricing({ ...product, yieldUnits: 8 }, 10);
    expect(pricing.unitPrice).toBeCloseTo(pricing.suggestedPrice / 8);
  });

  it('falls back to the batch price when yield units are zero', () => {
    const pricing = calculateProductPricing({ ...product, yieldUnits: 0 }, 10);
    expect(pricing.unitPrice).toBe(pricing.suggestedPrice);
  });

  it('reports profit and profit percent', () => {
    const pricing = calculateProductPricing(product, 10);
    expect(pricing.profit).toBeCloseTo(pricing.suggestedPrice - pricing.totalCost);
    const expectedPct = (pricing.markupValue / pricing.suggestedPrice) * 100;
    expect(pricing.profitPercent).toBeCloseTo(expectedPct);
  });

  it('handles a zero direct cost', () => {
    const pricing = calculateProductPricing(product, 0);
    expect(pricing.directCost).toBe(0);
    expect(pricing.variableCost).toBe(0);
  });
});