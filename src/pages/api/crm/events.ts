import type { APIRoute } from 'astro';
import { getDb } from '../../../server/context';
import {
	userFromToken
} from '../../../server/auth';
import { json } from '../../../server/http';
import type { Database } from '../../../server/db';
import type { Role, User } from '../../../domain/crm';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30000;

function createEventSender(controller: ReadableStreamDefaultController) {
	const encoder = new TextEncoder();
	return (eventType: string, data: unknown) => {
		const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
		controller.enqueue(encoder.encode(payload));
	};
}

// O stream e' recortado pelas conversas do usuario: quem assiste o inbox
// ve as conversas que lhe sao atribuidas (ou todas, se for manager/admin)
// e nada mais. Sem esse recorte, qualquer sessao recebia `m.*` do sistema
// inteiro junto do nome e telefone de todos os contatos.
const SEES_ALL: Role[] = ['manager', 'admin'];

async function visibleConversationIds(
	db: Database, user: User
): Promise<string[] | null> {
	if (SEES_ALL.includes(user.role)) return null;
	const assigned = await db
		.prepare(
			`SELECT c.id FROM conversations c
			 JOIN contacts ct ON ct.id = c.contactId
			 WHERE ct.assignedUserId = ? OR c.assignedUserId = ?`
		)
		.bind(user.id, user.id)
		.all<{ id: string }>();
	return (assigned.results ?? []).map((row) => row.id);
}

function inClause(ids: string[]): string {
	return ids.map(() => '?').join(', ');
}

// Sem conversas visiveis o `IN ()` seria sintaxe invalida no SQLite.
const NO_SCOPE = 'SELECT * FROM conversations WHERE 0';

async function fetchNewMessages(
	db: Database, sinceIso: string, scope: string[] | null
) {
	const base = `SELECT m.*, c.name as contact_name, c.phone as contact_phone
			 FROM messages m
			 LEFT JOIN contacts c ON m.conversationId = c.id
			 WHERE m.createdAt > ?`;
	if (!scope) {
		return db.prepare(`${base} ORDER BY m.createdAt ASC`).bind(sinceIso).all();
	}
	if (scope.length === 0) return { results: [] as Record<string, unknown>[] };
	return db
		.prepare(`${base} AND m.conversationId IN (${inClause(scope)})
			 ORDER BY m.createdAt ASC`)
		.bind(sinceIso, ...scope)
		.all();
}

async function fetchNewConversations(
	db: Database, sinceIso: string, scope: string[] | null
) {
	if (scope) {
		if (scope.length === 0) return { results: [] as Record<string, unknown>[] };
		return db
			.prepare(
				`SELECT * FROM conversations
				 WHERE createdAt > ? AND id IN (${inClause(scope)})`
			)
			.bind(sinceIso, ...scope)
			.all();
	}
	return db
		.prepare('SELECT * FROM conversations WHERE createdAt > ?')
		.bind(sinceIso)
		.all();
}

async function fetchUpdatedConversations(
	db: Database, sinceIso: string, scope: string[] | null
) {
	if (scope) {
		if (scope.length === 0) return { results: [] as Record<string, unknown>[] };
		return db
			.prepare(
				`SELECT * FROM conversations
				 WHERE lastMessageAt > ? AND id IN (${inClause(scope)})`
			)
			.bind(sinceIso, ...scope)
			.all();
	}
	return db
		.prepare('SELECT * FROM conversations WHERE lastMessageAt > ?')
		.bind(sinceIso)
		.all();
}

function sendPayload(
	sendEvent: (eventType: string, data: unknown) => void,
	type: string,
	data: unknown,
	timestamp: number
): void {
	sendEvent(type, { data, timestamp });
}

async function pollOnce(
	sendEvent: (eventType: string, data: unknown) => void,
	getDb: () => Database,
	sinceIso: string,
	scope: string[] | null
): Promise<void> {
	try {
		const db = getDb();
		const now = Date.now();

		const messages = await fetchNewMessages(db, sinceIso, scope);
		if (messages.results.length > 0) {
			sendPayload(sendEvent, 'messages', messages.results, now);
		}

		const conversations = await fetchNewConversations(db, sinceIso, scope);
		if (conversations.results.length > 0) {
			sendPayload(sendEvent, 'conversations', conversations.results, now);
		}

		const updated = await fetchUpdatedConversations(db, sinceIso, scope);
		if (updated.results.length > 0) {
			sendPayload(sendEvent, 'conversations_updated', updated.results, now);
		}
	} catch (error) {
		console.error('SSE error:', error);
		sendPayload(sendEvent, 'error', String(error), Date.now());
	}
}

function setupEventLoop(
	sendEvent: (eventType: string, data: unknown) => void,
	getDb: () => Database,
	sinceIso: string,
	scope: string[] | null
): {
	interval: ReturnType<typeof setInterval>;
	heartbeat: ReturnType<typeof setInterval>;
} {
	const interval = setInterval(() => {
		void pollOnce(sendEvent, getDb, sinceIso, scope);
	}, POLL_INTERVAL_MS);

	const heartbeat = setInterval(() => {
		sendEvent('heartbeat', { timestamp: Date.now() });
	}, HEARTBEAT_INTERVAL_MS);

	return { interval, heartbeat };
}

function createSseStream(
	controller: ReadableStreamDefaultController,
	signal: AbortSignal,
	getDb: () => Database,
	sinceIso: string,
	scope: string[] | null
): void {
	const sendEvent = createEventSender(controller);
	sendEvent('connected', { timestamp: Date.now() });

	const { interval, heartbeat } = setupEventLoop(
		sendEvent, getDb, sinceIso, scope
	);

	signal.addEventListener('abort', () => {
		clearInterval(interval);
		clearInterval(heartbeat);
		controller.close();
	});
}

function sinceIsoOf(url: URL): string {
	const since = url.searchParams.get('since');
	const last = since ? parseInt(since, 10) : Date.now();
	return new Date(last).toISOString();
}

// SSE endpoint for real-time CRM updates. Clients connect to this endpoint
// to receive push notifications when webhook events (messages, acks, etc.)
// are processed. The server periodically checks D1 for new events and
// pushes them to connected clients.
export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'sessao_invalida' }, 401);

	const sinceIso = sinceIsoOf(context.url);
	const db = getDb();
	const scope = await visibleConversationIds(db, user);

	const stream = new ReadableStream({
		start(controller) {
			createSseStream(
				controller, context.request.signal, getDb, sinceIso, scope
			);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};