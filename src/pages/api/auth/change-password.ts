import type { APIRoute } from 'astro';
import type { Database } from '../../../server/db';
import { getDb } from '../../../server/context';
import { assertSameOrigin } from '../../../server/origin';
import { json } from '../../../server/http';
import {
  userFromToken,
  sessionToken,
  verifyPassword,
  updateUserPassword,
  revokeOtherSessions
} from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';

type ChangeBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

const MIN_PASSWORD_LENGTH = 8;

export const POST: APIRoute = async (context) => {
  const blocked = assertSameOrigin(context.request);
  if (blocked) return blocked;
  const db = getDb();
  const ip = clientIp(context.request);
  const user = await userFromToken(db, context.request);
  if (!user) return json({ error: 'sessao_invalida' }, 404);
  const body = await readChangeBody(context.request);
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string') {
    return json({ error: 'campo_obrigatorio' }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: 'senha_curta' }, 400);
  }
  const ok = await verifyPassword(
    currentPassword, user.passwordHash, user.passwordSalt
  );
  if (!ok) return wrongCurrent(db, user.id, ip);
  return changeSuccess(
    db, user.id, newPassword, context.request, ip
  );
};

async function changeSuccess(
  db: Database,
  userId: string,
  newPassword: string,
  request: Request,
  ip: string
): Promise<Response> {
  await updateUserPassword(db, userId, newPassword);
  const token = sessionToken(request);
  if (token) await revokeOtherSessions(db, userId, token);
  await recordAudit(
    db, newAuditEntry(userId, 'password_changed', '', ip)
  );
  return json({ ok: true });
}

async function wrongCurrent(
  db: Database,
  userId: string,
  ip: string
): Promise<Response> {
  await recordAudit(
    db, newAuditEntry(userId, 'password_change_failed', '', ip)
  );
  return json({ error: 'senha_atual_invalida' }, 401);
}

async function readChangeBody(request: Request): Promise<ChangeBody> {
  const raw = (await request.json()) as Partial<ChangeBody> | null;
  return {
    currentPassword: raw?.currentPassword,
    newPassword: raw?.newPassword
  };
}