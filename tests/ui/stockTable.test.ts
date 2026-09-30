// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import type { Ingredient, StockMovement } from '../../src/domain/types';
import { renderCrudTable } from '../../src/ui/CrudTable';
import { renderStockView } from '../../src/ui/views/StockView';
import {
  columns as stockColumns,
  buildSummary as stockBuildSummary,
  groupIngredientsByName,
  type GroupedIngredient
} from '../../src/ui/views/StockView';

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    name: 'Farinha',
    unit: 'g' as Ingredient['unit'],
    packageSize: 1000,
    packagePrice: 10,
    stock: 100,
    minStock: 20,
    ...overrides
  };
}

function makeGroupedIngredient(overrides: Partial<GroupedIngredient> = {}): GroupedIngredient {
  return {
    name: 'Farinha',
    unit: 'g' as Ingredient['unit'],
    stock: 100,
    minStock: 20,
    ids: ['ing-1'],
    ...overrides
  };
}

function makeMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mov-1',
    ingredientId: 'ing-1',
    ingredientName: 'Farinha',
    type: 'entrada',
    qty: 500,
    note: 'Compra',
    date: '2026-09-20T10:00:00Z',
    ...overrides
  };
}

describe('groupIngredientsByName', () => {
  it('groups ingredients with same name (case-insensitive)', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ id: '1', name: 'Farinha', stock: 100, minStock: 20 }),
      makeIngredient({ id: '2', name: 'farinha', stock: 50, minStock: 10 }),
      makeIngredient({ id: '3', name: 'Açúcar', stock: 30, minStock: 5 })
    ];

    const grouped = groupIngredientsByName(ingredients);

    expect(grouped).toHaveLength(2);
    const farinha = grouped.find(g => g.name.toLowerCase() === 'farinha')!;
    expect(farinha.stock).toBe(150); // 100 + 50
    expect(farinha.minStock).toBe(10); // min(20, 10)
    expect(farinha.ids).toEqual(['1', '2']);
    expect(farinha.unit).toBe('g');

    const acucar = grouped.find(g => g.name.toLowerCase() === 'açúcar')!;
    expect(acucar.stock).toBe(30);
    expect(acucar.minStock).toBe(5);
    expect(acucar.ids).toEqual(['3']);
  });

  it('preserves original name casing from first occurrence', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ id: '1', name: 'Farinha de Trigo', stock: 100 }),
      makeIngredient({ id: '2', name: 'FARINHA DE TRIGO', stock: 50 })
    ];

    const grouped = groupIngredientsByName(ingredients);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].name).toBe('Farinha de Trigo');
  });

  it('sorts results alphabetically by name', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ id: '1', name: 'Zezé', stock: 10 }),
      makeIngredient({ id: '2', name: 'Ana', stock: 20 }),
      makeIngredient({ id: '3', name: 'Maria', stock: 30 })
    ];

    const grouped = groupIngredientsByName(ingredients);
    expect(grouped.map(g => g.name)).toEqual(['Ana', 'Maria', 'Zezé']);
  });

  it('handles empty array', () => {
    const grouped = groupIngredientsByName([]);
    expect(grouped).toEqual([]);
  });

  it('handles single ingredient', () => {
    const ingredients: Ingredient[] = [makeIngredient({ id: '1', name: 'Farinha', stock: 100 })];
    const grouped = groupIngredientsByName(ingredients);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].stock).toBe(100);
    expect(grouped[0].ids).toEqual(['1']);
  });

  it('uses minimum minStock when grouping', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ id: '1', name: 'Farinha', stock: 100, minStock: 30 }),
      makeIngredient({ id: '2', name: 'Farinha', stock: 50, minStock: 10 })
    ];

    const grouped = groupIngredientsByName(ingredients);
    expect(grouped[0].minStock).toBe(10);
  });
});

