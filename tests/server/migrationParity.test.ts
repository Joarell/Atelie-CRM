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
