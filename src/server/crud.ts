import type { TableShape } from './mapping';
import type { Database } from './db';
import { rowToEntity, entityToRow } from './mapping';
import { buildInsert, buildUpdate } from './sql';

// Every entity (ingredients, components, products...) is a plain table
// with an `id TEXT PRIMARY KEY` plus some JSON/boolean columns. Rather
// than hand-writing near-identical SQL per entity, every /api/* route
// configures this once (table name + which columns are JSON/boolean)
// and reuses it — adding a new entity never requires new SQL.
export async function listEntities<T>(
  db: Database,
  table: string,
  shape: TableShape
): Promise<T[]> {
  const stmt = db.prepare(`SELECT * FROM ${table}`);
  const { results } = await stmt.all<Record<string, unknown>>();
  return (results ?? []).map((row) => rowToEntity<T>(row, shape));
}

export async function getEntity<T>(
  db: Database,
  table: string,
  shape: TableShape,
  id: string,
  idColumn = 'id'
): Promise<T | null> {
  const stmt = db.prepare(
    `SELECT * FROM ${table} WHERE ${idColumn} = ?`
  );
  const row = await stmt.bind(id).first<Record<string, unknown>>();
  return row ? rowToEntity<T>(row, shape) : null;
}

export async function insertEntity<T>(
  db: Database,
  table: string,
  shape: TableShape,
  entity: T
): Promise<T> {
  const row = entityToRow(
    entity as unknown as Record<string, unknown>,
    shape
  );
  const { sql, values } = buildInsert(table, row);
  await db.prepare(sql).bind(...values).run();
  return entity;
}

export async function updateEntity<T extends { id: string }>(
  db: Database,
  table: string,
  shape: TableShape,
  id: string,
  patch: Partial<T>
): Promise<T | null> {
  const existing = await getEntity<T>(db, table, shape, id);
  if (!existing) return null;
  const merged = { ...existing, ...patch } as T;
  const row = entityToRow(
    merged as unknown as Record<string, unknown>,
    shape
  );
  const { sql, values } = buildUpdate(table, id, row);
  await db.prepare(sql).bind(...values).run();
  return merged;
}

export async function deleteEntity(
  db: Database,
  table: string,
  id: string,
  idColumn = 'id'
): Promise<void> {
  const stmt = db.prepare(
    `DELETE FROM ${table} WHERE ${idColumn} = ?`
  );
  await stmt.bind(id).run();
}