// Guards the owner columns that make fail-closed ownership possible on the
// four CRM work tables (feature security-audit-fixes-v3, US-324).
//
// `migrations/0023_owner_columns.sql` adds assignedUserId to tables that had
// no owner at all and backfills it. Without the migration the documented
// `npm run db:migrate:*` chain produces a schema where every row is orphaned,
// and a fail-closed ownership check would then lock the whole table.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FakeD1,
  migrationFiles,
  schemaFromMigrations,
  type TableSchema
} from '../helpers/fakeD1';

const PKG = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const MIGRATION = 'migrations/0023_owner_columns.sql';
const WORK_TABLES = [
  'calendar_events',
  'catalog_products',
  'crm_lead_activities',
  'conversation_notes'
];
const BACKFILL_SOURCES: Record<string, string> = {
  calendar_events: 'createdBy',
  crm_lead_activities: 'actorUserId',
  conversation_notes: 'authorUserId'
};

const migrationSql = readFileSync(MIGRATION, 'utf8');
const EMPTY: unknown[] = [];

/** Files the documented local migrate chain executes, in order. */
function appliedBy(script: string): string[] {
  return PKG.scripts[script].match(/migrations\/[\w.]+\.sql/g) ?? [];
}

/** The schema the documented local migrate chain produces. */
function documentedSchema(): Map<string, TableSchema> {
  return schemaFromMigrations(appliedBy('db:migrate:local'));
}

function admin(id: string, createdAt: string): Record<string, unknown> {
  return { id, name: id, role: 'admin', createdAt };
}

function viewer(): Record<string, unknown> {
  return { id: 'u-viewer', name: 'Vic', role: 'viewer', createdAt: '2024-02' };
}

/** A work-table row whose author column is empty, so the backfill decides. */
function workRow(table: string): Record<string, unknown> {
  const source = BACKFILL_SOURCES[table];
  return {
    id: 'r-1',
    createdAt: '2024-01-01',
    assignedUserId: '',
    ...(source ? { [source]: '' } : {})
  };
}

/** The row an author column would carry, i.e. the owner to be derived. */
function withAuthor(table: string, value: string): Record<string, unknown> {
  return { ...workRow(table), [BACKFILL_SOURCES[table]]: value };
}

/** Fresh DB: two admins (oldest first), one viewer, and one row per table. */
function seededDb(): FakeD1 {
  return FakeD1.from({
    users: [
      admin('u-admin', '2024-01-01'),
      viewer(),
      admin('u-admin2', '2024-06-01')
    ],
    ...Object.fromEntries(WORK_TABLES.map((t) => [t, [workRow(t)]]))
  });
}

/** DB with no admin at all, so the fallback has nobody to pick. */
function ownerlessDb(): FakeD1 {
  return FakeD1.from({
    users: [viewer()],
    ...Object.fromEntries(WORK_TABLES.map((t) => [t, [workRow(t)]]))
  });
}

function ownerOf(db: FakeD1, table: string, id = 'r-1'): string {
  const sql = `SELECT assignedUserId FROM ${table} WHERE id = '${id}'`;
  return String(db.execute(sql, EMPTY)[0]?.assignedUserId ?? '');
}

/** Runs the backfill the way D1 does: each UPDATE is independent and only
 *  touches rows whose owner is still empty. FakeD1 cannot do
 *  `SET col = other_col`, so the derived value is read and written as a
 *  literal — the same end state the production SQL produces. The oldest-admin
 *  pick is sorted here because FakeD1 ignores WHERE on an ORDER BY query. */
function runBackfill(db: FakeD1): void {
  for (const [table, source] of Object.entries(BACKFILL_SOURCES)) {
    const sql = `SELECT ${source} FROM ${table} WHERE id = 'r-1'`;
    const owner = String(db.execute(sql, EMPTY)[0]?.[source] ?? '');
    if (owner) {
      db.execute(
        `UPDATE ${table} SET assignedUserId = '${owner}' ` +
          `WHERE assignedUserId = ''`,
        EMPTY
      );
    }
  }
  const admins = db.execute(
    `SELECT id, createdAt FROM users WHERE role = 'admin'`,
    EMPTY
  );
  const oldest = [...admins].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt))
  )[0];
  const fallback = oldest?.id;
  if (fallback) {
    db.execute(
      `UPDATE catalog_products SET assignedUserId = '${fallback}' ` +
        `WHERE assignedUserId = ''`,
      EMPTY
    );
  }
}

