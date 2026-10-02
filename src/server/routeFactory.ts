import type { APIContext, APIRoute } from 'astro';
import type { TableShape } from './mapping';
import type { Database } from './db';
import type { Role } from '../domain/crm';
import {
	listEntities, insertEntity, updateEntity, deleteEntity, getEntity
} from './crud';
import { getDb } from './context';
import { json, notFound } from './http';
import { uid } from '../domain/format';
import {
	newActionLogEntry, recordActionLog, getClientIdFromRequest
} from './tracing';
import { requireRank } from './authz';
import { numericProblems } from './mapping';

type Body = { id?: string } & Record<string, unknown>;

// Matriz por operacao, declarada como PAPEIS MINIMOS: leitura = viewer+,
// escrita = agent+, exclusao = manager+. Um `admin` passa em todas sem cada
// rota repetir a lista, e `ROLE_RANK` deixa de ser codigo morto.
type RoleConfig = {
	list?: Role;
	create?: Role;
	update?: Role;
	delete?: Role;
};

const DEFAULT_ROLES: Required<RoleConfig> = {
	list: 'viewer',
	create: 'agent',
	update: 'agent',
	delete: 'manager',
};

function withNewId(body: Body): Body & { id: string } {
	const provided = typeof body.id === 'string' ? body.id : '';
	const id = provided !== '' ? provided : uid();
	return { ...body, id };
}

async function auditCreate(
	db: Database, context: APIContext, table: string, id: string
): Promise<void> {
	const locals = context.locals as unknown as
		{ user?: { id?: string } } | undefined;
	const userId = locals?.user?.id;
	if (!userId) return;
	const detail = `${table.replace(/s$/, '')}:${id}`;
	await recordActionLog(db, newActionLogEntry(
		getClientIdFromRequest(context.request), userId, 'create',
		detail, { table, id }
	));
}

async function checkRole(
	context: APIContext, minimum: Role
): Promise<Response | null> {
	return requireRank(context, minimum);
}

// Entidades que têm dono - mapeamento de tabela para campo de dono
const OWNER_FIELDS: Record<string, string> = {
	contacts: 'assignedUserId',
	conversations: 'assignedUserId',
	deals: 'assignedUserId',
	tasks: 'assigneeUserId',
	// Adicionar mais conforme necessário
};

type LocalUser = { user?: { id?: string; role?: Role } };

async function checkOwnership(
	db: Database,
	table: string,
	shape: TableShape,
	id: string,
	userId: string,
	userRole: Role
): Promise<Response | null> {
	const ownerField = OWNER_FIELDS[table];
	if (!ownerField) return null; // Sem campo de dono, permite

	const entity = await getEntity(db, table, shape, id);
	if (!entity) return notFound();

	const ownerId = (entity as Record<string, unknown>)[ownerField] as
		string | undefined;
	if (!ownerId) return null; // Sem dono definido, permite

	// Manager e admin podem acessar qualquer registro
	if (userRole === 'manager' || userRole === 'admin') return null;

	// Verifica se o usuário é o dono
	if (ownerId !== userId) {
		return json({ error: 'nao_autorizado' }, 403);
	}

	return null;
}

function ownerOf(context: APIContext): Owner | Response {
	const locals = context.locals as LocalUser | undefined;
	const userId = locals?.user?.id;
	if (!userId) return json({ error: 'nao_autenticado' }, 401);
	return { id: userId, role: locals?.user?.role ?? 'viewer' };
}

type Owner = { id: string; role: Role };

async function guardItemWrite(
	context: APIContext,
	table: string,
	shape: TableShape,
	minimum: Role
): Promise<Response | null> {
	const denied = await checkRole(context, minimum);
	if (denied) return denied;
	const owner = ownerOf(context);
	if (owner instanceof Response) return owner;
	return checkOwnership(
		getDb(), table, shape, context.params.id!, owner.id, owner.role
	);
}

function refuseInvalid(
	shape: TableShape,
	patch: Record<string, unknown>
): Response | null {
	const invalid = numericProblems(patch, shape);
	if (invalid.length === 0) return null;
	return json({ error: 'campo_numerico_invalido', fields: invalid }, 400);
}

function listHandler(
	table: string,
	shape: TableShape,
	minimum: Role
): APIRoute {
	return async (context) => {
		const denied = await checkRole(context, minimum);
		if (denied) return denied;
		return json(await listEntities(getDb(), table, shape));
	};
}

function createHandler(
	table: string,
	shape: TableShape,
	minimum: Role
): APIRoute {
	return async (context) => {
		const denied = await checkRole(context, minimum);
		if (denied) return denied;
		const entity = withNewId(await context.request.json() as Body);
		const invalid = refuseInvalid(shape, entity);
		if (invalid) return invalid;
		const db = getDb();
		const saved = await insertEntity(db, table, shape, entity);
		await auditCreate(db, context, table, entity.id);
		const stored = await getEntity<Body & { id: string }>(
			db, table, shape, entity.id
		);
		return json(stored ?? saved, 201);
	};
}

function updateHandler(
	table: string,
	shape: TableShape,
	minimum: Role
): APIRoute {
	return async (context) => {
		const blocked = await guardItemWrite(context, table, shape, minimum);
		if (blocked) return blocked;
		const patch = (await context.request.json()) as {
			id?: string;
		} & Record<string, unknown>;
		const invalid = refuseInvalid(shape, patch);
		if (invalid) return invalid;
		const saved = await updateEntity(
			getDb(), table, shape, context.params.id!, patch
		);
		return saved ? json(saved) : notFound();
	};
}

function deleteHandler(
	table: string,
	shape: TableShape,
	minimum: Role
): APIRoute {
	return async (context) => {
		const blocked = await guardItemWrite(context, table, shape, minimum);
		if (blocked) return blocked;
		await deleteEntity(getDb(), table, context.params.id!);
		return json({ ok: true });
	};
}

// Every entity's REST endpoints are identical in shape (list+create,
// update+delete by id) — this factory is the Open/Closed seam: adding a
// new entity's API means calling this once, never writing new route logic.
export function createCollectionRoutes(
	table: string,
	shape: TableShape,
	roles: RoleConfig = DEFAULT_ROLES
) {
	const GET = listHandler(table, shape, roles.list ?? DEFAULT_ROLES.list);
	const POST = createHandler(
		table, shape, roles.create ?? DEFAULT_ROLES.create
	);
	return { GET, POST };
}

export function createItemRoutes(
	table: string,
	shape: TableShape,
	roles: RoleConfig = DEFAULT_ROLES
) {
	const PUT = updateHandler(
		table, shape, roles.update ?? DEFAULT_ROLES.update
	);
	const DELETE = deleteHandler(
		table, shape, roles.delete ?? DEFAULT_ROLES.delete
	);
	return { PUT, DELETE };
}
