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

const shapeWithCols = {
  columns: ['id', 'name', 'email', 'jsonField', 'boolField'],
  jsonFields: ['jsonField'],
  boolFields: ['boolField'],
};

describe('entityToRow / rowToEntity with column allowlist', () => {
  // @spec:AC-109
  it('descarta chave fora da allowlist', () => {
    const out = entityToRow(
      { id: '1', name: 'A', email: 'a@b.com', extra: 'drop', jsonField: { k: 1 }, boolField: true },
      shapeWithCols
    );
    expect(out).not.toHaveProperty('extra');
    expect(out.id).toBe('1');
    expect(out.jsonField).toEqual('{"k":1}');
    expect(out.boolField).toBe(1);
  });

  // @spec:AC-110
  it('buildInsert nao interpola coluna desconhecida (via entityToRow)', () => {
    const out = entityToRow({ id: '1', name: 'A', malicious: 'DROP TABLE' }, shapeWithCols);
    expect(Object.keys(out)).toEqual(['id', 'name']);
    expect(out).not.toHaveProperty('malicious');
  });

  // @spec:AC-111
  it('buildUpdate nao interpola coluna desconhecida (via entityToRow)', () => {
    const out = entityToRow({ id: '1', name: 'A', sqlInjection: 'x' }, shapeWithCols);
    expect(Object.keys(out)).toEqual(['id', 'name']);
    expect(out).not.toHaveProperty('sqlInjection');
  });

  // @spec:AC-112
  it('payload de subquery nao executa nem altera o schema', () => {
    const out = entityToRow({ 'id); DROP TABLE users; --': 'x' }, shapeWithCols);
    expect(Object.keys(out)).toHaveLength(0);
    expect(out).not.toHaveProperty('id); DROP TABLE users; --');
  });

  // @spec:AC-114
  it('escrita legitima preserva as colunas reais', () => {
    const payload = { id: 'x', name: 'Legit', email: 'e@e.com', jsonField: { a: 1 }, boolField: false };
    const out = entityToRow(payload, shapeWithCols);
    expect(out.id).toBe('x');
    expect(out.name).toBe('Legit');
    expect(out.email).toBe('e@e.com');
    expect(out.jsonField).toEqual('{"a":1}');
    expect(out.boolField).toBe(0);
  });

  // shape without columns stays permissive (settings route)
  it('shape sem columns mantem comportamento permissivo', () => {
    const permissive = { jsonFields: [], boolFields: [] };
    const out = entityToRow({ a: 1, b: 2 }, permissive);
    expect(out.a).toBe(1);
    expect(out.b).toBe(2);
  });

  // rowToEntity still converts json/bool on read
  it('rowToEntity converte json e bool de volta', () => {
    const row = { id: '1', name: 'A', jsonField: '{"k":1}', boolField: 1 };
    const ent = rowToEntity<{ jsonField: unknown; boolField: unknown }>(row, shapeWithCols);
    expect(ent.jsonField).toEqual({ k: 1 });
    expect(ent.boolField).toBe(true);
  });
});