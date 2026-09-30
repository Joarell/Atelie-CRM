import type { Database } from './db';
import type {
	Message, MessageDirection, WahaMessageStatus
} from '../domain/crm';
import { nowISO, uid } from '../domain/format';
import {
	ackToWahaStatus,
	bareWaMessageId,
	isIgnoredChat,
	parseWahaMessageId,
	waNotifyName,
	waTimestampToISO,
	wahaEchoExternalIds,
	wahaPeerPhone,
	type WahaEnvelope,
	type WahaPayload
} from '../domain/wahaWebhook';
import { ensureWahaContact, ensureWahaConversation } from './wahaContact';
import {
	defaultFor, findWhere, numericField, textField, touchConversation, truncate
} from './wahaSql';

// Message-id reconciliation for the WAHA webhook stream. `messageByWahaId`
// matches full AND bare forms (WAHA emits `message` and `message.any` for the
// same message); `applyWahaMessageRow` is the shared ingest used by the
// inbound/outbound handlers — dedup, then contact/conversation/message write.

export interface WahaMessageRow {
	id: string;
	conversationId: string;
	direction: 'inbound' | 'outbound';
	text: string;
	createdBy: string;
	createdAt: string;
	externalId: string | null;
	ack: number;
	waStatus: WahaMessageStatus;
	messageType: string;
	mediaUrl: string;
	mediaMime: string;
	remoteJid: string;
	fromMe: 0 | 1;
	waTimestamp: number;
	editedAt: string;
	revokedAt: string;
	deliveredAt: string;
	readAt: string;
}

export async function messageByWahaId(
	db: Database,
	id: string,
	recipient: string | null
): Promise<Message | null> {
	for (const candidate of wahaEchoExternalIds(id, recipient)) {
		const rows = await findWhere<Message>(
			db, 'messages', 'externalId', candidate
		);
		if (rows[0]) return rows[0];
	}
	return null;
}

const MESSAGE_COLUMNS = [
	'id', 'conversationId', 'direction', 'text', 'createdBy', 'createdAt',
	'externalId', 'ack', 'waStatus', 'messageType', 'mediaUrl', 'mediaMime',
	'remoteJid', 'fromMe', 'waTimestamp', 'editedAt', 'revokedAt', 'deliveredAt',
	'readAt'
];

function insertionValues(row: WahaMessageRow): unknown[] {
	return MESSAGE_COLUMNS.map((c) => {
		const value = (row as unknown as Record<string, unknown>)[c];
		// `externalId` must stay NULL — an empty string would collide with the
		// partial unique index (`WHERE externalId IS NOT NULL`) and make
		// `INSERT OR IGNORE` silently drop every later send's queued row.
		return c === 'externalId' ? (value ?? null) : (value ?? defaultFor(c, row));
	});
}

export async function insertWahaMessage(
	db: Database,
	row: WahaMessageRow
): Promise<Message> {
	const cols = MESSAGE_COLUMNS.join(', ');
	const holes = MESSAGE_COLUMNS.map(() => '?').join(', ');
	const values = insertionValues(row);
	// `INSERT OR IGNORE` keeps concurrent webhook deliveries of the same
	// outbound message from colliding on the `externalId` unique index — one
	// wins, the loser re-reads the winner's row below instead of crashing.
	// Writes go through `batch()`: single `.run()` writes are silently dropped
	// from some dev-worker routes, while batch always persists.
	await db.batch([
		db
			.prepare(
				`INSERT OR IGNORE INTO messages (${cols}) VALUES (${holes})`
			)
			.bind(...values)
	]);
	const winner = row.externalId
		? await messageByWahaId(db, row.externalId, null)
		: null;
	return (winner ?? row) as unknown as Message;
}

// ── Shared ingest (inbound + outbound echo) ───────────────────────────

interface WahaTick {
	at: string;
	waTimestamp: number;
	createdAt: string;
}

function wahaTick(payload: WahaPayload | undefined): WahaTick {
	const at = nowISO();
	const waTimestamp = numericField(payload?.timestamp, 0);
	const createdAt = waTimestampToISO(waTimestamp) || at;
	return { at, waTimestamp, createdAt };
}

