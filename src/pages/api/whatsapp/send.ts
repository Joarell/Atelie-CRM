import type { APIContext, APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { userFromToken } from '../../../server/auth';
import { getDb } from '../../../server/context';
import { json } from '../../../server/http';
import type { WahaConfig } from '../../../server/waha';
import { readWahaConfig, WahaClient } from '../../../server/waha';
import { sendWahaText, WahaSendError } from '../../../server/wahaIngest';
import { getEntity } from '../../../server/crud';
import { hasRole } from '../../../server/authz';
import type { Database } from '../../../server/db';
import type { User } from '../../../domain/crm';
import {
	CONVERSATIONS_TABLE,
	CONVERSATIONS_SHAPE
} from '../../../server/tables';

// Sends a text through the WAHA engine into an existing WhatsApp conversation
// (the row is persisted first as `queued`, then flipped to `sent`/`failed`).
// Errors carry only safe codes — never a WAHA response body.

async function guardSend(
	context: APIContext,
	db: Database
): Promise<{ user: User; config: WahaConfig } | Response> {
	const user = await userFromToken(db, context.request);
	if (!user) return json({ error: 'sessao_invalida' }, 401);
	// Sem este gate, um `viewer` dono da propria conversa escrevia no WhatsApp:
	// a posse sozinha nao distingue leitura de escrita. A rota se auto-autentica
	// por token, entao o gate usa o usuario ja resolvido em vez de locals.user.
	if (!hasRole(user, ['agent', 'manager', 'admin'])) {
		return json({ error: 'papel_insuficiente' }, 403);
	}
	const config = readWahaConfig(env);
	if (!config) return json({ error: 'waha_nao_configurado' }, 503);
	return { user, config };
}

async function guardConversation(
	db: Database,
	user: User,
	conversationId: string
): Promise<Response | null> {
	const conversation = await getEntity(
		db, CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE, conversationId
	) as { assignedUserId: string } | null;
	if (!conversation) {
		return json({ error: 'conversation_not_found' }, 404);
	}
	const elevated = user.role === 'manager' || user.role === 'admin';
	if (conversation.assignedUserId === user.id || elevated) return null;
	return json({ error: 'nao_autorizado' }, 403);
}

export const POST: APIRoute = async (context) => {
	const db = getDb();
	const gate = await guardSend(context, db);
	if (gate instanceof Response) return gate;

	const parsed = await parseSendBody(context);
	if (!parsed.ok) return parsed.response;

	const denied = await guardConversation(
		db, gate.user, parsed.value.conversationId
	);
	if (denied) return denied;

	try {
		const message = await sendWahaText(db, new WahaClient(gate.config), {
			conversationId: parsed.value.conversationId,
			text: parsed.value.text,
			userId: gate.user.id,
			replyTo: parsed.value.replyTo
		});
		return json({ message }, 201);
	} catch (error) {
		return sendErrorResponse(error);
	}
};

type SendBodyValues = {
	conversationId: string;
	text: string;
	replyTo: string | null;
};

type SendBodyParse =
	| { ok: true; value: SendBodyValues }
	| { ok: false; response: Response };

async function parseSendBody(
	context: APIContext
): Promise<SendBodyParse> {
	let body: { conversationId?: unknown; text?: unknown; replyTo?: unknown };
	try {
		body = (await context.request.json()) as typeof body;
	} catch {
		return { ok: false, response: json({ error: 'invalid_json' }, 400) };
	}
	const value = {
		conversationId:
			typeof body.conversationId === 'string' ? body.conversationId : '',
		text: typeof body.text === 'string' ? body.text.trim() : '',
		replyTo:
			typeof body.replyTo === 'string' && body.replyTo.trim().length > 0
				? body.replyTo.trim()
				: null
	} as SendBodyValues;
	if (!value.conversationId || !value.text) {
		return {
			ok: false,
			response: json({ error: 'validation_failed' }, 422)
		};
	}
	return { ok: true, value };
}

function sendErrorResponse(error: unknown): Response {
	if (error instanceof WahaSendError) {
		if (error.code === 'conversation_not_found') {
			return json({ error: 'conversation_not_found' }, 404);
		}
		if (error.code === 'wrong_channel') {
			return json({ error: 'wrong_channel' }, 422);
		}
		if (error.code === 'missing_phone') {
			return json({ error: 'missing_phone' }, 422);
		}
	}
	const detail =
		error instanceof Error ? error.message.slice(0, 200) : 'waha_unknown';
	return json({ error: detail }, 502);
}