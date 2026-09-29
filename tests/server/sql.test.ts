import { describe, it, expect } from 'vitest';
import { buildInsert, buildUpdate } from '../../src/server/sql';

describe('buildInsert', () => {
  it('builds an INSERT with placeholders in key order', () => {
    const { sql, values } = buildInsert('ingredients', { id: 'i1', name: 'Farinha', unit: 'g' });
    expect(sql).toBe('INSERT INTO ingredients (id, name, unit) VALUES (?, ?, ?)');
    expect(values).toEqual(['i1', 'Farinha', 'g']);
  });

  it('preserves column ordering', () => {
    const { sql } = buildInsert('t', { b: 1, a: 2 });
    expect(sql).toBe('INSERT INTO t (b, a) VALUES (?, ?)');
    expect(buildInsert('t', { b: 1, a: 2 }).values).toEqual([1, 2]);
  });
});

describe('buildUpdate', () => {
  it('builds an UPDATE scoped by id, with id last in values', () => {
    const { sql, values } = buildUpdate('ingredients', 'i1', { name: 'Farinha', stock: 5 });
    expect(sql).toBe('UPDATE ingredients SET name = ?, stock = ? WHERE id = ?');
    expect(values).toEqual(['Farinha', 5, 'i1']);
  });
});