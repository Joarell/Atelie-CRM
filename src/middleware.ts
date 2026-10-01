import { defineMiddleware } from 'astro:middleware';
import { userFromToken, userFromTokenString } from './server/auth';
import { getDb } from './server/context';
import type { Database } from './server/db';
import type { User } from './domain/crm';
import { json } from './server/http';
import {
	checkRateLimit,
	getClientKey,
	rateLimitResponse,
	MAX_LOGIN_ATTEMPTS,
	MAX_PASSWORD_CHANGE_ATTEMPTS
} from './server/rateLimit';

const PUBLIC_PATHS = new Set([
	'/api/auth/login',
	'/api/auth/me',
	'/api/whatsapp/webhook',
	'/api/whatsapp/health',
	'/api/whatsapp/webhook-config',
]);

// A user flagged for rotation is still on the seed credential, so the API stays
// closed to it except for the routes that let it finish that rotation.
const PASSWORD_CHANGE_ALLOWED = new Set([
	'/api/auth/me',
	'/api/auth/change-password',
	'/api/auth/logout',
]);

const CSP = "default-src 'self'; script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
	"font-src 'self'; connect-src 'self'; frame-ancestors 'none'; " +
	"base-uri 'self'; form-action 'self'";

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
	'Content-Security-Policy': CSP,
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

function applySecurityHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

const LIMITED_PATHS: Record<string, { suffix: string; max: number }> = {
	'/api/auth/login': { suffix: 'login', max: MAX_LOGIN_ATTEMPTS },
	'/api/auth/change-password': {
		suffix: 'change-password',
		max: MAX_PASSWORD_CHANGE_ATTEMPTS
	}
};

// The counter lives in D1, not in the isolate: a `Map` here is reset on every
// deploy and is per-colo, so an attacker spreading requests across PoPs got a
// fresh budget from each one. A shared table is what actually makes the login
// throttle mean anything.
// The SSE endpoint is the one route a browser can only reach with the token in
// the query string: an EventSource cannot set an Authorization header, so the
// client puts `?token=` in the URL (see sseEventUrl in the CRM views). Every
// other route stays Bearer-only — a token in a URL lands in access logs,
// Referer headers and browser history.
const SSE_PATH = '/api/crm/events';

async function resolveUser(
	db: Database,
	request: Request,
	pathname: string
) {
	const fromHeader = await userFromToken(db, request);
	if (fromHeader) return fromHeader;
	if (pathname !== SSE_PATH) return null;
	const queryToken = new URL(request.url).searchParams.get('token');
	return userFromTokenString(db, queryToken);
}

async function handlePublicPath(
	context: Parameters<typeof onRequest>[0],
	pathname: string
): Promise<Response | null> {
	const limit = LIMITED_PATHS[pathname];
	if (!limit) return null;
	const key = getClientKey(context.request, limit.suffix);
	const db = getDb();
	const { allowed, retryAfter } = await checkRateLimit(db, key, limit.max);
	if (allowed || retryAfter === undefined) return null;
	return applySecurityHeaders(rateLimitResponse(key, limit.max, retryAfter));
}

async function handleUnguardedPath(
	context: Parameters<typeof onRequest>[0],
	pathname: string,
	next: () => Promise<Response>
): Promise<Response | null> {
	if (!pathname.startsWith('/api/')) {
		return applySecurityHeaders(await next());
	}
	if (!PUBLIC_PATHS.has(pathname)) return null;
	const limited = await handlePublicPath(context, pathname);
	if (limited) return limited;
	return applySecurityHeaders(await next());
}

export const onRequest = defineMiddleware(async (context, next) => {
	const pathname = new URL(context.request.url).pathname;

	const unguarded = await handleUnguardedPath(context, pathname, next);
	if (unguarded) return unguarded;

	const user = await resolveUser(getDb(), context.request, pathname);
	if (!user) {
		return applySecurityHeaders(json({ error: 'nao_autenticado' }, 401));
	}

	if (await blockedByPasswordChange(user, pathname)) {
		return applySecurityHeaders(
			json({ error: 'troca_de_senha_obrigatoria' }, 403)
		);
	}

	(context.locals as unknown as Record<string, unknown>).user = user;

	return applySecurityHeaders(await next());
});

async function blockedByPasswordChange(
	user: User,
	pathname: string
): Promise<boolean> {
	if (PASSWORD_CHANGE_ALLOWED.has(pathname)) return false;
	return Number(user.mustChangePassword ?? 0) === 1;
}