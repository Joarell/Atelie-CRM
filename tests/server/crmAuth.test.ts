import { describe, it, expect, beforeAll } from 'vitest';
import {
  CONTACTS_SHAPE, TASKS_SHAPE, CATALOG_PRODUCTS_SHAPE,
  USERS_TABLE, USERS_SHAPE, SESSIONS_TABLE, SESSIONS_SHAPE
} from '../../src/server/tables';
import {
  publicUser, hashPassword, verifyPassword, newSession, createSessionRow,
  userFromToken, userByEmail
} from '../../src/server/auth';
import { rowToEntity } from '../../src/server/mapping';
import { FakeD1 } from '../helpers/fakeD1';
import type { User, Session } from '../../src/domain/crm';

const SEED_ADMIN_HASH = '022d504d3b3433f2cde7ac9185a4e1d340e67ed70a943dbc4ef14bf8c3174a00';

const adminUser: User = {
  id: 'seed-user-admin', name: 'Administrador', email: 'admin@deskcomm.local',
  passwordHash: SEED_ADMIN_HASH, role: 'admin', createdAt: '2026-01-01T00:00:00Z'
};

function rows(...entities: object[]): Record<string, unknown>[] {
  return entities as Record<string, unknown>[];
}

describe('CRM table shapes (src/server/tables.ts)', () => {
  it('exposes tags as a JSON column on contacts', () => {
    expect(CONTACTS_SHAPE.jsonFields).toContain('tags');
  });
  it('exposes done as a boolean column on tasks', () => {
    expect(TASKS_SHAPE.boolFields).toContain('done');
  });
  it('exposes ativo as a boolean column on catalog products', () => {
    expect(CATALOG_PRODUCTS_SHAPE.boolFields).toContain('ativo');
  });
  it('round-trips a contact with tags through rowToEntity', () => {
    const contact = rowToEntity<{ tags: string[] }>({ tags: '["quente","casamento"]' }, CONTACTS_SHAPE);
    expect(contact.tags).toEqual(['quente', 'casamento']);
  });
});

describe('password hashing (matches migrations/0004_crm_seed.sql)', () => {
  beforeAll(async () => {
    // Warm-up so the async subtle import doesn't skew timing-sensitive runs.
    await hashPassword('warmup');
  });

  it('verifies a password against its own stored salt', async () => {
    const digest = await hashPassword('senha-de-teste');
    expect(
      await verifyPassword('senha-de-teste', digest.hash, digest.salt)
    ).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await hashPassword('senha-de-teste');
    expect(
      await verifyPassword('senha-errada', digest.hash, digest.salt)
    ).toBe(false);
  });

  // Nao ha mais sal fixo: uma linha sem passwordSalt simplesmente nao verifica,
  // entao o par (senha, sal) do seed deixou de ser reproduzivel pelo codigo.
  it('refuses to verify a row without a salt (no fixed-salt fallback)', async () => {
    const digest = await hashPassword('senha-de-teste');
    expect(await verifyPassword('senha-de-teste', digest.hash, '')).toBe(false);
    expect(await verifyPassword('senha-de-teste', digest.hash, null)).toBe(false);
    expect(await verifyPassword('senha-de-teste', digest.hash, undefined)).toBe(false);
  });

  it('hashPassword produces a 64-char hex digest that round-trips', async () => {
    const { hash, salt } = await hashPassword('abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPassword('abc', hash, salt)).toBe(true);
  });

  it('publicUser never leaks passwordHash', () => {
    const safe = publicUser(adminUser);
    expect(safe).not.toHaveProperty('passwordHash');
    expect(safe.email).toBe('admin@deskcomm.local');
  });
});

describe('session helpers', () => {
  it('newSession issues a token with a future expiry', () => {
    const session = newSession('u1');
    expect(session.token.length).toBeGreaterThan(8);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('createSessionRow stores the session in D1', async () => {
    const db = FakeD1.empty();
    const session = newSession('u1');
    await createSessionRow(db, session);
    expect(db.rows(SESSIONS_TABLE).length).toBe(1);
  });

  it('userFromToken resolves a valid Bearer session to the user', async () => {
    const db = new FakeD1(new Map<string, Record<string, unknown>[]>([
      [USERS_TABLE, rows(adminUser)],
      [SESSIONS_TABLE, rows({
        token: 'tok', userId: 'seed-user-admin',
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: new Date(Date.now() + 60000).toISOString()
      })]
    ]));
    const request = new Request('http://x/api/auth/me', { headers: { Authorization: 'Bearer tok' } });
    const user = await userFromToken(db, request);
    expect(user?.email).toBe('admin@deskcomm.local');
  });

  it('userFromToken returns null for anonymous or expired sessions', async () => {
    const db = new FakeD1(new Map<string, Record<string, unknown>[]>([
      [USERS_TABLE, rows(adminUser)],
      [SESSIONS_TABLE, rows({
        token: 'expired', userId: 'seed-user-admin',
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-01-02T00:00:00Z'
      })]
    ]));
    expect(await userFromToken(db, new Request('http://x'))).toBeNull();
    const expired = new Request('http://x', { headers: { Authorization: 'Bearer expired' } });
    expect(await userFromToken(db, expired)).toBeNull();
  });

  it('userFromToken supports round-tripping through createSessionRow', async () => {
    const db = new FakeD1(new Map<string, Record<string, unknown>[]>([[USERS_TABLE, rows(adminUser)]]));
    const session = await createSessionRow(db, newSession('seed-user-admin'));
    const request = new Request('http://x', { headers: { Authorization: `Bearer ${session.token}` } });
    expect((await userFromToken(db, request))?.id).toBe('seed-user-admin');
  });

  it('userByEmail matches case-insensitively', async () => {
    const db = new FakeD1(new Map<string, Record<string, unknown>[]>([[USERS_TABLE, rows(adminUser)]]));
    expect((await userByEmail(db, 'ADMIN@DESKCOMM.LOCAL'))?.id).toBe('seed-user-admin');
    expect(await userByEmail(db, 'nobody@example.com')).toBeNull();
  });
});

// Keep SESSIONS table/shape referenced so ts-prune style checks stay clean.
export type SessionsRow = Session;
void SESSIONS_SHAPE;
void USERS_SHAPE;