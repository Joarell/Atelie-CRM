import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { PricingService } from '../../src/services/PricingService';
import type { Ingredient, RecipeComponent, Product } from '../../src/domain/types';

const flour: Ingredient = {
  id: 'flour', name: 'Farinha', unit: 'g', packageSize: 1000, packagePrice: 10, stock: 100, minStock: 20
};
const butter: Ingredient = {
  id: 'butter', name: 'Manteiga', unit: 'g', packageSize: 200, packagePrice: 16, stock: 50, minStock: 10
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

function makeHarness() {
  const ingredients = InMemoryRepository.seeded([flour, butter]);
  const components = InMemoryRepository.seeded([dough]);
  const service = new PricingService(ingredients, components);
  return { service };
}

describe('PricingService.componentCost', () => {
  it('resolves ingredient costs through the repository', () => {
    const { service } = makeHarness();
    expect(service.componentCost(dough)).toBeCloseTo(500 * 0.01);
  });
});

describe('PricingService.productDirectCost', () => {
  it('resolves ingredients and components through the repositories', () => {
    const { service } = makeHarness();
    expect(service.productDirectCost(cake)).toBeCloseTo(1000 * 0.01 + 500 * 0.01);
  });
});

describe('PricingService.productPricing', () => {
  it('returns a full pricing model including unit price', () => {
    const { service } = makeHarness();
    const pricing = service.productPricing(cake);
    expect(pricing.directCost).toBeCloseTo(15);
    expect(pricing.totalCost).toBeGreaterThan(pricing.directCost);
    expect(pricing.unitPrice).toBeCloseTo(pricing.suggestedPrice / 8);
    expect(pricing.profit).toBeCloseTo(pricing.suggestedPrice - pricing.totalCost);
  });
});