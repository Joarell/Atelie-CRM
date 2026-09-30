import { defineMiddleware } from 'astro:middleware';
import { userFromToken, userFromTokenString } from './server/auth';
import { getDb } from './server/context';
import type { Database } from './server/db';
import { json } from './server/http';
import {
	checkRateLimit,
	getClientKey,
	rateLimitResponse,
	MAX_LOGIN_ATTEMPTS,
	MAX_PASSWORD_CHANGE_ATTEMPTS
} from './server/rateLimit';

// `/api/whatsapp/session` is public on purpose: the pairing QR is the only way
// to attach a WhatsApp number, so it must be reachable before anyone can log
// in. Guarding it made the whole pairing flow unreachable.
const PUBLIC_PATHS = new Set([
	'/api/auth/login',
	'/api/auth/me',
	'/api/whatsapp/webhook',
	'/api/whatsapp/health',
	'/api/whatsapp/webhook-config',
	'/api/whatsapp/session',
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

export const onRequest = defineMiddleware(async (context, next) => {
	const pathname = new URL(context.request.url).pathname;

	if (!pathname.startsWith('/api/')) {
		const response = await next();
		return applySecurityHeaders(response);
	}

	if (PUBLIC_PATHS.has(pathname)) {
		const limited = await handlePublicPath(context, pathname);
		if (limited) return limited;
		const response = await next();
		return applySecurityHeaders(response);
	}

	const user = await resolveUser(getDb(), context.request, pathname);
	if (!user) {
		return applySecurityHeaders(json({ error: 'nao_autenticado' }, 401));
	}

	(context.locals as unknown as Record<string, unknown>).user = user;

	const response = await next();
	return applySecurityHeaders(response);
});