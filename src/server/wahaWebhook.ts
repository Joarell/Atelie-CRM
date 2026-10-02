import type { Database } from './db';
import { uid, nowISO } from '../domain/format';
import {
	parseWahaEnvelope,
	routeWahaEvent
} from '../domain/wahaWebhook';
import { dispatchWahaEvent } from './wahaIngest';
import { WEBHOOK_EVENTS_TABLE } from './tables';

// WAHA webhook receiver. Two-staged like the reference (`lib/waha/ingest.ts`):
//   1. `routeWahaEvent` extracts just enough (event + session + id) to archive
//      the RAW body BEFORE any stricter parse runs — a payload that fails the
//      contract is still stored, never lost;
//   2. `parseWahaEnvelope` interprets it, and `dispatchWahaEvent` mutates the
//      CRM. Interpretation failures never reach WAHA as 5xx (it would redeliver
//      what can never pass) — refusal is 400, everything else is 200-accepted.

export interface WahaWebhookConfig {
	hmacSecret: string | null;
	requireSignature: boolean;
}

export interface WahaWebhookAuth {
	ok: boolean;
	reason: 'missing_signature' | 'bad_signature' | 'ok';
	signatureVerified: boolean;
}

// O segredo tem que ter forca de verdade. "Nao vazio" acceptava o texto de
// instrucao `gere-um-segredo-por-ambiente-openssl-rand-hex-32` como se fosse
// uma chave, e um segredo curto e adivinhavel passava do mesmo jeito — o
// unico criterio de validade era `text()`. Placeholders conhecidos e chaves
// curtas sao recusados, e um segredo recusado DEIXA A VERIFICACAO DESLIGADA
// (fail-closed, nunca fail-open).
const HMAC_MIN_BYTES = 32;
const PLACEHOLDER_SECRETS = new Set([
	'gere-um-segredo-por-ambiente-openssl-rand-hex-32',
	'dev_plaintext_change_me',
	'INVALID_CHANGE_ME',
	'change-me',
	'secret',
]);

function usableSecret(value: string | null): string | null {
	if (!value) return null;
	if (PLACEHOLDER_SECRETS.has(value.trim().toLowerCase())) return null;
	if (value.length < HMAC_MIN_BYTES) return null;
	return value;
}

export function readWahaWebhookConfig(source: unknown): WahaWebhookConfig {
	const record = source as Record<string, unknown> | null | undefined;
	const secret = usableSecret(text(record?.WAHA_HMAC_SECRET));
	const flag = record?.WAHA_WEBHOOK_REQUIRE_SIGNATURE ?? '';
	const requireSignature = String(flag) === 'true';
	return { hmacSecret: secret, requireSignature };
}

export function wahaWebhookSignature(request: Request): string | null {
	const header =
		request.headers.get('x-webhook-hmac') ??
		request.headers.get('X-Webhook-Hmac');
	return header && header.trim().length > 0 ? header.trim() : null;
}

// Fail-closed for anything signed: a signature that is present but wrong is
// always rejected (there is no legitimate reason to sign wrongly). Unsigned
// events are accepted unless the operator opts into strict mode.
export async function authenticateWahaWebhook(
	request: Request,
	config: WahaWebhookConfig
): Promise<WahaWebhookAuth> {
	const signature = wahaWebhookSignature(request);
	if (signature) {
		if (!config.hmacSecret) return signedDenied();
		const rawBody = await request.clone().text();
		const ok = await verifyWahaHmac(rawBody, signature, config.hmacSecret);
		return ok
			? { ok: true, reason: 'ok', signatureVerified: true }
			: signedDenied();
	}
	if (config.requireSignature && config.hmacSecret) {
		return { ok: false, reason: 'missing_signature', signatureVerified: false };
	}
	return { ok: true, reason: 'ok', signatureVerified: false };
}

export async function verifyWahaHmac(
	rawBody: string,
	signature: string,
	secret: string
): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(secret),
			{ name: 'HMAC', hash: 'SHA-512' },
			false,
			['sign']
		);
		const mac = await crypto.subtle.sign(
			'HMAC',
			key,
			new TextEncoder().encode(rawBody)
		);
		const expected = toHex(mac);
		return constantTimeEqual(expected, signature.toLowerCase());
	} catch {
		return false;
	}
}

/**
 * Archives the raw body (stage 1), then dispatches the
 * interpreted envelope.
 */
export async function handleWahaWebhook(
	db: Database,
	rawBody: string
): Promise<WahaWebhookOutcome> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return { accepted: false, reason: 'invalid_json', archive: false };
	}
	const routable = routeWahaEvent(parsed);
	if (!routable) {
		return { accepted: false, reason: 'invalid_request', archive: false };
	}
	await archiveWahaEvent(db, routable.event, routable.session, rawBody);
	const envelope = parseWahaEnvelope(parsed);
	if (envelope) {
		try {
			await dispatchWahaEvent(db, envelope);
		} catch {
			// Archived already; never bounce a dispatch failure back to WAHA.
		}
	}
	return { accepted: true, reason: 'ok', archive: true };
}

export type WahaWebhookOutcome =
	| {
			accepted: false;
			reason: 'invalid_json' | 'invalid_request';
			archive: false;
		}
	| { accepted: true; reason: 'ok'; archive: true };

// Returned when a signature was sent but the secret is missing or the
// HMAC does not match. Same literal the inline returns used before.
function signedDenied(): WahaWebhookAuth {
	return { ok: false, reason: 'bad_signature', signatureVerified: false };
}

async function archiveWahaEvent(
	db: Database,
	event: string,
	session: string,
	rawBody: string
): Promise<void> {
	const sql =
		`INSERT INTO ${WEBHOOK_EVENTS_TABLE} ` +
		`(id, eventType, session, payload, receivedAt) VALUES (?, ?, ?, ?, ?)`;
	await db
		.prepare(sql)
		.bind(uid(), event, session, rawBody.slice(0, 65_536), nowISO())
		.run();
}

function toHex(buffer: ArrayBuffer): string {
	const bytes = [...new Uint8Array(buffer)];
	return bytes
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}