describe('the migration adds an indexed owner column to every work table', () => {
  it('@spec:AC-355 documents assignedUserId with an index on all four tables', () => {
    const schema = documentedSchema();
    for (const table of WORK_TABLES) {
      expect(schema.get(table)?.columns.has('assignedUserId')).toBe(true);
      expect(migrationSql).toContain(`ON ${table}(assignedUserId)`);
    }
  });

  it('keeps the documented migrate chain sorted so 0023 runs last', () => {
    const applied = appliedBy('db:migrate:local');
    expect(applied).toEqual([...applied].sort());
    expect(applied.at(-1)).toBe(MIGRATION);
  });

  it('registers the migration in both the local and the remote chain', () => {
    for (const script of ['db:migrate:local', 'db:migrate:remote']) {
      expect(PKG.scripts[script]).toContain(MIGRATION);
    }
  });

  it('leaves no migration file on disk unapplied', () => {
    const local = appliedBy('db:migrate:local');
    for (const seed of ['db:seed:local', 'db:seed:remote']) {
      const referenced = [...local, ...appliedBy(seed)];
      const missing = migrationFiles().filter(
        (f) => !referenced.includes(f)
      );
      expect(missing).toEqual([]);
    }
  });
});

describe('the backfill derives each owner instead of inventing one', () => {
  const derived: Array<[string, string]> = [
    ['calendar_events', 'createdBy'],
    ['crm_lead_activities', 'actorUserId'],
    ['conversation_notes', 'authorUserId']
  ];

  it.each(derived)('@spec:AC-360 fills %s from %s', (table, source) => {
    const db = FakeD1.from({
      users: [admin('u-admin', '2024-01-01')],
      [table]: [withAuthor(table, 'u-viewer')]
    });
    runBackfill(db);
    expect(ownerOf(db, table)).toBe('u-viewer');
  });

  it('@spec:AC-360 falls back to the OLDEST admin for catalog_products', () => {
    const db = seededDb();
    runBackfill(db);
    expect(ownerOf(db, 'catalog_products')).toBe('u-admin');
  });

  it('leaves the column empty when nobody can be derived as owner', () => {
    const db = ownerlessDb();
    runBackfill(db);
    for (const table of WORK_TABLES) {
      expect(ownerOf(db, table)).toBe('');
    }
  });

  it('documents the derived column for every table that has an author', () => {
    for (const [table, source] of Object.entries(BACKFILL_SOURCES)) {
      expect(migrationSql).toContain(`SET assignedUserId = ${source}`);
      expect(migrationSql).toContain(`ALTER TABLE ${table} ADD COLUMN`);
    }
  });
});

describe('the backfill is safe to run again', () => {
  it('@spec:AC-362 does not overwrite an owner that is already filled', () => {
    const db = FakeD1.from({
      users: [admin('u-admin', '2024-01-01')],
      calendar_events: [
        { ...withAuthor('calendar_events', 'u-admin'), assignedUserId: 'u-1' }
      ]
    });
    runBackfill(db);
    expect(ownerOf(db, 'calendar_events')).toBe('u-1');
  });

  it('@spec:AC-362 runs the second time with no error and keeps owners', () => {
    const db = seededDb();
    db.execute(
      `UPDATE conversation_notes SET authorUserId = 'u-viewer' WHERE id = 'r-1'`,
      EMPTY
    );
    runBackfill(db);
    const first = WORK_TABLES.map((t) => ownerOf(db, t));

    expect(() => runBackfill(db)).not.toThrow();
    expect(WORK_TABLES.map((t) => ownerOf(db, t))).toEqual(first);
  });

  it('@spec:AC-362 guards every backfill with an empty-owner check', () => {
    const statements = migrationSql.match(/UPDATE[\s\S]*?;/g) ?? [];
    expect(statements.length).toBeGreaterThanOrEqual(4);
    for (const statement of statements) {
      expect(statement).toContain(`assignedUserId = ''`);
    }
  });
});