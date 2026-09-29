import type { User, Session } from '../domain/crm';
import type { Database } from './db';
import { uid, nowISO } from '../domain/format';
import {
  getEntity,
  insertEntity,
  updateEntity,
  deleteEntity,
  listEntities
} from './crud';
import {
  SESSIONS_TABLE,
  SESSIONS_SHAPE,
  USERS_TABLE,
  USERS_SHAPE
} from './tables';

// Login/session helpers for the ported DeskcommCRM module. Passwords are
// PBKDF2-SHA256 with the same scheme used by migrations/0004_crm_seed.sql
// (100k iterations, salt "deskcomm-seed-v1") so the seeded admin works
// out of the box. Sessions are plain rows in D1 with an expiry timestamp.
const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT = 'deskcomm-seed-v1';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function publicUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

export async function hashPassword(password: string): Promise<string> {
  const bits = await deriveBits(password);
  return toHex(bits);
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash) return false;
  const hash = await hashPassword(password);
  return hash === storedHash;
}

export function newSession(userId: string): Session {
  const createdAt = nowISO();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return { token: uid(), userId, createdAt, expiresAt };
}

export async function createSessionRow(
  db: Database,
  session: Session
): Promise<Session> {
  await insertEntity(db, SESSIONS_TABLE, SESSIONS_SHAPE, session);
  return session;
}

// Resolves a Bearer token into the logged-in user (or null when the
// session is missing/expired). Reads never mutate, so no audit here.
export async function userFromToken(
  db: Database,
  request: Request
): Promise<User | null> {
  return userFromTokenString(db, bearerToken(request));
}

// Same resolution from the raw token string. Used where an EventSource
// (which cannot set HTTP headers) must authenticate via `?token=` instead.
export async function userFromTokenString(
  db: Database,
  token: string | null
): Promise<User | null> {
  if (!token) return null;
  const session = await getEntity<Session>(
    db,
    SESSIONS_TABLE,
    SESSIONS_SHAPE,
    token,
    'token'
  );
  if (!session || isExpired(session)) return null;
  return getEntity<User>(db, USERS_TABLE, USERS_SHAPE, session.userId);
}

export async function userByEmail(
  db: Database,
  email: string
): Promise<User | null> {
  const users = await listEntities<User>(db, USERS_TABLE, USERS_SHAPE);
  const normalized = email.toLowerCase();
  const match = users.find(
    (user) => user.email.toLowerCase() === normalized
  );
  return match ?? null;
}

export async function deleteSession(
  db: Database,
  request: Request
): Promise<void> {
  const token = bearerToken(request);
  if (token) await deleteEntity(db, SESSIONS_TABLE, token, 'token');
}

// Identity-session hygiene: dropping every session a user holds (on login,
// or when an admin resets the password) keeps one active session per user.
export async function deleteSessionsForUser(
  db: Database,
  userId: string
): Promise<void> {
  const sessions = await listEntities<Session>(
    db, SESSIONS_TABLE, SESSIONS_SHAPE
  );
  for (const session of sessions) {
    if (session.userId !== userId) continue;
    await deleteEntity(db, SESSIONS_TABLE, session.token, 'token');
  }
}

export async function revokeOtherSessions(
  db: Database,
  userId: string,
  exceptToken: string
): Promise<void> {
  const sessions = await listEntities<Session>(
    db, SESSIONS_TABLE, SESSIONS_SHAPE
  );
  for (const session of sessions) {
    if (session.userId !== userId) continue;
    if (session.token !== exceptToken) {
      await deleteEntity(db, SESSIONS_TABLE, session.token, 'token');
    }
  }
}

// Expired sessions are swept at login so the sessions table never grows
// unbounded. Kept next to revoke because both walk the same table.
export async function purgeExpiredSessions(db: Database): Promise<void> {
  const sessions = await listEntities<Session>(
    db, SESSIONS_TABLE, SESSIONS_SHAPE
  );
  const now = Date.now();
  for (const session of sessions) {
    if (new Date(session.expiresAt).getTime() < now) {
      await deleteEntity(db, SESSIONS_TABLE, session.token, 'token');
    }
  }
}

export async function updateUserPassword(
  db: Database,
  userId: string,
  newPassword: string
): Promise<User | null> {
  return updateEntity<User>(db, USERS_TABLE, USERS_SHAPE, userId, {
    passwordHash: await hashPassword(newPassword)
  });
}

export function sessionToken(request: Request): string | null {
  return bearerToken(request);
}

function isExpired(session: Session): boolean {
  return new Date(session.expiresAt).getTime() < Date.now();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

async function deriveBits(password: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    KEY_BITS
  );
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = [...new Uint8Array(buffer)];
  return bytes
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}