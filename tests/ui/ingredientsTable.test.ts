// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import type { Ingredient } from '../../src/domain/types';
import { renderCrudTable } from '../../src/ui/CrudTable';
import { columns, buildSummary } from '../../src/ui/views/IngredientsView';

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    name: 'Arroz',
    unit: 'kg' as Ingredient['unit'],
    packageSize: 1,
    packagePrice: 20, // R$ 20,00
    stock: 10,
    minStock: 2,
    ...overrides
  };
}

describe('Ingredients table rendering', () => {
  let ingredients: Ingredient[];

  beforeEach(() => {
    ingredients = [
      makeIngredient({ id: '1', name: 'Arroz', packageSize: 1, packagePrice: 20, stock: 10 }),
      makeIngredient({ id: '2', name: 'Feijão', packageSize: 0.5, packagePrice: 8, stock: 5 }),
      makeIngredient({ id: '3', name: 'Açúcar', packageSize: 2, packagePrice: 15, stock: 20 })
    ];
  });

  describe('columns', () => {
    it('returns 5 columns with correct headers', () => {
      const cols = columns();
      expect(cols).toHaveLength(5);
      expect(cols[0].header).toBe('Nome');
      expect(cols[1].header).toBe('Preço');
      expect(cols[2].header).toBe('Custo unitário');
      expect(cols[3].header).toBe('Peso');
      expect(cols[4].header).toBe('Estoque');
    });

    it('has correct alignment for each column', () => {
      const cols = columns();
      expect(cols[0].alignRight).toBeUndefined(); // Nome - left
      expect(cols[1].alignRight).toBeUndefined(); // Preço - left
      expect(cols[2].alignRight).toBeUndefined(); // Custo unitário - left
      expect(cols[3].alignRight).toBeUndefined(); // Peso - left
      expect(cols[4].alignRight).toBeUndefined(); // Estoque - left
    });

it('renders Nome column correctly', () => {
      const col = columns()[0];
      const item = makeIngredient({ name: 'Arroz e Feijão' });
      expect(col.render(item)).toBe('Arroz e Feijão');
    });

    it('renders Preço column with BRL formatting', () => {
      const col = columns()[1];
      const item = makeIngredient({ packagePrice: 25 });
      expect(col.render(item)).toContain('25,00');
    });

    it('renders Custo unitário column', () => {
      const col = columns()[2];
      const item = makeIngredient({ packageSize: 1, packagePrice: 10 });
      // 10 reais / 1 = 10 reais/kg
      expect(col.render(item)).toContain('10,00/kg');
    });

    it('renders Peso column', () => {
      const col = columns()[3];
      const item = makeIngredient({ packageSize: 1.5, unit: 'kg' as Ingredient['unit'] });
      expect(col.render(item)).toBe('1,5 kg');
    });

    it('renders Estoque column', () => {
      const col = columns()[4];
      const item = makeIngredient({ stock: 25, unit: 'g' as Ingredient['unit'] });
      expect(col.render(item)).toBe('25 g');
    });
  });

  describe('buildSummary', () => {
    it('computes total stock and value', () => {
      const summary = buildSummary(ingredients);
      const cells = summary.render(ingredients);
      expect(cells).toHaveLength(5);
      // First 4 empty, last has total
      expect(cells[0]).toBe('');
      expect(cells[1]).toBe('');
      expect(cells[2]).toBe('');
      expect(cells[3]).toBe('');
      expect(cells[4]).toContain('Total:');
      expect(cells[4]).toContain('Valor:');
    });

    it('handles empty array', () => {
      const summary = buildSummary([]);
      const cells = summary.render([]);
      expect(cells[4]).toContain('Total: 0 un');
      expect(cells[4]).toContain('Valor:');
      expect(cells[4]).toContain('0,00');
    });
  });

  describe('renderCrudTable', () => {
    it('renders table with header, body, and footer', () => {
      const cols = columns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '<button>Editar</button>',
        emptyTitle: 'Vazio',
        emptyHint: 'Cadastre',
        summary: buildSummary(ingredients)
      });

      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<tfoot>');
      expect(html).toContain('Nome');
      expect(html).toContain('Preço');
      expect(html).toContain('Custo unitário');
      expect(html).toContain('Peso');
      expect(html).toContain('Estoque');
      expect(html).toContain('Arroz');
      expect(html).toContain('Feijão');
      expect(html).toContain('Açúcar');
    });

    it('renders empty state when no rows', () => {
      const cols = columns();
      const html = renderCrudTable({
        columns: cols,
        rows: [],
        actions: () => '',
        emptyTitle: 'Vazio',
        emptyHint: 'Cadastre'
      });

      expect(html).toContain('Vazio');
      expect(html).toContain('Cadastre');
      expect(html).not.toContain('<thead>');
    });

    it('applies center alignment to headers and left alignment to body cells', () => {
      const cols = columns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '',
        emptyTitle: '',
        emptyHint: ''
      });

      // Check header cells are center-aligned
      expect(html).toContain('<th class="text-center">Nome</th>');
      expect(html).toContain('<th class="text-center">Preço</th>');
      expect(html).toContain('<th class="text-center">Custo unitário</th>');
      expect(html).toContain('<th class="text-center">Peso</th>');
      expect(html).toContain('<th class="text-center">Estoque</th>');

      // Check body cells: all left-aligned (no alignment class)
      expect(html).toContain('<td>Arroz</td>');
      expect(html).not.toContain('<td class="text-right num">');
    });

    it('summary row uses column alignment', () => {
      const cols = columns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '',
        emptyTitle: '',
        emptyHint: '',
        summary: buildSummary(ingredients)
      });

      // Summary row should have tfoot
      expect(html).toContain('<tfoot>');
      // Summary uses column alignment: left for all columns
      expect(html).not.toContain('<td class="text-right num">');
      // Should contain total text
      expect(html).toContain('Total:');
    });

    it('summary row first cell (Nome) is empty and not right-aligned', () => {
      const cols = columns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '',
        emptyTitle: '',
        emptyHint: '',
        summary: buildSummary(ingredients)
      });

      const tfootMatch = html.match(/<tfoot>[\s\S]*<\/tfoot>/);
      expect(tfootMatch).toBeTruthy();
      const tfoot = tfootMatch![0];
      // First cell in tfoot (Nome) should be empty and not have text-right
      expect(tfoot).toContain('<td></td>');
    });
  });
});