describe('StockView table rendering', () => {
  let ingredients: GroupedIngredient[];
  let movements: StockMovement[];

  beforeEach(() => {
    ingredients = [
      makeGroupedIngredient({ name: 'Farinha', stock: 100, minStock: 20, ids: ['1'] }),
      makeGroupedIngredient({ name: 'Açúcar', stock: 50, minStock: 10, ids: ['2'] }),
      makeGroupedIngredient({ name: 'Manteiga', stock: 5, minStock: 10, ids: ['3'] })
    ];
    movements = [
      makeMovement({ id: '1', ingredientId: '1', ingredientName: 'Farinha', type: 'entrada', qty: 500 }),
      makeMovement({ id: '2', ingredientId: '2', ingredientName: 'Açúcar', type: 'saida', qty: 20 })
    ];
  });

  describe('columns', () => {
    it('returns 4 columns with correct headers', () => {
      const cols = stockColumns();
      expect(cols).toHaveLength(4);
      expect(cols[0].header).toBe('Ingrediente');
      expect(cols[1].header).toBe('Estoque atual');
      expect(cols[2].header).toBe('Mínimo');
      expect(cols[3].header).toBe('Status');
    });

    it('has correct alignment for each column', () => {
      const cols = stockColumns();
      expect(cols[0].alignRight).toBeUndefined();
      expect(cols[1].alignRight).toBe(true);
      expect(cols[2].alignRight).toBe(true);
      expect(cols[3].alignRight).toBeUndefined();
    });

    it('renders Ingrediente column correctly', () => {
      const col = stockColumns()[0];
      const item = makeGroupedIngredient({ name: 'Farinha de Trigo' });
      expect(col.render(item)).toBe('Farinha de Trigo');
    });

    it('renders Estoque atual column with unit', () => {
      const col = stockColumns()[1];
      const item = makeGroupedIngredient({ stock: 250, unit: 'g' as Ingredient['unit'] });
      expect(col.render(item)).toBe('250 g');
    });

    it('renders Mínimo column with unit', () => {
      const col = stockColumns()[2];
      const item = makeGroupedIngredient({ minStock: 15, unit: 'ml' as Ingredient['unit'] });
      expect(col.render(item)).toBe('15 ml');
    });

    it('renders Status badge correctly for OK', () => {
      const col = stockColumns()[3];
      const item = makeGroupedIngredient({ stock: 100, minStock: 20 });
      expect(col.render(item)).toContain('badge-sage');
      expect(col.render(item)).toContain('OK');
    });

    it('renders Status badge correctly for Baixo', () => {
      const col = stockColumns()[3];
      const item = makeGroupedIngredient({ stock: 20, minStock: 20 });
      expect(col.render(item)).toContain('badge-caramel');
      expect(col.render(item)).toContain('Baixo');
    });

    it('renders Status badge correctly for Crítico', () => {
      const col = stockColumns()[3];
      const item = makeGroupedIngredient({ stock: 9, minStock: 20 });
      expect(col.render(item)).toContain('badge-danger');
      expect(col.render(item)).toContain('Crítico');
    });
  });

  describe('buildSummary', () => {
    it('computes total items and low/critical counts', () => {
      const summary = stockBuildSummary(ingredients);
      const cells = summary.render(ingredients);
      expect(cells).toHaveLength(4);
      expect(cells[0]).toBe('');
      expect(cells[1]).toContain('Total:');
      expect(cells[1]).toContain('155 itens'); // 100 + 50 + 5
      expect(cells[2]).toContain('Baixo: 1'); // Manteiga (5 <= 10)
      expect(cells[2]).toContain('Crítico: 1'); // Manteiga (5 <= 10 * 0.5 = 5)
      expect(cells[3]).toBe('');
    });

    it('handles empty array', () => {
      const summary = stockBuildSummary([]);
      const cells = summary.render([]);
      expect(cells[1]).toContain('Total: 0 itens');
      expect(cells[2]).toContain('Baixo: 0');
      expect(cells[2]).toContain('Crítico: 0');
    });

    it('handles all OK items', () => {
      const okItems = [
        makeGroupedIngredient({ name: 'Farinha', stock: 100, minStock: 20 }),
        makeGroupedIngredient({ name: 'Açúcar', stock: 50, minStock: 10 })
      ];
      const summary = stockBuildSummary(okItems);
      const cells = summary.render(okItems);
      expect(cells[1]).toContain('Total: 150 itens');
      expect(cells[2]).toContain('Baixo: 0');
      expect(cells[2]).toContain('Crítico: 0');
    });
  });

  describe('renderCrudTable with stock data', () => {
    it('renders table with header, body, and action buttons', () => {
      const cols = stockColumns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: (i) => `<button data-move="${i.ids[0]}">Movimentar</button>`,
        emptyTitle: 'Sem ingredientes',
        emptyHint: 'Cadastre ingredientes na aba Ingredientes.'
      });

      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('Ingrediente');
      expect(html).toContain('Estoque atual');
      expect(html).toContain('Mínimo');
      expect(html).toContain('Status');
      expect(html).toContain('Farinha');
      expect(html).toContain('Açúcar');
      expect(html).toContain('Manteiga');
      expect(html).toContain('data-move="1"');
      expect(html).toContain('data-move="2"');
      expect(html).toContain('data-move="3"');
    });

    it('renders empty state when no rows', () => {
      const cols = stockColumns();
      const html = renderCrudTable({
        columns: cols,
        rows: [],
        actions: () => '',
        emptyTitle: 'Sem ingredientes',
        emptyHint: 'Cadastre ingredientes na aba Ingredientes.'
      });

      expect(html).toContain('Sem ingredientes');
      expect(html).toContain('Cadastre ingredientes na aba Ingredientes.');
      expect(html).not.toContain('<thead>');
    });

    it('applies right alignment to numeric body cells', () => {
      const cols = stockColumns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '',
        emptyTitle: '',
        emptyHint: ''
      });

      expect(html).toContain('<td class="text-right num">');
      expect(html).toContain('100 g');
      expect(html).toContain('50 g');
      expect(html).toContain('5 g');
    });

    it('renders summary row in tfoot', () => {
      const cols = stockColumns();
      const html = renderCrudTable({
        columns: cols,
        rows: ingredients,
        actions: () => '',
        emptyTitle: '',
        emptyHint: '',
        summary: stockBuildSummary(ingredients)
      });

      expect(html).toContain('<tfoot>');
      expect(html).toContain('Total:');
      expect(html).toContain('155 itens');
      expect(html).toContain('Baixo: 1');
      expect(html).toContain('Crítico: 1');
    });
  });
});

