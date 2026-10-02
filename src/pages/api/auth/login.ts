import type { APIRoute } from 'astro';
import type { Database } from '../../../server/db';
import type { User } from '../../../domain/crm';
import { getDb } from '../../../server/context';
import { assertSameOrigin } from '../../../server/origin';
import { json } from '../../../server/http';
import {
	userByEmail,
	verifyPassword,
	publicUser,
	newSession,
	createSessionRow,
	deleteSessionsForUser,
	purgeExpiredSessions,
	setSessionCookie
} from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';

type LoginBody = {
	email: string;
	password: string;
};

export const POST: APIRoute = async (context) => {
	const blocked = assertSameOrigin(context.request);
	if (blocked) return blocked;
	const db = getDb();
	const body = await readLoginBody(context.request);
	const ip = clientIp(context.request);
	if (!body.email || !body.password) {
		return fail(db, '', 'login_missing_fields', body.email, ip, 400,
			'email_e_senha_obrigatorios');
	}
	const user = await userByEmail(db, body.email);
	const valid = user
		? await verifyPassword(
				body.password, user.passwordHash, user.passwordSalt
			)
		: false;
	if (!user || !valid) {
		return fail(db, user?.id ?? '', 'login_failed', body.email, ip, 401,
			'credenciais_invalidas');
	}
	return grant(user, db, ip);
};

async function fail(
	db: Database,
	userId: string,
	action: string,
	detail: string,
	ip: string,
	status: number,
	message: string
): Promise<Response> {
	await recordAudit(db, newAuditEntry(userId, action, detail, ip));
	return json({ error: message }, status);
}

async function grant(user: User, db: Database, ip: string): Promise<Response> {
	await purgeExpiredSessions(db);
	await deleteSessionsForUser(db, user.id);
	const session = await createSessionRow(db, newSession(user.id));
	await recordAudit(db, newAuditEntry(user.id, 'login_ok', user.email, ip));
	const headers = new Headers({ 'Content-Type': 'application/json' });
	await setSessionCookie(headers, session.token);
	return new Response(
		JSON.stringify({ user: publicUser(user) }),
		{ status: 200, headers }
	);
}

async function readLoginBody(request: Request): Promise<LoginBody> {
	const raw = (await request.json()) as Partial<LoginBody> | null;
	return {
		email: typeof raw?.email === 'string' ? raw.email : '',
		password: typeof raw?.password === 'string' ? raw.password : ''
	};
}