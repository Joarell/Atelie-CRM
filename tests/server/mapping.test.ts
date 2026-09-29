import { describe, it, expect } from 'vitest';
import { rowToEntity, entityToRow } from '../../src/server/mapping';
import { PRODUCTS_SHAPE, ORDERS_SHAPE } from '../../src/server/tables';

describe('rowToEntity', () => {
  it('decodes JSON fields and boolean fields', () => {
    const entity = rowToEntity<Record<string, unknown>>(
      { id: 'p1', name: 'Bolo', items: '{"x":1}', stockDeducted: 1 },
      { jsonFields: ['items'], boolFields: ['stockDeducted'] }
    );
    expect(entity).toEqual({ id: 'p1', name: 'Bolo', items: { x: 1 }, stockDeducted: true });
  });

  it('leaves non-JSON strings untouched', () => {
    const entity = rowToEntity<Record<string, unknown>>({ name: 'plain' }, { jsonFields: ['name'] });
    expect(entity.name).toBe('plain');
  });

  it('works with the real product shape', () => {
    const entity = rowToEntity<Record<string, unknown>>(
      { id: 'p1', labor: '{"salary":1800}', items: '[1]', fixedExpenses: '{}' },
      PRODUCTS_SHAPE
    );
    expect(entity.labor).toEqual({ salary: 1800 });
    expect(entity.items).toEqual([1]);
  });
});

describe('entityToRow', () => {
  it('encodes JSON fields and boolean fields', () => {
    const row = entityToRow(
      { id: 'p1', name: 'Bolo', items: { x: 1 }, stockDeducted: true },
      { jsonFields: ['items'], boolFields: ['stockDeducted'] }
    );
    expect(row).toEqual({ id: 'p1', name: 'Bolo', items: '{"x":1}', stockDeducted: 1 });
  });

  it('skips fields not present on the entity', () => {
    const row = entityToRow({ id: 'p1' }, ORDERS_SHAPE);
    expect(row).toEqual({ id: 'p1' });
    expect('lines' in row).toBe(false);
  });

  it('keeps scalar fields as-is', () => {
    const row = entityToRow({ id: 'i1', stock: 4.5 }, {});
    expect(row).toEqual({ id: 'i1', stock: 4.5 });
  });
});