import type { Database } from './db';
import { uid, nowISO } from '../domain/format';
import {
	parseWahaEnvelope,
	routeWahaEvent
} from '../domain/wahaWebhook';
import { usableWahaHmacSecret } from '../domain/wahaWebhookConfig';
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
	allowUnsigned: boolean;
}

export interface WahaWebhookAuth {
	ok: boolean;
	reason:
		| 'missing_signature'
		| 'bad_signature'
		| 'ok'
		| 'secret_required';
	signatureVerified: boolean;
}

// The secret's validity rule (minimum strength, placeholder rejection) lives in
// the domain module because BOTH readers of `WAHA_HMAC_SECRET` must agree on
// it: this receiver, and `readWahaWebhookSettings`, which tells the engine
// which key to sign with. Disagreement here means the app registers a key it
// then refuses, and every delivery 503s forever. A refused secret leaves
// verification OFF (fail-closed, never fail-open).
export function readWahaWebhookConfig(source: unknown): WahaWebhookConfig {
	const record = source as Record<string, unknown> | null | undefined;
	const secret = usableWahaHmacSecret(record?.WAHA_HMAC_SECRET);
	const requireSignature = flag(record?.WAHA_WEBHOOK_REQUIRE_SIGNATURE);
	const allowUnsigned = flag(record?.WAHA_WEBHOOK_ALLOW_UNSIGNED);
	return { hmacSecret: secret, requireSignature, allowUnsigned };
}

function flag(value: unknown): boolean {
	return String(value ?? '') === 'true';
}

export function wahaWebhookSignature(request: Request): string | null {
	const header =
		request.headers.get('x-webhook-hmac') ??
		request.headers.get('X-Webhook-Hmac');
	return header && header.trim().length > 0 ? header.trim() : null;
}

// Fail-closed. A signature that is present but wrong is always rejected, and
// an unsigned event is refused unless the operator opted out explicitly:
//   - usable secret present -> verify; absent signature is 401, wrong is 401
//   - no usable secret      -> `secret_required`, so the route answers 503
//     (a misconfiguration, not a bad signature) unless `allowUnsigned` is set
// The no-secret answer is the same whether or not a signature was sent: with no
// key loaded the receiver cannot judge any signature, so reporting a PRESENT
// one as `bad_signature` blamed the sender for the app's own missing env.
export async function authenticateWahaWebhook(
	request: Request,
	config: WahaWebhookConfig
): Promise<WahaWebhookAuth> {
	const signature = wahaWebhookSignature(request);
	if (signature) return verifySigned(request, signature, config);
	if (!config.hmacSecret && !config.allowUnsigned) {
		return { ok: false, reason: 'secret_required', signatureVerified: false };
	}
	if (config.requireSignature) return missingSignature();
	return { ok: true, reason: 'ok', signatureVerified: false };
}

async function verifySigned(
	request: Request,
	signature: string,
	config: WahaWebhookConfig
): Promise<WahaWebhookAuth> {
	if (!config.hmacSecret) return secretRequired();
	const rawBody = await request.clone().text();
	const ok = await verifyWahaHmac(rawBody, signature, config.hmacSecret);
	return ok
		? { ok: true, reason: 'ok', signatureVerified: true }
		: signedDenied();
}

function missingSignature(): WahaWebhookAuth {
	return { ok: false, reason: 'missing_signature', signatureVerified: false };
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

// Returned when there is no usable secret to verify against, so the app
// answers 503 (`secret_required`) instead of accusing the sender of a bad
// signature it never had the key to check.
function secretRequired(): WahaWebhookAuth {
	return { ok: false, reason: 'secret_required', signatureVerified: false };
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