describe('StockView integration', () => {
  let ctx: any;
  let root: HTMLElement;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;

    // Create mock context
    const ingredientsRepo = new InMemoryRepository<Ingredient>();
    const movementsRepo = new InMemoryRepository<StockMovement>();

    // Seed data
    ingredientsRepo.stash(makeIngredient({ id: '1', name: 'Farinha', stock: 100, minStock: 20 }));
    ingredientsRepo.stash(makeIngredient({ id: '2', name: 'Açúcar', stock: 50, minStock: 10 }));
    ingredientsRepo.stash(makeIngredient({ id: '3', name: 'Manteiga', stock: 5, minStock: 10 }));
    movementsRepo.stash(makeMovement({ id: '1', ingredientId: '1', ingredientName: 'Farinha', type: 'entrada', qty: 500 }));
    movementsRepo.stash(makeMovement({ id: '2', ingredientId: '2', ingredientName: 'Açúcar', type: 'saida', qty: 20 }));

    ctx = {
      ingredients: ingredientsRepo,
      movements: movementsRepo,
      stock: {
        registerMovement: vi.fn().mockResolvedValue(undefined)
      }
    };
  });

  it('renders stock view with ingredients', () => {
    const dispose = renderStockView(root, ctx);
    expect(root.innerHTML).toContain('Estoque');
    expect(root.innerHTML).toContain('Farinha');
    expect(root.innerHTML).toContain('Açúcar');
    expect(root.innerHTML).toContain('Manteiga');
    expect(root.innerHTML).toContain('100 g');
    expect(root.innerHTML).toContain('50 g');
    expect(root.innerHTML).toContain('5 g');
    dispose();
  });

  it('shows correct status badges', () => {
    const dispose = renderStockView(root, ctx);
    expect(root.innerHTML).toContain('badge-sage'); // Farinha: OK
    expect(root.innerHTML).toContain('badge-sage'); // Açúcar: OK
    expect(root.innerHTML).toContain('badge-danger'); // Manteiga: Crítico (5 <= 10 * 0.5 = 5)
    dispose();
  });

  it('shows history of movements', () => {
    const dispose = renderStockView(root, ctx);
    expect(root.innerHTML).toContain('Últimas movimentações');
    expect(root.innerHTML).toContain('Farinha');
    expect(root.innerHTML).toContain('Açúcar');
    expect(root.innerHTML).toContain('+500');
    expect(root.innerHTML).toContain('-20');
    dispose();
  });

  it('updates when ingredients change @spec:AC-042', () => {
    const dispose = renderStockView(root, ctx);
    expect(root.innerHTML).toContain('Farinha');

    // Add a new ingredient
    ctx.ingredients.stash(makeIngredient({ id: '4', name: 'Fermento', stock: 10, minStock: 2 }));

    // Trigger re-render
    ctx.ingredients.subscribe(() => {})();

    expect(root.innerHTML).toContain('Fermento');
    expect(root.innerHTML).toContain('10 g');
    const rows = Array.from(root.querySelectorAll('tbody tr'));
    const row = rows.find((r) => r.textContent?.includes('Fermento'));
    expect(row?.textContent).toContain('10 g');
    dispose();
  });

  it('updates when ingredient stock changes', () => {
    const dispose = renderStockView(root, ctx);
    expect(root.innerHTML).toContain('100 g');

    // Update stock
    ctx.ingredients.stash(makeIngredient({ id: '1', name: 'Farinha', stock: 200, minStock: 20 }));

    // Trigger re-render
    ctx.ingredients.subscribe(() => {})();

    expect(root.innerHTML).toContain('200 g');
    dispose();
  });

  it('groups ingredients with same name in the view', () => {
    // Add another ingredient with same name but different case
    ctx.ingredients.stash(makeIngredient({ id: '4', name: 'farinha', stock: 50, minStock: 10 }));

    const dispose = renderStockView(root, ctx);

    // Should show only one "Farinha" row in the table with combined stock (100 + 50 = 150)
    // Check that the table has only one row for Farinha (not counting history)
    const tableRows = root.querySelectorAll('tbody tr');
    const farinhaRows = Array.from(tableRows).filter(row =>
      row.textContent?.includes('Farinha')
    );
    expect(farinhaRows.length).toBe(1);
    expect(root.innerHTML).toContain('150 g');
    dispose();
  });

  it('uses minimum minStock when grouping same-name ingredients', () => {
    // Add another Farinha with lower minStock
    ctx.ingredients.stash(makeIngredient({ id: '4', name: 'Farinha', stock: 30, minStock: 5 }));

    const dispose = renderStockView(root, ctx);

    // Should use minStock = 5 (minimum of 20 and 5)
    // With stock 130 and minStock 5, status should be OK (130 > 5)
    expect(root.innerHTML).toContain('badge-sage');
    dispose();
  });
});