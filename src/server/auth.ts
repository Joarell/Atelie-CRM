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
// PBKDF2-SHA256 (100k iterations) and every stored hash carries its own random
// salt in users.passwordSalt. There is no fixed salt and no fallback: a row
// without a salt simply cannot verify, so no legacy credential stays replayable
// through a salt published in the source. Sessions are plain rows in D1 with an
// expiry timestamp.
const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'crm_session';

export type PasswordDigest = { hash: string; salt: string };

export type PublicUser = Omit<
	User,
	'passwordHash' | 'passwordSalt' | 'mustChangePassword'
> & { mustChangePassword: boolean };

export function publicUser(user: User): PublicUser {
	const { passwordHash: _h, passwordSalt: _s, ...rest } = user;
	return { ...rest, mustChangePassword: Number(user.mustChangePassword) === 1 };
}

export async function hashPassword(
	password: string
): Promise<PasswordDigest> {
	const salt = newSalt();
	return { hash: await deriveHex(password, salt), salt };
}

export async function verifyPassword(
	password: string,
	storedHash: string,
	salt: string | null | undefined
): Promise<boolean> {
	if (!storedHash || !salt) return false;
	return (await deriveHex(password, salt)) === storedHash;
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

function cookieAttributes(maxAge: number): string {
	return `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function setSessionCookie(
	headers: Headers,
	token: string
): Promise<void> {
	const maxAge = Math.floor(SESSION_TTL_MS / 1000);
	headers.append('Set-Cookie',
		`${COOKIE_NAME}=${token}; ${cookieAttributes(maxAge)}`
	);
}

export async function clearSessionCookie(headers: Headers): Promise<void> {
	headers.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
}

export function getSessionFromCookie(request: Request): string | null {
	const cookie = request.headers.get('cookie');
	if (!cookie) return null;
	const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
	return match ? match[1] : null;
}

// Resolves a Bearer token into the logged-in user (or null when the
// session is missing/expired). Reads never mutate, so no audit here.
export async function userFromToken(
	db: Database,
	request: Request
): Promise<User | null> {
	// Try cookie first (for SSE and browser), then Bearer header
	const cookieToken = getSessionFromCookie(request);
	if (cookieToken) {
		return userFromTokenString(db, cookieToken);
	}
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
	const token = bearerToken(request) || getSessionFromCookie(request);
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
	const { hash, salt } = await hashPassword(newPassword);
	return updateEntity<User>(db, USERS_TABLE, USERS_SHAPE, userId, {
		passwordHash: hash,
		passwordSalt: salt,
		mustChangePassword: 0
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

async function deriveBits(
	password: string,
	salt: string
): Promise<ArrayBuffer> {
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
			salt: encoder.encode(salt),
			iterations: ITERATIONS,
			hash: 'SHA-256'
		},
		material,
		KEY_BITS
	);
}

async function deriveHex(password: string, salt: string): Promise<string> {
	return toHex(await deriveBits(password, salt));
}

function newSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buffer: ArrayBuffer): string {
	const bytes = [...new Uint8Array(buffer)];
	return bytes
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}