// A minimal in-memory D1 test double. It understands exactly the SQL
// statements the app generates (crud.ts + the settings route) and keeps
// per-table rows so SELECT/INSERT/UPDATE/DELETE round-trip correctly.
type Row = Record<string, unknown>;

const INSERT_RE = /^INSERT(?: OR (?:IGNORE|REPLACE))? INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/;
const UPDATE_RE = /^UPDATE (\w+) SET (.+) WHERE (\w+) = \?$/;
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
    const [, table, setClause, whereColumn] = match;
    const pairs = splitIdentifiers(setClause);
    const setValues = values.slice(0, pairs.length);
    const whereValue = values[pairs.length];
    const patch = buildPatch(pairs, setValues);
    if (externalConflict(table, this.rows(table), patch, String(whereValue))) {
      throw new Error('UNIQUE constraint failed: messages.externalId');
    }
    const rows = this.rows(table).map((r) =>
      r[whereColumn] === String(whereValue) ? { ...r, ...patch } : r
    );
    this.tables.set(table, rows);
    return rows.filter((r) => r[whereColumn] === String(whereValue));
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

function likeMatch(value: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'
  );
  return regex.test(value);
}

function buildPatch(pairs: string[], values: unknown[]): Row {
  const patch: Row = {};
  pairs.forEach((pair, i) => {
    patch[pair.slice(0, pair.indexOf(' = '))] = values[i];
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