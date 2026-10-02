import type { APIRoute } from 'astro';
import { getDb } from '../../../server/context';
import { assertSameOrigin } from '../../../server/origin';
import { json } from '../../../server/http';
import {
	userFromToken, deleteSession, clearSessionCookie
} from '../../../server/auth';
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
	const headers = new Headers({ 'Content-Type': 'application/json' });
	await clearSessionCookie(headers);
	return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};