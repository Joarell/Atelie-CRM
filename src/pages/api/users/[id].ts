import type { APIRoute } from 'astro';
import type { User, Role } from '../../../domain/crm';
import type { Database } from '../../../server/db';
import { getDb } from '../../../server/context';
import { getEntity, updateEntity, deleteEntity } from '../../../server/crud';
import { USERS_TABLE, USERS_SHAPE } from '../../../server/tables';
import {
	publicUser,
	hashPassword,
	deleteSessionsForUser
} from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';
import { requireRole } from '../../../server/authz';
import { json } from '../../../server/http';

const NOT_FOUND = 'Not found';
const ADMINS: Role[] = ['admin'];
const USER_MANAGERS: Role[] = ['admin', 'manager'];
const ADMIN_ONLY_FIELDS = ['role', 'password'] as const;

type PutBody = {
	name?: string;
	email?: string;
	role?: string;
	password?: string;
};

export const PUT: APIRoute = async (context) => {
	const body = await readPutBody(context.request);
	const denied = await requireRole(context, allowedRoles(body));
	if (denied) return denied;
	const db = getDb();
	const ip = clientIp(context.request);
	const { id } = context.params;
	const existing = await getEntity<User>(
		db, USERS_TABLE, USERS_SHAPE, id!
	);
	if (!existing) return json({ error: NOT_FOUND }, 404);
	const patch = editablePatch(body);
	const changed = await applyPassword(patch, body.password);
	const saved = await updateEntity<User>(
		db, USERS_TABLE, USERS_SHAPE, id!, patch
	);
	if (!saved) return json({ error: NOT_FOUND }, 404);
	if (changed) await onPasswordReset(db, id!, saved.email, ip);
	return json(publicUser(saved));
};

export const DELETE: APIRoute = async (context) => {
	const denied = await requireRole(context, ADMINS);
	if (denied) return denied;
	const db = getDb();
	const ip = clientIp(context.request);
	const { id } = context.params;
	await deleteEntity(db, USERS_TABLE, id!);
	await recordAudit(
		db, newAuditEntry(id!, 'user_deleted', '', ip)
	);
	return json({ ok: true });
};

function allowedRoles(body: PutBody): Role[] {
	const adminOnly = ADMIN_ONLY_FIELDS.some(f => body[f] !== undefined);
	return adminOnly ? ADMINS : USER_MANAGERS;
}

async function onPasswordReset(
	db: Database,
	id: string,
	email: string,
	ip: string
): Promise<void> {
	await deleteSessionsForUser(db, id);
	await recordAudit(db, newAuditEntry(id, 'user_password_reset', email, ip));
}

async function applyPassword(
	patch: Partial<User>,
	password: unknown
): Promise<boolean> {
	if (typeof password !== 'string' || !password) return false;
	const digest = await hashPassword(password);
	patch.passwordHash = digest.hash;
	patch.passwordSalt = digest.salt;
	return true;
}

function editablePatch(body: PutBody): Partial<User> {
	const patch: Partial<User> = {};
	if (body.name !== undefined) patch.name = body.name;
	if (body.email !== undefined) patch.email = body.email;
	if (body.role !== undefined) patch.role = body.role as User['role'];
	return patch;
}

async function readPutBody(request: Request): Promise<PutBody> {
	const raw = (await request.json()) as Partial<PutBody> | null;
	return raw ?? {};
}