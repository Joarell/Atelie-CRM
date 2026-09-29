// The server layer only ever touches `prepare()` on D1: it builds a
// statement, binds values and runs/fetches it. Depending on this narrow
// interface instead of the full `D1Database` keeps the layer honest about
// what it uses and lets the tests drive it with an in-memory double
// (`tests/helpers/fakeD1.ts`). The real D1 binding is assignable to it.
export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface Database {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown>;
}
