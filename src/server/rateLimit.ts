import type { Database } from './db';
import { getEntity, insertEntity, updateEntity } from './crud';
import { uid, nowISO } from '../domain/format';
import { RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE } from './tables';

interface RateLimitEntry {
	id: string;
	count: number;
	resetAt: number;
	metadata: Record<string, unknown>;
}

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const MAX_PASSWORD_CHANGE_ATTEMPTS = 3;

async function startWindow(
	db: Database,
	key: string,
	resetAt: number
): Promise<void> {
	await insertEntity(db, RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE, {
		id: key,
		count: 1,
		resetAt,
		metadata: {},
	} as RateLimitEntry);
}

async function bumpCount(
	db: Database,
	key: string,
	count: number
): Promise<void> {
	await updateEntity(db, RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE, key, {
		count,
	} as Partial<RateLimitEntry>);
}

export async function checkRateLimit(
	db: Database,
	key: string,
	maxAttempts: number,
	windowMs: number = RATE_LIMIT_WINDOW_MS
): Promise<{ allowed: boolean; retryAfter?: number }> {
	const now = Date.now();

	// Clean expired windows. The bound is `now` (not `now - windowMs`): a
	// window is over once `resetAt` has passed, and deleting later than that
	// left blocked clients locked out for a second full window.
	const cleanup = `DELETE FROM ${RATE_LIMIT_TABLE} WHERE resetAt < ?`;
	await db.prepare(cleanup).bind(now).run();

	const existing = await getEntity<RateLimitEntry>(
		db, RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE, key
	);
	return decide(existing, now, key, maxAttempts, windowMs, db);
}

async function decide(
	existing: RateLimitEntry | null,
	now: number,
	key: string,
	maxAttempts: number,
	windowMs: number,
	db: Database
): Promise<{ allowed: boolean; retryAfter?: number }> {
	// An entry whose window has elapsed must not count against the client: the
	// row can survive the cleanup (same-millisecond races) and would otherwise
	// keep returning 429 after the window ended.
	if (!existing || existing.resetAt <= now) {
		await startWindow(db, key, now + windowMs);
		return { allowed: true };
	}
	if (existing.count >= maxAttempts) {
		return {
			allowed: false,
			retryAfter: Math.ceil((existing.resetAt - now) / 1000)
		};
	}
	await bumpCount(db, key, existing.count + 1);
	return { allowed: true };
}

export function getClientKey(request: Request, suffix: string): string {
	const ip = request.headers.get('cf-connecting-ip') ??
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown';
	return `${ip}:${suffix}`;
}

export function rateLimitResponse(
	key: string, max: number, retryAfter: number
): Response {
	const body = { error: 'muitas_tentativas', retryAfter };
	return json(body, 429);
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function getRateLimitHeaders(
	key: string,
	maxAttempts: number,
	db: Database
): Promise<Record<string, string>> {
	const entry = await getEntity<RateLimitEntry>(
		db, RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE, key
	);
	if (!entry) return {};
	const remaining = Math.max(0, maxAttempts - entry.count);
	const reset = Math.ceil((entry.resetAt - Date.now()) / 1000);
	return {
		'X-RateLimit-Limit': String(maxAttempts),
		'X-RateLimit-Remaining': String(remaining),
		'X-RateLimit-Reset': String(reset),
	};
}