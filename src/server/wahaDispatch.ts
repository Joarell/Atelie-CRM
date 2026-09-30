import type { Database } from './db';
import type { Message } from '../domain/crm';
import { nowISO } from '../domain/format';
import {
	WAHA_DEFAULT_SESSION,
	WAHA_SESSION_STATUSES
} from '../domain/whatsapp';
import {
	ackToWahaStatus,
	isWahaAckEvent,
	isWahaEditedEvent,
	isWahaMessageEvent,
	isWahaRevokedEvent,
	isWahaSessionEvent,
	parseWahaChatId,
	type WahaEnvelope
} from '../domain/wahaWebhook';
import { applyWahaMessageRow, messageByWahaId } from './wahaMessage';
import { findWhere, numericField, textField, updateById } from './wahaSql';

// Webhook handlers, one per event kind, routed by `dispatchWahaEvent`. The
// two message handlers keep WAHA's guard order (chat then id for inbound,
// id then chat for outbound) so a replay of an existing id always wins.

export async function handleInboundMessage(
	db: Database, envelope: WahaEnvelope
): Promise<Message | null> {
	return applyWahaMessageRow(db, envelope, 'inbound');
}

export async function handleOutboundEcho(
	db: Database, envelope: WahaEnvelope
): Promise<Message | null> {
	return applyWahaMessageRow(db, envelope, 'outbound');
}

export async function handleWahaAck(
	db: Database, envelope: WahaEnvelope
): Promise<void> {
	const payload = envelope.payload;
	const id = textField(payload?.id, '');
	if (!id) return;
	const recipient =
		payload?.to && typeof payload.to === 'string'
			? parseWahaChatId(payload.to)
			: null;
	const message = await messageByWahaId(db, id, recipient);
	if (!message) return;
	const ack = numericField(payload?.ack, message.ack ?? 0);
	const deliveredAt =
		ack >= 2 && !message.deliveredAt ? nowISO() : message.deliveredAt;
	const readAt = ack >= 3 && !message.readAt ? nowISO() : message.readAt;
	await updateById<Message>(db, 'messages', message.id, {
		ack, waStatus: ackToWahaStatus(ack), deliveredAt, readAt
	});
}

export async function handleWahaEdited(
	db: Database, envelope: WahaEnvelope
): Promise<void> {
	const editedId = textField(envelope.payload?.editedMessageId, '');
	if (!editedId) return;
	const message = await messageByWahaId(db, editedId, null);
	if (!message) return;
	await updateById<Message>(db, 'messages', message.id, {
		text: textField(envelope.payload?.body, message.text),
		editedAt: nowISO()
	});
}

export async function handleWahaRevoked(
	db: Database, envelope: WahaEnvelope
): Promise<void> {
	const revokedId = textField(envelope.payload?.revokedMessageId, '');
	if (!revokedId) return;
	const message = await messageByWahaId(db, revokedId, null);
	if (!message) return;
	await updateById<Message>(db, 'messages', message.id, {
		revokedAt: nowISO()
	});
}

export async function handleWahaSessionStatus(
	db: Database, envelope: WahaEnvelope
): Promise<void> {
	const rawStatus = textField(envelope.payload?.status, '');
	const known =
		(WAHA_SESSION_STATUSES as readonly string[]).includes(rawStatus);
	const status = known ? rawStatus : '';
	if (!status) return;
	await mirrorWahaSessionState(
		db, envelope.session || WAHA_DEFAULT_SESSION, status
	);
}

/** Persists the session mirror (single `default` session, sparse). */
export async function mirrorWahaSessionState(
	db: Database, name: string, status: string
): Promise<void> {
	const at = nowISO();
	const existing = await findWhere<Record<string, unknown>>(
		db, 'waha_sessions', 'name', name
	);
	if (existing[0]) await mirrorUpdate(db, name, status, at);
	else await mirrorInsert(db, name, status, at);
}

async function mirrorUpdate(
	db: Database, name: string, status: string, at: string
): Promise<void> {
	await db
		.prepare(
			'UPDATE waha_sessions SET status = ?, lastCheckAt = ?, ' +
			'lastChangeAt = ? WHERE name = ?'
		)
		.bind(status, at, at, name)
		.run();
}

async function mirrorInsert(
	db: Database, name: string, status: string, at: string
): Promise<void> {
	await db
		.prepare(
			'INSERT INTO waha_sessions (name, status, lastCheckAt, ' +
			'lastChangeAt) VALUES (?, ?, ?, ?)'
		)
		.bind(name, status, at, at)
		.run();
}

// Routes the interpreted envelope to its handler. Never throws — the webhook
// route returns 200 regardless, exactly like the reference (refuse is 400,
// and 5xx would make WAHA redeliver what can never pass).
export async function dispatchWahaEvent(
	db: Database, envelope: WahaEnvelope
): Promise<void> {
	try {
		if (isWahaMessageEvent(envelope.event)) {
			if (envelope.payload?.fromMe) await handleOutboundEcho(db, envelope);
			else await handleInboundMessage(db, envelope);
			return;
		}
		if (isWahaAckEvent(envelope.event)) return handleWahaAck(db, envelope);
		if (isWahaEditedEvent(envelope.event)) {
			return handleWahaEdited(db, envelope);
		}
		if (isWahaRevokedEvent(envelope.event)) {
			return handleWahaRevoked(db, envelope);
		}
		if (isWahaSessionEvent(envelope.event)) {
			return handleWahaSessionStatus(db, envelope);
		}
	} catch {
		// Interpretation failure: never bounce the event back to WAHA.
	}
}