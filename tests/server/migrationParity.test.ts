// Guards the contract between the migrations and the code that writes to
// them.
//
// The Contatos menu could not save a contact on a database built by the
// documented `npm run db:migrate:*` commands: those commands stopped at
// 0015, so `contacts.assignedUserId` (added by 0018) did not exist, and the
// POST failed on an unknown column. Nothing caught it because the test
// double had no schema and the seeded dev database had been patched by hand.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  migrationFiles,
  schemaFromMigrations
} from '../helpers/fakeD1';
import { CONTACT_FIELDS } from '../../src/domain/crm';

const PKG = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};

/** The migration files a script actually executes, in order. */
function migrationsIn(script: string): string[] {
  return (PKG.scripts[script].match(/migrations\/[\w.]+\.sql/g) ?? []);
}

const ON_DISK = migrationFiles();

const SCRIPT_PAIRS: Array<[string, string]> = [
  ['db:migrate:local', 'db:seed:local'],
  ['db:migrate:remote', 'db:seed:remote']
];

describe('migration scripts cover every migration file', () => {
  it.each(SCRIPT_PAIRS)(
    '%s + %s leave no migration on disk unapplied',
    (migrate, seed) => {
      const referenced = [
        ...migrationsIn(migrate),
        ...migrationsIn(seed)
      ];
      expect(ON_DISK.filter((f) => !referenced.includes(f))).toEqual([]);
    }
  );

  it.each(SCRIPT_PAIRS)(
    '%s + %s reference no migration that is missing from disk',
    (migrate, seed) => {
      const referenced = [
        ...migrationsIn(migrate),
        ...migrationsIn(seed)
      ];
      expect(referenced.filter((f) => !ON_DISK.includes(f))).toEqual([]);
    }
  );

  it.each([
    'db:migrate:local', 'db:migrate:remote',
    'db:seed:local', 'db:seed:remote'
  ])('%s lists its migrations in file order', (script) => {
    const applied = migrationsIn(script);
    expect(applied).toEqual([...applied].sort());
  });
});

describe('the documented schema can store a contact', () => {
  const schema = schemaFromMigrations(migrationsIn('db:migrate:local'));

  it('has a contacts table', () => {
    expect(schema.has('contacts')).toBe(true);
  });

  it('has every column the contact create path writes', () => {
    const columns = schema.get('contacts')?.columns ?? new Set<string>();
    for (const field of Object.keys(CONTACT_FIELDS)) {
      expect(columns.has(field)).toBe(true);
    }
  });

  it('has assignedUserId, which saving a contact depends on', () => {
    expect(schema.get('contacts')?.columns.has('assignedUserId')).toBe(true);
  });

  it('has createdAt as a required column the server now fills', () => {
    const contacts = schema.get('contacts');
    expect(contacts?.required.has('createdAt')).toBe(true);
    expect(contacts?.required.has('name')).toBe(true);
  });
});

describe('the documented schema can store a deal', () => {
  const schema = schemaFromMigrations(migrationsIn('db:migrate:local'));

  it('has assignedUserId on deals', () => {
    expect(schema.get('deals')?.columns.has('assignedUserId')).toBe(true);
  });
});

describe('the documented schema has the LGPD tables', () => {
  const schema = schemaFromMigrations(migrationsIn('db:migrate:local'));

  it('has consents', () => {
    expect(schema.has('consents')).toBe(true);
  });

  it('has rate_limits', () => {
    expect(schema.has('rate_limits')).toBe(true);
  });
});

const SEED_ON_DISK = ON_DISK.filter((file) => file.includes('_seed'));

/** The SQL a migration actually runs: comment and blank lines stripped. */
function executableSql(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

function statementsOf(file: string): string[] {
  return executableSql(file)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

// `wrangler d1 execute --file` exits non-zero on a file with no statement, and
// os scripts sao encadeados com `&&`: um unico arquivo assim aborta o seed
// inteiro e 0022/0023/0024/0025 nunca rodam.
describe('every migration a script runs is executable', () => {
  const SCRIPTS = [
    'db:migrate:local', 'db:migrate:remote',
    'db:seed:local', 'db:seed:remote'
  ];

  it.each(SCRIPTS)('%s references no statement-less migration', (script) => {
    const empty = migrationsIn(script)
      .filter((file) => statementsOf(file).length === 0);
    expect(empty).toEqual([]);
  });

  it('a statement-less file really is rejected by wrangler', () => {
    const noStatement = ON_DISK.find(
      (file) => statementsOf(file).length === 0
    );
    expect(readFileSync('wrangler.toml', 'utf8')).toContain('d1_databases');
    expect(noStatement).toBeUndefined();
  });
});

const USER_ID_COLUMNS = ['assignedUserId', 'assigneeUserId', 'createdBy'];

/** Splits `('a', 'b, c')` into values, so a comma inside quotes is safe. */
function rowValues(line: string): string[] {
  const start = line.indexOf('(');
  const end = line.lastIndexOf(')');
  if (start < 0 || end <= start) return [];
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line.slice(start + 1, end)) {
    if (char === "'") quoted = !quoted;
    if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function userIdLiterals(sql: string): string[] {
  const found: string[] = [];
  let indexes: number[] = [];
  for (const line of sql.split('\n')) {
    const header = line.match(/INTO\s+\w+\s*\(([^)]+)\)/i);
    if (header) {
      indexes = header[1]
        .split(',')
        .map((column, index) =>
          USER_ID_COLUMNS.includes(column.trim()) ? index : -1)
        .filter((index) => index >= 0);
      continue;
    }
    if (indexes.length === 0) continue;
    const values = rowValues(line);
    for (const index of indexes) found.push(values[index] ?? '');
  }
  return found.map((value) => value.replace(/'/g, ''));
}

// Nenhuma migration semeia usuario: o primeiro admin nasce por
// `admin:bootstrap`. O seed ainda apontava as colunas de dono para um
// `seed-user-admin` inexistente, deixando 7 linhas com dono orfao.
describe('no seed row points at a user that no seed creates', () => {
  it.each(SEED_ON_DISK)('%s leaves every user-id column empty', (file) => {
    const nonEmpty = userIdLiterals(readFileSync(file, 'utf8'))
      .filter((value) => value !== '');
    expect(nonEmpty).toEqual([]);
  });

  it('no seed migration inserts into users', () => {
    const inserting = SEED_ON_DISK.filter((file) =>
      /INTO\s+users\b/i.test(executableSql(file)));
    expect(inserting).toEqual([]);
  });
});

// `db:seed:local` pode ser re-executado. Um INSERT sem OR IGNORE estourava
// `UNIQUE constraint failed: purchases.id` e um `SET stock = stock + N` sem
// guarda inflava o estoque a cada rodada.
describe('seeds are safe to run twice', () => {
  it.each(SEED_ON_DISK)('%s has no bare INSERT', (file) => {
    const bare = statementsOf(file)
      .filter((statement) => /^\s*INSERT\s+INTO\b/i.test(statement));
    expect(bare).toEqual([]);
  });

  it.each(SEED_ON_DISK)('%s guards every accumulating UPDATE', (file) => {
    const accumulating = statementsOf(file).filter(
      (statement) =>
        /UPDATE\s+\w+\s+SET\s+\w+\s*=\s*\w+\s*\+/i.test(statement)
    );
    expect(accumulating.filter((s) => !/NOT EXISTS/i.test(s))).toEqual([]);
  });
});
