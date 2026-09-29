// A minimal in-memory D1 test double. It understands exactly the SQL
// statements the app generates (crud.ts + the settings route) and keeps
// per-table rows so SELECT/INSERT/UPDATE/DELETE round-trip correctly.
import { readFileSync, readdirSync } from 'node:fs';

type Row = Record<string, unknown>;

/** The columns one table has, and which of them are NOT NULL. */
export interface TableSchema {
  columns: Set<string>;
  required: Set<string>;
}

const CREATE_TABLE_RE = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+) \((.+)\)$/;
const ALTER_ADD_RE = /^ALTER TABLE (\w+) ADD COLUMN (\w+) (.+)$/;
const CREATE_INDEX_RE = /^CREATE (?:UNIQUE )?INDEX/;
const MIGRATIONS_DIR = 'migrations';

/** Every `.sql` file under migrations/, in the order the scripts apply them. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name: string) => name.endsWith('.sql'))
    .sort()
    .map((name: string) => `${MIGRATIONS_DIR}/${name}`);
}

/**
 * The schema a set of migrations produces, so a test can assert the columns
 * the code writes actually exist. CREATE TABLE contributes its column list;
 * a later ALTER TABLE ... ADD COLUMN contributes one more.
 */
export function schemaFromMigrations(
  files: string[]
): Map<string, TableSchema> {
  const schema = new Map<string, TableSchema>();
  for (const entry of files) {
    const file = entry.startsWith(`${MIGRATIONS_DIR}/`)
      ? entry
      : `${MIGRATIONS_DIR}/${entry}`;
    const sql = readFileSync(file, 'utf8');
    for (const statement of splitStatements(sql)) {
      applySchemaStatement(schema, statement);
    }
  }
  return schema;
}

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function applySchemaStatement(
  schema: Map<string, TableSchema>,
  statement: string
): void {
  const created = CREATE_TABLE_RE.exec(statement);
  if (created) {
    schema.set(created[1], readColumns(created[2]));
    return;
  }
  const altered = ALTER_ADD_RE.exec(statement);
  if (!altered) return;
  const [, table, column, definition] = altered;
  const entry = schema.get(table) ?? { columns: new Set(), required: new Set() };
  entry.columns.add(column);
  if (/\bNOT NULL\b/.test(definition)) entry.required.add(column);
  schema.set(table, entry);
}

function readColumns(body: string): TableSchema {
  const entry: TableSchema = { columns: new Set(), required: new Set() };
  for (const line of body.split(',')) {
    const [rawName, ...rest] = line.trim().split(/\s+/);
    const name = rawName.replace(/[^A-Za-z0-9_]/g, '');
    if (!name) continue;
    entry.columns.add(name);
    if (/\bNOT NULL\b/.test(rest.join(' '))) entry.required.add(name);
  }
  return entry;
}

const INSERT_RE = /^INSERT(?: OR (?:IGNORE|REPLACE))? INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/;
const UPDATE_RE = /^UPDATE (\w+) SET (.+) WHERE (.+)$/;
const DELETE_RE = /^DELETE FROM (\w+) WHERE (\w+) = \?$/;
const DELETE_WHERE_RE = /^DELETE FROM (\w+)\s+WHERE\s+(.+)$/;
const SELECT_ONE_RE = /^SELECT \* FROM (\w+) WHERE (\w+) = \?$/;
const SELECT_ALL_RE = /^SELECT \* FROM (\w+)$/;
const SELECT_COLS_RE = /^SELECT (.+?) FROM (\w+)$/;
const SELECT_COLS_WHERE_RE = /^SELECT (.+?) FROM (\w+)\s+WHERE\s+(.+)$/s;
const SELECT_WHERE_RE = /^SELECT \* FROM (\w+)\s+WHERE\s+(.+?)\s+ORDER BY\s+(\w+)\s+(DESC|ASC)\s+LIMIT\s+\?\s+OFFSET\s+\?$/s;
const SELECT_WHERE_SIMPLE_RE = /^SELECT \* FROM (\w+)\s+WHERE\s+(.+)$/s;

