import type { APIRoute } from 'astro';
import type { User, Role } from '../../../domain/crm';
import { getDb } from '../../../server/context';
import { listEntities, insertEntity } from '../../../server/crud';
import { USERS_TABLE, USERS_SHAPE } from '../../../server/tables';
import { publicUser, hashPassword } from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';
import { requireRole } from '../../../server/authz';
import { uid, nowISO } from '../../../domain/format';
import { json } from '../../../server/http';

const ROLES: Role[] = ['viewer', 'agent', 'manager', 'admin'];
const USER_MANAGERS: Role[] = ['admin', 'manager'];
const ADMINS: Role[] = ['admin'];

type UserBody = {
	id?: unknown;
	name?: unknown;
	email?: unknown;
	role?: unknown;
	password?: unknown;
};

export const GET: APIRoute = async (context) => {
	const denied = await requireRole(context, USER_MANAGERS);
	if (denied) return denied;
	const users = await listEntities<User>(getDb(), USERS_TABLE, USERS_SHAPE);
	return json(users.map(publicUser));
};

export const POST: APIRoute = async (context) => {
	const body = await readUserBody(context.request);
	const denied = await requireRole(context, allowedRoles(body));
	if (denied) return denied;
	const db = getDb();
	const ip = clientIp(context.request);
	if (!body.name || !body.email || !body.password || !body.role) {
		return json({ error: 'campos_obrigatorios' }, 400);
	}
	if (!ROLES.includes(body.role as Role)) {
		return json({ error: 'papel_invalido' }, 400);
	}
	const user = await buildUser(body);
	await insertEntity(db, USERS_TABLE, USERS_SHAPE, user);
	await recordAudit(
		db, newAuditEntry(user.id, 'user_created', user.email, ip)
	);
	return json(publicUser(user), 201);
};

// Um `manager` cria e senha os demais usuarios, mas nao pode fabricar outro
// `admin` — escalada de privilegio. O campo `password` nao entra na conta:
// todo POST precisa de uma senha, e trata-lo como restrito barrava o proprio
// `manager` que a regra existe para permitir.
function allowedRoles(body: UserBody): Role[] {
	return body.role === 'admin' ? ADMINS : USER_MANAGERS;
}

async function buildUser(body: UserBody): Promise<User> {
	const digest = await hashPassword(String(body.password));
	return {
		id: typeof body.id === 'string' && body.id ? body.id : uid(),
		name: String(body.name),
		email: String(body.email),
		passwordHash: digest.hash,
		passwordSalt: digest.salt,
		role: body.role as Role,
		createdAt: nowISO()
	};
}

async function readUserBody(request: Request): Promise<UserBody> {
	const raw = (await request.json()) as Partial<UserBody> | null;
	return raw ?? {};
}