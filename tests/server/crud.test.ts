import { describe, it, expect } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import { listEntities, getEntity, insertEntity, updateEntity, deleteEntity } from '../../src/server/crud';
import { PRODUCTS_SHAPE } from '../../src/server/tables';

const product = {
  id: 'p1', name: 'Bolo', labor: { salary: 1800 }, fixedExpenses: {}, items: []
};

describe('listEntities', () => {
  it('returns rows mapped through the table shape', async () => {
    const db = FakeD1.with('products', [product]);
    const rows = await listEntities(db, 'products', PRODUCTS_SHAPE);
    expect(rows).toEqual([{ ...product, labor: { salary: 1800 } }]);
  });

  it('returns an empty list for an unknown table', async () => {
    const rows = await listEntities(FakeD1.empty(), 'products', PRODUCTS_SHAPE);
    expect(rows).toEqual([]);
  });
});

describe('getEntity', () => {
  it('returns the entity for an existing id', async () => {
    const db = FakeD1.with('products', [product]);
    const found = await getEntity(db, 'products', PRODUCTS_SHAPE, 'p1');
    expect(found).toEqual({ ...product, labor: { salary: 1800 } });
  });

  it('returns null for a missing id', async () => {
    const db = FakeD1.with('products', [product]);
    expect(await getEntity(db, 'products', PRODUCTS_SHAPE, 'nope')).toBeNull();
  });
});

describe('insertEntity', () => {
  it('persists the entity and returns it', async () => {
    const db = FakeD1.empty();
    const saved = await insertEntity(db, 'products', PRODUCTS_SHAPE, { ...product, id: 'p1' });
    expect(saved.id).toBe('p1');
    expect(db.rows('products')).toHaveLength(1);
    expect(db.rows('products')[0].labor).toBe('{"salary":1800}');
  });
});

describe('updateEntity', () => {
  const patch = { name: 'Bolo de Chocolate' };

  it('merges the patch on top of the existing row', async () => {
    const db = FakeD1.with('products', [product]);
    const saved = await updateEntity<typeof product>(db, 'products', PRODUCTS_SHAPE, 'p1', patch);
    expect(saved).toMatchObject({ id: 'p1', name: 'Bolo de Chocolate' });
    expect(db.rows('products')[0]).toMatchObject({ id: 'p1', name: 'Bolo de Chocolate' });
  });

  it('returns null when the row does not exist', async () => {
    const db = FakeD1.empty();
    expect(await updateEntity<typeof product>(db, 'products', PRODUCTS_SHAPE, 'nope', patch)).toBeNull();
  });
});

describe('deleteEntity', () => {
  it('removes the row', async () => {
    const db = FakeD1.with('products', [product]);
    await deleteEntity(db, 'products', 'p1');
    expect(db.rows('products')).toHaveLength(0);
  });

  it('is a no-op for a missing id', async () => {
    const db = FakeD1.with('products', [product]);
    await deleteEntity(db, 'products', 'nope');
    expect(db.rows('products')).toHaveLength(1);
  });
});