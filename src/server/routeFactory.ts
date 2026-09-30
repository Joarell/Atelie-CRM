import type { APIContext, APIRoute } from 'astro';
import type { TableShape } from './mapping';
import type { Database } from './db';
import {
	listEntities, insertEntity, updateEntity, deleteEntity, getEntity
} from './crud';
import { getDb } from './context';
import { json, notFound } from './http';
import { uid } from '../domain/format';
import {
	newActionLogEntry, recordActionLog, getClientIdFromRequest
} from './tracing';

type Body = { id?: string } & Record<string, unknown>;

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

// Every entity's REST endpoints are identical in shape (list+create,
// update+delete by id) — this factory is the Open/Closed seam: adding a
// new entity's API means calling this once, never writing new route logic.
export function createCollectionRoutes(table: string, shape: TableShape) {
	const GET: APIRoute = async () => {
		const items = await listEntities(getDb(), table, shape);
		return json(items);
	};

	const POST: APIRoute = async (context) => {
		const entity = withNewId(await context.request.json() as Body);
		const db = getDb();
		const saved = await insertEntity(db, table, shape, entity);
		await auditCreate(db, context, table, entity.id);
		const stored = await getEntity<Body & { id: string }>(
			db, table, shape, entity.id
		);
		return json(stored ?? saved, 201);
	};

	return { GET, POST };
}

export function createItemRoutes(table: string, shape: TableShape) {
	const PUT: APIRoute = async (context) => {
		const patch = (await context.request.json()) as {
			id?: string;
		} & Record<string, unknown>;
		const saved = await updateEntity(
			getDb(),
			table,
			shape,
			context.params.id!,
			patch
		);
		return saved ? json(saved) : notFound();
	};

	const DELETE: APIRoute = async (context) => {
		await deleteEntity(getDb(), table, context.params.id!);
		return json({ ok: true });
	};

	return { PUT, DELETE };
}
