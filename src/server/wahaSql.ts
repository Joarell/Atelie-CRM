import type { Database, PreparedStatement } from './db';

// Low-level SQL + payload field helpers shared by the WAHA ingest modules.
// Kept explicit (never going through crud.ts) so FakeD1 and D1 agree.

export async function findWhere<T>(
  db: Database,
  table: string,
  column: string,
  value: unknown
): Promise<T[]> {
  const { results } = await db
    .prepare(`SELECT * FROM ${table} WHERE ${column} = ?`)
    .bind(value)
    .all<T>();
  return results ?? [];
}

export async function updateById<T extends { id: string }>(
  db: Database,
  table: string,
  id: string,
  patch: Partial<T>
): Promise<void> {
  const keys = Object.keys(patch).filter(
    (k) => patch[k as keyof T] !== undefined
  );
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await commit(db, db.prepare(
    `UPDATE ${table} SET ${setClause} WHERE id = ?`)
    .bind(...keys.map((k) => patch[k as keyof T]), id)
  );
}

async function commit(
  db: Database, statement: PreparedStatement
): Promise<void> {
  // Single `.prepare().run()` writes are unreliable from some dev-worker
  // routes (silently dropped), while `batch()` always persists — so every
  // WAHA write goes through the batch path.
  await db.batch([statement]);
}

export async function deleteById(
  db: Database, table: string, id: string
): Promise<void> {
  await commit(
    db, db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id)
  );
}

export async function insertById<T extends { id: string }>(
  db: Database,
  table: string,
  entity: T
): Promise<void> {
  const keys = Object.keys(entity).filter(
    (k) => entity[k as keyof T] !== undefined
  );
  const cols = keys.join(', ');
  const holes = keys.map(() => '?').join(', ');
  await commit(
    db,
    db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${holes})`)
      .bind(...keys.map((k) => entity[k as keyof T]))
  );
}

export async function touchConversation(
  db: Database,
  id: string,
  at: string
): Promise<void> {
  await commit(
    db,
    db.prepare('UPDATE conversations SET lastMessageAt = ? WHERE id = ?')
      .bind(at, id)
  );
}

export function textField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, 2000)
    : fallback;
}

export function numericField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function truncate(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function defaultFor(_column: string, _row: unknown): unknown {
  return '';
}