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

// Modelo de posse discriminado: ou a tabela tem a coluna de dono,
// ou herda do pai (messages -> conversations).
type OwnershipMap = {
	kind: 'column';
	field: string;
} | {
	kind: 'via';
	table: string;
	field: string;
};

const OWNERSHIP: Record<string, OwnershipMap> = {
	contacts: { kind: 'column', field: 'assignedUserId' },
	conversations: { kind: 'column', field: 'assignedUserId' },
	deals: { kind: 'column', field: 'assignedUserId' },
	tasks: { kind: 'column', field: 'assigneeUserId' },
	calendar_events: { kind: 'column', field: 'assignedUserId' },
	catalog_products: { kind: 'column', field: 'assignedUserId' },
	crm_lead_activities: { kind: 'column', field: 'assignedUserId' },
	conversation_notes: { kind: 'column', field: 'assignedUserId' },
	// messages nao tem coluna propria; herda a posse da conversa
	messages: { kind: 'via', table: 'conversations', field: 'assignedUserId' },
};

type LocalUser = { user?: { id?: string; role?: Role } };

// Lookup do dono: ou coluna direta, ou via tabela pai.
// Falha fechada: se a coluna de dono estiver vazia (ou nao existir),
// o agent ve 403. Manager/admin sempre passam.
async function checkOwnership(
	db: Database,
	table: string,
	shape: TableShape,
	id: string,
	userId: string,
	userRole: Role
): Promise<Response | null> {
	const om = OWNERSHIP[table];
	if (!om) return null; // tabela sem dono definido, permite

	const ownerId = await resolveOwnerId(db, table, shape, id, om);
	if (!ownerId) {
		// Dono vazio: fail-closed para agent/viewer
		if (userRole === 'manager' || userRole === 'admin') return null;
		return json({ error: 'nao_autorizado' }, 403);
	}

	// Manager e admin passam
	if (userRole === 'manager' || userRole === 'admin') return null;

	if (ownerId !== userId) {
		return json({ error: 'nao_autorizado' }, 403);
	}

	return null;
}

async function resolveOwnerId(
	db: Database,
	table: string,
	shape: TableShape,
	id: string,
	om: OwnershipMap
): Promise<string | undefined> {
	if (om.kind === 'column') {
		const entity = await getEntity(db, table, shape, id);
		if (!entity) return undefined;
		return (entity as Record<string, unknown>)[om.field] as string | undefined;
	}
	// heranca: messages -> conversations
	const entity = await getEntity(db, table, shape, id);
	if (!entity) return undefined;
	const parentId = (entity as Record<string, unknown>)[
		om.table === 'conversations' ? 'conversationId' : om.field
	] as string | undefined;
	if (!parentId) return undefined;
	const parent = await getEntity(db, om.table, shape, parentId);
	if (!parent) return undefined;
	return (parent as Record<string, unknown>)[om.field] as string | undefined;
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

// Campos que nunca podem ser alterados no PUT. A chave e o nome da tabela.
const IMMUTABLE_FIELDS: Record<string, string[]> = {
	contacts: ['createdBy', 'createdAt'],
	deals: ['createdBy', 'createdAt'],
	tasks: ['createdBy', 'createdAt'],
	calendar_events: ['createdBy', 'createdAt'],
	catalog_products: ['createdBy', 'createdAt'],
	crm_lead_activities: ['actorUserId', 'createdAt'],
	conversation_notes: ['authorUserId', 'createdAt'],
	conversations: ['assignedUserId', 'createdAt', 'createdBy'],
	// messages: imutaveis p/ integracao de chat (apenas autoria)
	messages: [
		'text', 'fromMe', 'direction', 'conversationId',
		'createdAt', 'createdBy'
	],
	quick_replies: ['createdBy', 'createdAt'],
};

function refuseInvalid(
	shape: TableShape,
	patch: Record<string, unknown>
): Response | null {
	const invalid = numericProblems(patch, shape);
	if (invalid.length === 0) return null;
	return json({ error: 'campo_numerico_invalido', fields: invalid }, 400);
}

function refuseImmutable(
	table: string,
	patch: Record<string, unknown>
): Response | null {
	const immut = IMMUTABLE_FIELDS[table] ?? [];
	const forbidden = Object.keys(patch).filter((k) => immut.includes(k));
	if (forbidden.length === 0) return null;
	return json(
		{ error: 'campo_imutavel', fields: forbidden },
		400
	);
}

function refuseEmptyOwner(
	table: string,
	patch: Record<string, unknown>
): Response | null {
	const om = OWNERSHIP[table];
	if (!om) return null;
	const field = om.kind === 'column' ? om.field : null;
	if (!field) return null;
	if (patch[field] === '') {
		return json(
			{ error: 'dono_vazio', field },
			400
		);
	}
	return null;
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
		// Deriva o dono da sessao quando a tabela tem coluna de dono
		const om = OWNERSHIP[table];
		if (om && om.kind === 'column') {
			const locals = context.locals as LocalUser | undefined;
			const userId = locals?.user?.id;
			if (userId && !entity[om.field]) {
				(entity as Record<string, unknown>)[om.field] = userId;
			}
		}
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
		// Validacoes de superficie de escrita
		const invalid = refuseInvalid(shape, patch);
		if (invalid) return invalid;
		const imm = refuseImmutable(table, patch);
		if (imm) return imm;
		const empty = refuseEmptyOwner(table, patch);
		if (empty) return empty;
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