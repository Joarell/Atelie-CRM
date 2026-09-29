import type { APIRoute } from 'astro';
import type { User } from '../../../domain/crm';
import { getDb } from '../../../server/context';
import { getEntity, updateEntity, deleteEntity } from '../../../server/crud';
import { USERS_TABLE, USERS_SHAPE } from '../../../server/tables';
import {
  publicUser,
  hashPassword,
  deleteSessionsForUser
} from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';
import { json } from '../../../server/http';

const NOT_FOUND = 'Not found';

type PutBody = {
  name?: string;
  email?: string;
  role?: string;
  password?: string;
};

export const PUT: APIRoute = async (context) => {
  const db = getDb();
  const ip = clientIp(context.request);
  const { id } = context.params;
  const existing = await getEntity<User>(
    db, USERS_TABLE, USERS_SHAPE, id!
  );
  if (!existing) return json({ error: NOT_FOUND }, 404);
  const body = await readPutBody(context.request);
  const patch = editablePatch(body);
  if (typeof body.password === 'string' && body.password) {
    patch.passwordHash = await hashPassword(body.password);
  }
  const saved = await updateEntity<User>(
    db, USERS_TABLE, USERS_SHAPE, id!, patch
  );
  if (!saved) return json({ error: NOT_FOUND }, 404);
  if (patch.passwordHash) {
    await deleteSessionsForUser(db, id!);
    await recordAudit(
      db, newAuditEntry(id!, 'user_password_reset', saved.email, ip)
    );
  }
  return json(publicUser(saved));
};

export const DELETE: APIRoute = async (context) => {
  const db = getDb();
  const ip = clientIp(context.request);
  const { id } = context.params;
  await deleteEntity(db, USERS_TABLE, id!);
  await recordAudit(
    db, newAuditEntry(id!, 'user_deleted', '', ip)
  );
  return json({ ok: true });
};

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