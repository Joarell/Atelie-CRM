// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import type { Ingredient } from '../../src/domain/types';
import {
  findIngredientByName,
  updateExistingIngredient,
  processIngredients,
  formatImportMessage
} from '../../src/ui/views/IngredientsView';

interface TestContext {
  ingredients: InMemoryRepository<Ingredient>;
}

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    name: 'Arroz',
    unit: 'g' as Ingredient['unit'],
    packageSize: 1,
    packagePrice: 20,
    stock: 10,
    minStock: 2,
    ...overrides
  };
}

function makeContext(ingredients: Ingredient[]): TestContext {
  return {
    ingredients: InMemoryRepository.seeded(ingredients)
  };
}

describe('IngredientsView - duplicate handling', () => {
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    ctx = makeContext([makeIngredient({ id: 'ing-1', name: 'Arroz', stock: 5 })]);
  });

  describe('findIngredientByName', () => {
    it('finds ingredient by exact name', () => {
      const all = ctx.ingredients.getAll();
      console.log('All ingredients:', all);
      const found = findIngredientByName(ctx, 'Arroz');
      console.log('Found exact:', found);
      expect(found).toBeTruthy();
      expect(found!.id).toBe('ing-1');
    });

    it('finds ingredient case-insensitively', () => {
      const all = ctx.ingredients.getAll();
      console.log('All ingredients for case test:', all);
      const found = findIngredientByName(ctx, 'ARROZ');
      console.log('Found case:', found);
      expect(found).toBeTruthy();
      expect(found!.id).toBe('ing-1');

      const found2 = findIngredientByName(ctx, 'arroz');
      expect(found2).toBeTruthy();
    });

    it('returns undefined for non-existent name', () => {
      const found = findIngredientByName(ctx, 'Feijão');
      expect(found).toBeUndefined();
    });
  });

  describe('updateExistingIngredient', () => {
    it('adds packageSize and packagePrice', async () => {
      const existing = makeIngredient({ id: 'ing-1', name: 'Arroz', packageSize: 1, packagePrice: 20, stock: 5 });
      const incoming = makeIngredient({ name: 'Arroz', packageSize: 2, packagePrice: 30, stock: 0 });

      await updateExistingIngredient(ctx, existing, incoming);

      const updated = ctx.ingredients.getById('ing-1');
      expect(updated).toBeTruthy();
      expect(updated!.packageSize).toBe(3); // 1 + 2
      expect(updated!.packagePrice).toBe(50); // 20 + 30
      expect(updated!.stock).toBe(5); // 5 + 0
    });

it('updates unit to incoming unit', async () => {
      const existing = makeIngredient({ id: 'ing-1', name: 'Arroz', unit: 'g' });
      const incoming = makeIngredient({ name: 'Arroz', unit: 'un' });

      await updateExistingIngredient(ctx, existing, incoming);

      const updated = ctx.ingredients.getById('ing-1');
      expect(updated!.unit).toBe('un');
    });

    it('keeps minimum minStock', async () => {
      const existing = makeIngredient({ id: 'ing-1', name: 'Arroz', minStock: 5 });
      const incoming = makeIngredient({ name: 'Arroz', minStock: 2 });

      await updateExistingIngredient(ctx, existing, incoming);

      const updated = ctx.ingredients.getById('ing-1');
      expect(updated!.minStock).toBe(2);
    });
  });

  describe('processIngredients', () => {
    it('imports new ingredients', async () => {
      const emptyCtx = makeContext([]);
      const ingredients = [makeIngredient({ id: 'new-1', name: 'Feijão', packageSize: 1, packagePrice: 10 })];

      const result = await processIngredients(emptyCtx, ingredients);

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(0);
      expect(emptyCtx.ingredients.getAll()).toHaveLength(1);
    });

    it('updates existing ingredients', async () => {
      const ingredients = [makeIngredient({ name: 'Arroz', packageSize: 2, packagePrice: 30 })];

      const result = await processIngredients(ctx, ingredients);

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(1);

      const updated = ctx.ingredients.getById('ing-1');
      expect(updated!.packageSize).toBe(3);
      expect(updated!.packagePrice).toBe(50);
    });

    it('mixes import and update', async () => {
      const ingredients = [
        makeIngredient({ name: 'Arroz', packageSize: 2, packagePrice: 30 }), // existing
        makeIngredient({ name: 'Feijão', packageSize: 1, packagePrice: 10 })  // new
      ];

      const result = await processIngredients(ctx, ingredients);

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(1);
      expect(ctx.ingredients.getAll()).toHaveLength(2);
    });

    it('is case-insensitive when matching names', async () => {
      const ingredients = [makeIngredient({ name: 'ARROZ', packageSize: 2, packagePrice: 30 })];

      const result = await processIngredients(ctx, ingredients);

      expect(result.updated).toBe(1);
      expect(result.imported).toBe(0);
    });
  });

  describe('formatImportMessage', () => {
    it('shows both imported and updated', () => {
      expect(formatImportMessage(2, 1)).toBe('2 ingrediente(s) importado(s), 1 atualizado(s)');
    });

    it('shows only imported', () => {
      expect(formatImportMessage(3, 0)).toBe('3 ingrediente(s) importado(s)');
    });

    it('shows only updated', () => {
      expect(formatImportMessage(0, 2)).toBe('2 ingrediente(s) atualizado(s)');
    });
  });
});