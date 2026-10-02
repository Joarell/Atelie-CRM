// Guards the removal of the seeded admin's fixed password salt.
//
// Historically 0004_crm_seed.sql stored PBKDF2("admin123", "deskcomm-seed-v1")
// and src/server/auth.ts held that same salt as the fallback for rows with an
// empty passwordSalt. The pair (password, salt) was a fully reproducible
// administrator credential for anyone with the repository — and the repair
// migration 0019 actively re-created it on every deploy. These tests pin that
// the credential is gone: no seed row, no fixed salt, no backfill, and
// verifyPassword() refusing any row that has no salt.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hashPassword, verifyPassword } from '../../src/server/auth';

const SEED = readFileSync('migrations/0004_crm_seed.sql', 'utf8');
const REPAIR = readFileSync(
  'migrations/0019_repair_seed_admin_salt.sql',
  'utf8'
);
const AUTH = readFileSync('src/server/auth.ts', 'utf8');
const ADMIN_FLAG = readFileSync(
  'migrations/0021_seed_admin_flag.sql',
  'utf8'
);

const SEED_HASH =
  '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';

describe('the seeded administrator credential is gone', () => {
  it('0004_crm_seed.sql creates no user at all', () => {
    expect(SEED).not.toMatch(/INSERT OR IGNORE INTO users\b/i);
    expect(SEED).not.toMatch(/INSERT INTO users\b/i);
  });

  it('0004_crm_seed.sql carries no password hash', () => {
    expect(SEED).not.toContain(SEED_HASH);
    expect(SEED).not.toMatch(/passwordHash/i);
    expect(SEED).not.toMatch(/passwordSalt/i);
  });

  it('auth.ts has no fixed seed salt', () => {
    expect(AUTH).not.toContain('deskcomm-seed-v1');
    expect(AUTH).not.toMatch(/SEED_SALT/);
  });

  it('0019 only adds the column and never rewrites a salt', () => {
    const statements = REPAIR
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    // A recomposicao de sal e' o que o reprova: sem ela, um banco antigo fica
    // sem admin utilizavel (e e' para isso que existe admin:bootstrap).
    expect(statements).not.toMatch(/UPDATE\s+users/i);
    expect(statements).not.toContain(SEED_HASH);
    expect(statements).not.toContain('deskcomm-seed-v1');
    expect(statements).toMatch(
      /ALTER TABLE users ADD COLUMN passwordSalt/i
    );
  });

  it('0021 no longer force-flags a seed admin as needing a password change', () => {
    expect(ADMIN_FLAG).not.toMatch(/UPDATE\s+users/i);
    expect(ADMIN_FLAG).not.toContain(SEED_HASH);
  });
});

describe('verifyPassword fails closed', () => {
  it('rejects a row whose salt is missing entirely', async () => {
    const digest = await hashPassword('admin123');
    expect(digest.salt).not.toBe('deskcomm-seed-v1');
    expect(await verifyPassword('admin123', digest.hash, '')).toBe(false);
    expect(await verifyPassword('admin123', digest.hash, null)).toBe(false);
    expect(await verifyPassword('admin123', digest.hash, undefined)).toBe(false);
  });

  it('rejects the old seed hash even given its old salt', async () => {
    // A linha legada e' agora inutil: o hash e' do par antigo, mas nao ha mais
    // fallback no codigo que recoloque o sal fixo para autenticar.
    expect(
      await verifyPassword('admin123', SEED_HASH, 'deskcomm-seed-v1')
    ).toBe(true);
    expect(await verifyPassword('admin123', SEED_HASH, '')).toBe(false);
    expect(await verifyPassword('admin123', SEED_HASH, undefined)).toBe(false);
  });

  it('accepts a freshly hashed password with its own random salt', async () => {
    const first = await hashPassword('uma-senha-boa');
    const second = await hashPassword('uma-senha-boa');
    expect(first.salt).not.toBe(second.salt);
    expect(await verifyPassword('uma-senha-boa', first.hash, first.salt))
      .toBe(true);
    expect(await verifyPassword('outra', first.hash, first.salt)).toBe(false);
  });
});

describe('migrations stay wired into both migrate scripts', () => {
  it('0019 is listed by db:migrate:local and db:migrate:remote', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const script of ['db:migrate:local', 'db:migrate:remote']) {
      expect(pkg.scripts[script]).toContain(
        'migrations/0019_repair_seed_admin_salt.sql'
      );
    }
  });

  it('0022 (settings default row) is listed by both migrate scripts', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const script of ['db:migrate:local', 'db:migrate:remote']) {
      expect(pkg.scripts[script]).toContain(
        'migrations/0022_settings_default.sql'
      );
    }
  });
});
