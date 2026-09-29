import type { APIRoute } from 'astro';
import { getDb } from '../../../server/context';
import { assertSameOrigin } from '../../../server/origin';
import { json } from '../../../server/http';
import { userFromToken, deleteSession } from '../../../server/auth';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';

export const POST: APIRoute = async (context) => {
  const blocked = assertSameOrigin(context.request);
  if (blocked) return blocked;
  const db = getDb();
  const user = await userFromToken(db, context.request);
  await deleteSession(db, context.request);
  if (user) {
    await recordAudit(
      db,
      newAuditEntry(user.id, 'logout', user.email, clientIp(context.request))
    );
  }
  return json({ ok: true });
};