function splitIdentifiers(list: string): string[] {
  return list.split(',').map((s) => s.trim());
}

export class FakeD1 {
  constructor(private tables = new Map<string, Row[]>()) {}

  static empty(): FakeD1 {
    return new FakeD1();
  }

  static with(table: string, rows: Row[]): FakeD1 {
    return new FakeD1(new Map([[table, rows]]));
  }

  /** Seeds several tables at once — mirrors the app's D1 layout. */
  static from(tables: Record<string, Row[]>): FakeD1 {
    return new FakeD1(new Map(Object.entries(tables)));
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]): Promise<unknown> {
    const results: unknown[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  execute(sql: string, values: unknown[]): Row[] {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const ddl = this.executeDdl(normalized);
    if (ddl) return ddl;
    const handled = this.executeDelete(normalized, values);
    if (handled) return handled;
    const updated = this.executeUpdate(normalized, values);
    if (updated) return updated;
    const selected = this.executeSelect(normalized, values);
    if (selected) return selected;
    const inserted = this.executeInsert(normalized, values);
    if (inserted) return inserted;
    throw new Error(`FakeD1: unsupported SQL: ${sql}`);
  }

  private executeDdl(sql: string): Row[] | null {
    if (CREATE_INDEX_RE.test(sql)) return [];
    const altered = ALTER_ADD_RE.exec(sql);
    if (!altered) return null;
    const [, table, column, definition] = altered;
    if (!this.tables.has(table)) this.tables.set(table, []);
    const fallback = readDefault(definition);
    const rows = this.rows(table).map((r) =>
      column in r ? r : { ...r, [column]: fallback }
    );
    this.tables.set(table, rows);
    return [];
  }

  private executeDelete(sql: string, values: unknown[]): Row[] | null {
    const whereMatch = DELETE_WHERE_RE.exec(sql);
    if (!whereMatch) return null;
    const [, table, whereClause] = whereMatch;
    const conditions = this.parseWhereClause(whereClause, values);
    this.tables.set(table, this.rows(table).filter((r) =>
      !conditions.every(([col, op, val]) => {
        const cell = r[col];
        switch (op) {
          case '=': return cell === val;
          case '!=': return cell !== val;
          case '>': return String(cell) > String(val);
          case '<': return String(cell) < String(val);
          case '>=': return String(cell) >= String(val);
          case '<=': return String(cell) <= String(val);
          case 'NOT LIKE': return !likeMatch(String(cell), String(val));
          case 'LIKE': return likeMatch(String(cell), String(val));
          default: return true;
        }
      })
    ));
    return [];
  }

  private executeUpdate(sql: string, values: unknown[]): Row[] | null {
    const match = UPDATE_RE.exec(sql);
    if (!match) return null;
    const [, table, setClause, whereClause] = match;
    const bound = (setClause.match(/\?/g) ?? []).length;
    const patch = buildPatch(splitIdentifiers(setClause), values.slice(0, bound));
    const conditions = this.parseWhereClause(whereClause, values.slice(bound));
    const excludingId = findIdValue(conditions);
    if (externalConflict(table, this.rows(table), patch, excludingId)) {
      throw new Error('UNIQUE constraint failed: messages.externalId');
    }
    const matches = (r: Row) =>
      conditions.every(([col, , val]) => r[col] === String(val));
    const rows = this.rows(table).map((r) => (matches(r) ? { ...r, ...patch } : r));
    this.tables.set(table, rows);
    return rows.filter(matches);
  }

  private executeSelect(sql: string, values: unknown[]): Row[] | null {
    const all = SELECT_ALL_RE.exec(sql);
    if (all) return [...this.rows(all[1])];
    const one = SELECT_ONE_RE.exec(sql);
    if (one) {
      const [, table, column] = one;
      return this.rows(table).filter((r) => r[column] === String(values[0]));
    }
    const colsWhere = SELECT_COLS_WHERE_RE.exec(sql);
    if (colsWhere) {
      const [, columns, table, whereClause] = colsWhere;
      const colList = splitIdentifiers(columns);
      const conditions = this.parseWhereClause(whereClause, values);
      return this.rows(table)
        .filter((r) => conditions.every(([col, op, val]) => {
          const cell = r[col];
          switch (op) {
            case '=': return cell === val;
            case '!=': return cell !== val;
            case '>': return String(cell) > String(val);
            case '<': return String(cell) < String(val);
            case '>=': return String(cell) >= String(val);
            case '<=': return String(cell) <= String(val);
            case 'NOT LIKE': return !likeMatch(String(cell), String(val));
            case 'LIKE': return likeMatch(String(cell), String(val));
            default: return true;
          }
        }))
        .map((r) => {
          const projected: Row = {};
          for (const c of colList) projected[c] = r[c];
          return projected;
        });
    }
    const cols = SELECT_COLS_RE.exec(sql);
    if (cols) {
      const [, columns, table] = cols;
      const colList = splitIdentifiers(columns);
      return this.rows(table).map((r) => {
        const projected: Row = {};
        for (const c of colList) projected[c] = r[c];
        return projected;
      });
    }
    const whereMatch = SELECT_WHERE_RE.exec(sql);
    if (whereMatch) {
      const [, table, whereClause, orderBy, orderDir, limit, offset] = whereMatch;
      let rows = this.rows(table);
      const conditions = this.parseWhereClause(whereClause, values.slice(0, -2));
      rows = rows.filter((r) => conditions.every(([col, op, val]) => {
        const cell = r[col];
        switch (op) {
          case '=': return cell === val;
          case '!=': return cell !== val;
          case '>': return String(cell) > String(val);
          case '<': return String(cell) < String(val);
          case '>=': return String(cell) >= String(val);
          case '<=': return String(cell) <= String(val);
          default: return true;
        }
      }));
      if (orderDir === 'DESC') {
        rows.sort((a, b) => String(b[orderBy]).localeCompare(String(a[orderBy])));
      } else {
        rows.sort((a, b) => String(a[orderBy]).localeCompare(String(b[orderBy])));
      }
      const lim = Number(values[values.length - 2]);
      const off = Number(values[values.length - 1]);
      return rows.slice(off, off + lim);
    }
    const simpleWhere = SELECT_WHERE_SIMPLE_RE.exec(sql);
    if (simpleWhere) {
      const [, table, whereClause] = simpleWhere;
      let rows = this.rows(table);
      const conditions = this.parseWhereClause(whereClause, values);
      return rows.filter((r) => conditions.every(([col, op, val]) => {
        const cell = r[col];
        switch (op) {
          case '=': return cell === val;
          case '!=': return cell !== val;
          default: return true;
        }
      }));
    }
    return null;
  }

  private parseWhereClause(
    clause: string, values: unknown[]
  ): Array<[string, string, unknown]> {
    const conditions: Array<[string, string, unknown]> = [];
    const parts = clause.split(' AND ');
    let valueIndex = 0;
    for (const part of parts) {
      const likeLiteral = part.trim().match(/^(\w+)\s+(NOT\s+LIKE|LIKE)\s+'([^']*)'$/);
      if (likeLiteral) {
        conditions.push([likeLiteral[1], likeLiteral[2].replace(/\s+/g, ' '), likeLiteral[3]]);
        continue;
      }
      const likeParam = part.trim().match(/^(\w+)\s+(NOT\s+LIKE|LIKE)\s*\?$/);
      if (likeParam) {
        conditions.push([likeParam[1], likeParam[2].replace(/\s+/g, ' '), values[valueIndex++]]);
        continue;
      }
      const literalMatch = part.trim().match(/^(\w+)\s*(=|!=|>|<|>=|<=)\s*'([^']*)'$/);
      if (literalMatch) {
        conditions.push([literalMatch[1], literalMatch[2], literalMatch[3]]);
        continue;
      }
      const match = part.trim().match(/^(\w+)\s*(=|!=|>|<|>=|<=)\s*\?$/);
      if (match) {
        conditions.push([match[1], match[2], values[valueIndex++]]);
      }
    }
    return conditions;
  }

  private executeInsert(sql: string, values: unknown[]): Row[] | null {
    const match = INSERT_RE.exec(sql);
    if (!match) return null;
    const [, table, cols, placeholders] = match;
    const columns = splitIdentifiers(cols);
    const placeholdersCount = splitIdentifiers(placeholders).length;
    const row = buildRow(columns, values, placeholdersCount);
    const existing = this.rows(table);
    const replace = /^INSERT OR REPLACE /.test(sql);
    const ignore = /^INSERT OR IGNORE /.test(sql);
    if (replace && 'id' in row && existing.some((r) => r.id === String(row.id))) {
      this.tables.set(table, existing.map((r) =>
        r.id === String(row.id) ? { ...r, ...row } : r
      ));
      return [row];
    }
    if (externalConflict(table, existing, row, null)) {
      if (ignore) return [];
      throw new Error('UNIQUE constraint failed: messages.externalId');
    }
    this.tables.set(table, [...existing, row]);
    return [row];
  }
}

