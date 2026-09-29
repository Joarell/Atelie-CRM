// Guards the seeded admin's password salt.
//
// The seed row in 0004_crm_seed.sql stores the PBKDF2 hash of "admin123"
// computed with the salt "deskcomm-seed-v1". Databases seeded before that
// salt existed kept an empty passwordSalt while the stored hash still used
// it, so verifyPassword() recomputed the digest with "" and the seed admin
// could not log in. 0019 repairs that row; these tests pin the repair.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FakeD1 } from '../helpers/fakeD1';

const SEED_ADMIN_ID = 'seed-user-admin';
const SEED_SALT = 'deskcomm-seed-v1';
// PBKDF2-SHA256("admin123", "deskcomm-seed-v1"), 100k iterations.
const SEED_HASH =
  '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';

const REPAIR_SQL = readFileSync(
  'migrations/0019_repair_seed_admin_salt.sql',
  'utf8'
);

// The double parses statements, not files, so drop the `--` documentation
// lines and split on `;` — a migration can carry more than one statement.
function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const REPAIR = statements(REPAIR_SQL);

// The double loads the real schema from the migrations on first use, so an
// empty FakeD1 still enforces users' NOT NULL columns.
function dbWithUsers(): FakeD1 {
  return new FakeD1();
}

/** Inserts the seed admin exactly as a pre-0019 database would hold it. */
async function seedAdmin(
  db: FakeD1,
  salt: string,
  hash: string = SEED_HASH
): Promise<void> {
  await db.execute(
    `INSERT INTO users (id, name, email, passwordHash, passwordSalt, role,
     createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [SEED_ADMIN_ID, 'Administrador', 'admin@deskcomm.local', hash, salt,
     'admin', '2026-01-01T00:00:00.000Z']
  );
}

describe('0019_repair_seed_admin_salt.sql', () => {
  it('repairs a seed admin whose salt is empty', async () => {
    const db = dbWithUsers();
    await seedAdmin(db, '');
    for (const stmt of REPAIR) {
      await db.execute(stmt, []);
    }
    expect(db.rows('users')[0].passwordSalt).toBe(SEED_SALT);
  });

  it('is idempotent', async () => {
    const db = dbWithUsers();
    await seedAdmin(db, '');
    for (const stmt of REPAIR) {
      await db.execute(stmt, []);
    }
    for (const stmt of REPAIR) {
      await db.execute(stmt, []);
    }
    expect(db.rows('users')[0].passwordSalt).toBe(SEED_SALT);
  });

  it('leaves an admin who already changed their password alone', async () => {
    // A password change generates a random salt, so a non-empty salt means the
    // row was touched and must never be rewritten.
    const db = dbWithUsers();
    await seedAdmin(db, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
    for (const stmt of REPAIR) {
      await db.execute(stmt, []);
    }
    expect(db.rows('users')[0].passwordSalt).toBe(
      'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    );
  });

  it('ignores a row whose hash is not the known seed hash', async () => {
    // An empty salt with some other hash is not the corrupted seed row; the
    // repair must not guess a salt for it.
    const db = dbWithUsers();
    await seedAdmin(db, '', 'not-the-seed-hash');
    for (const stmt of REPAIR) {
      await db.execute(stmt, []);
    }
    expect(db.rows('users')[0].passwordSalt).toBe('');
  });

  it('is listed by both migrate scripts', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const script of ['db:migrate:local', 'db:migrate:remote']) {
      expect(pkg.scripts[script]).toContain(
        'migrations/0019_repair_seed_admin_salt.sql'
      );
    }
  });
});