export async function applyWahaMessageRow(
	db: Database,
	envelope: WahaEnvelope,
	direction: MessageDirection
): Promise<Message | null> {
	return direction === 'inbound'
		? applyInboundRow(db, envelope)
		: applyOutboundRow(db, envelope);
}

async function applyInboundRow(
	db: Database, envelope: WahaEnvelope
): Promise<Message | null> {
	const payload = envelope.payload;
	const chatId = typeof payload?.from === 'string' ? payload.from : null;
	if (!chatId || isIgnoredChat(chatId)) return null;
	const phone = wahaPeerPhone(chatId, payload ?? {});
	if (!phone) return null;
	const externalId = parseWahaMessageId(payload?.id);
	if (!externalId) return null;
	const existing = await messageByWahaId(db, externalId, null);
	if (existing) return existing;
	return persistMessageRow(
		db, envelope, 'inbound', phone, chatId, externalId,
		waNotifyName(payload ?? {})
	);
}

async function applyOutboundRow(
	db: Database, envelope: WahaEnvelope
): Promise<Message | null> {
	const payload = envelope.payload;
	const externalId = parseWahaMessageId(payload?.id);
	if (!externalId) return null;
	const existing = await messageByWahaId(db, externalId, null);
	if (existing) return existing;
	const chatId = typeof payload?.to === 'string' ? payload.to : null;
	const phone = chatId ? wahaPeerPhone(chatId, payload ?? {}) : null;
	if (!phone) return null;
	return persistMessageRow(
		db, envelope, 'outbound', phone, chatId ?? '', externalId, null
	);
}

async function persistMessageRow(
	db: Database,
	envelope: WahaEnvelope,
	direction: MessageDirection,
	phone: string,
	chatId: string,
	externalId: string,
	contactName: string | null
): Promise<Message> {
	const tick = wahaTick(envelope.payload);
	const contact = await ensureWahaContact(db, phone, contactName, tick.at);
	const conversation = await ensureWahaConversation(
		db, contact, chatId, phone, tick.at
	);
	const row = buildMessageRow(
		conversation.id, tick, externalId, chatId, direction, envelope.payload
	);
	const message = await insertWahaMessage(db, row);
	await touchConversation(db, conversation.id, tick.createdAt);
	return message;
}

function buildMessageRow(
	conversationId: string,
	tick: WahaTick,
	externalId: string,
	remoteJid: string,
	direction: MessageDirection,
	payload: WahaPayload | undefined
): WahaMessageRow {
	const mediaUrl = truncate(payload?.media?.url, 512);
	const mediaMime = truncate(payload?.media?.mimetype, 100);
	const type = textField(payload?.type, 'text');
	const ack = numericField(payload?.ack, 0);
	const body = textField(payload?.body, '');
	const text = directionText(direction, body, mediaUrl, type);
	return messageRowBase({
		conversationId, tick, externalId, remoteJid, direction, text, ack,
		type, mediaUrl, mediaMime
	});
}

function directionText(
	direction: MessageDirection, body: string, mediaUrl: string, type: string
): string {
	return direction === 'outbound'
		? body
		: body || (mediaUrl ? `[${type}]` : '');
}

function messageRowBase(input: {
	conversationId: string;
	tick: WahaTick;
	externalId: string;
	remoteJid: string;
	direction: MessageDirection;
	text: string;
	ack: number;
	type: string;
	mediaUrl: string;
	mediaMime: string;
}): WahaMessageRow {
	return {
		id: uid(),
		conversationId: input.conversationId,
		direction: input.direction,
		text: input.text,
		createdBy: '',
		createdAt: input.tick.createdAt,
		externalId: input.externalId,
		ack: input.ack,
		waStatus: ackToWahaStatus(input.ack),
		messageType: input.type,
		mediaUrl: input.mediaUrl,
		mediaMime: input.mediaMime,
		remoteJid: input.remoteJid,
		fromMe: input.direction === 'inbound' ? 0 : 1,
		waTimestamp: input.tick.waTimestamp,
		editedAt: '',
		revokedAt: '',
		deliveredAt: '',
		readAt: ''
	};
}

export function bareIdOf(full: string): string {
	return bareWaMessageId(full);
}