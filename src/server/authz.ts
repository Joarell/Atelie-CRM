// Role gate for API routes. The session proves *who* the caller is; this
// proves *what* they may touch. `requireRole` returns null when the caller
// may proceed, or the Response the route should return when it may not.
import type { APIContext } from 'astro';
import type { Role, User } from '../domain/crm';
import { getDb } from './context';
import { json } from './http';
import { recordAudit, newAuditEntry, clientIp } from './audit';

export function sessionUser(context: APIContext): User | null {
	const locals = context.locals as unknown as Record<string, unknown>;
	const user = locals.user;
	if (!user || typeof user !== 'object') return null;
	return user as User;
}

export function hasRole(
	user: User | null,
	allowed: Role[]
): boolean {
	return user !== null && allowed.includes(user.role);
}

export async function requireRole(
	context: APIContext,
	allowed: Role[]
): Promise<Response | null> {
	const user = sessionUser(context);
	if (!user) return json({ error: 'nao_autenticado' }, 401);
	if (allowed.includes(user.role)) return null;
	await recordDenied(context, user, allowed);
	return json({ error: 'papel_insuficiente' }, 403);
}

async function recordDenied(
	context: APIContext,
	user: User,
	allowed: Role[]
): Promise<void> {
	const detail = `papel=${user.role} exigido=${allowed.join('|')}`;
	const entry = newAuditEntry(
		user.id, 'role_denied', detail, clientIp(context.request)
	);
	await recordAudit(getDb(), entry);
}