// Mirrors `idx_messages_external` (migrations/0007_waha.sql): the unique index
// on `messages(externalId)` applies only to NON-NULL values, and two rows may
// never share a non-null external id.
function externalConflict(
  table: string, rows: Row[], row: Row, excludingId: string | null
): boolean {
  if (table !== 'messages') return false;
  const externalId = row.externalId;
  if (externalId === null || externalId === undefined) return false;
  return rows.some(
    (r) =>
      String(r.externalId) === String(externalId) && r.id !== excludingId
  );
}

function readDefault(definition: string): unknown {
  const literal = /DEFAULT\s+'([^']*)'/i.exec(definition);
  if (literal) return literal[1];
  const numeric = /DEFAULT\s+(-?\d+(?:\.\d+)?)/i.exec(definition);
  return numeric ? Number(numeric[1]) : '';
}

function likeMatch(value: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'
  );
  return regex.test(value);
}

function findIdValue(conditions: Array<[string, string, unknown]>): string | null {
  const id = conditions.find(([col, op]) => col === 'id' && op === '=');
  return id ? String(id[2]) : null;
}

function buildPatch(pairs: string[], values: unknown[]): Row {
  const patch: Row = {};
  let next = 0;
  pairs.forEach((pair) => {
    const eq = pair.indexOf(' = ');
    if (eq < 0) return;
    const column = pair.slice(0, eq);
    const literal = /'([^']*)'/.exec(pair.slice(eq + 3));
    patch[column] = literal ? literal[1] : values[next++];
  });
  delete patch.id;
  return patch;
}

function buildRow(columns: string[], values: unknown[], count: number): Row {
  const row: Row = {};
  for (let i = 0; i < columns.length && i < count; i++) {
    row[columns[i]] = values[i];
  }
  return row;
}

class FakeStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly sql: string) {}

  bind(...values: unknown[]): FakeStatement {
    this.values = values;
    return this;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const before = this.db.rows(this.table()).length;
    this.db.execute(this.sql, this.values);
    const after = this.db.rows(this.table()).length;
    return { meta: { changes: Math.max(0, before - after) } };
  }

  private table(): string {
    const m = /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/.exec(this.sql);
    return m?.[1] ?? '';
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.db.execute(this.sql, this.values);
    return (rows[0] as T) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    const rows = this.db.execute(this.sql, this.values) as T[];
    return { results: rows };
  }
}