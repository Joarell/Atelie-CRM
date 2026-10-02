// Role gate for API routes. The session proves *who* the caller is; this
// proves *what* they may touch. `requireRole` returns null when the caller
// may proceed, or the Response the route should return when it may not.
import type { APIContext } from 'astro';
import type { Role, User } from '../domain/crm';
import { ROLE_RANK } from '../domain/crm';
import { getDb } from './context';
import { json } from './http';
import { recordAudit, newAuditEntry, clientIp } from './audit';

export const ALL_ROLES: Role[] = ['viewer', 'agent', 'manager', 'admin'];

export function sessionUser(context: APIContext): User | null {
	const locals = (context.locals ?? {}) as unknown as Record<string, unknown>;
	const user = locals.user;
	if (!user || typeof user !== 'object') return null;
	return user as User;
}

// `ROLE_RANK` finalmente tem efeito, mas apenas onde a semantica e' "este
// papel OU ACIMA": `requireRole` continua sendo lista exata
// (['admin','manager'] significa "admin OU manager" — transformar em "o
// mais alto da lista" barraria o manager da tela de Equipe, que e'
// justamente o que a lista pede).
export function hasRank(
	user: User | null,
	minimum: Role
): boolean {
	return user !== null && ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

export function hasRole(
	user: User | null,
	allowed: Role[]
): boolean {
	return user !== null && allowed.includes(user.role);
}

// Gate hierarquico: "papel minimo". E' o que a matriz de operacao por
// entidade usa (leitura = viewer+, escrita = agent+, exclusao = manager+),
// onde um `admin` tem de passar em `delete` sem cada rota repetir a lista
// inteira.
export function requireRank(
	context: APIContext,
	minimum: Role
): Promise<Response | null> {
	return requireRole(context, ALL_ROLES.filter(
		(role) => ROLE_RANK[role] >= ROLE_RANK[minimum]
	));
}

export async function requireRole(
	context: APIContext,
	allowed: Role[]
): Promise<Response | null> {
	const user = sessionUser(context);
	if (!user) return json({ error: 'nao_autenticado' }, 401);
	if (hasRole(user, allowed)) return null;
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