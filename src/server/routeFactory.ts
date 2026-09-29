import type { APIRoute } from 'astro';
import type { TableShape } from './mapping';
import { listEntities, insertEntity, updateEntity, deleteEntity } from './crud';
import { getDb } from './context';
import { json, notFound } from './http';

// Every entity's REST endpoints are identical in shape (list+create,
// update+delete by id) — this factory is the Open/Closed seam: adding a
// new entity's API means calling this once, never writing new route logic.
export function createCollectionRoutes(table: string, shape: TableShape) {
  const GET: APIRoute = async () => {
    const items = await listEntities(getDb(), table, shape);
    return json(items);
  };

  const POST: APIRoute = async (context) => {
    const entity = (await context.request.json()) as {
      id: string;
    } & Record<string, unknown>;
    const saved = await insertEntity(getDb(), table, shape, entity);
    return json(saved, 201);
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
