// Pure app-side webhook registration domain: what the app wants the WAHA
// engine to deliver (settings read from env), the engine's per-session
// `config.webhooks` shape (`POST`/`PUT /api/sessions`), and the idempotency
// check that registers exactly once. No network, no `cloudflare:workers` env,
// no DOM — `src/server/waha.ts` and the route layer depend on these shapes.
//
// The ONE rule this module enforces is the reason it exists: a new message
// must reach the receiver a single time. WAHA fires both `message` and
// `message.any` for the same message, so the registered stream is narrowed to
// one message event, and registration compares url + events + hmac with what
// the engine already holds before writing (a duplicate webhook entry would
// double-deliver). Retries are bounded so a receiver hiccup cannot replay the
// same event as a storm.

export const WAHA_WEBHOOK_MESSAGE_EVENT = "message.any";

// The curated event set the app registers. `message.any` covers all message
// creations (inbound and outbound); the rest map one-to-one to the handlers in
// `src/server/wahaDispatch.ts`. No engine-wide "subscribe everything".
export const WAHA_WEBHOOK_DEFAULT_EVENTS = [
	"message.any",
	"message.ack",
	"message.edited",
	"message.revoked",
	"session.status",
] as const;

// Bounded redelivery: a failed attempt retries at most this many times with a
// fixed delay, so a transient receiver error never hammers the endpoint.
export const WAHA_WEBHOOK_RETRIES = {
	policy: "constant",
	delaySeconds: 5,
	attempts: 3,
} as const;

export interface WahaWebhookSettings {
	url: string;
	events: string[];
	hmacKey?: string;
}

export interface WahaEngineWebhook {
	url: string;
	events: string[];
	hmac?: { key: string };
	retries?: {
		policy?: string;
		delaySeconds?: number;
		attempts?: number;
	};
}

// The app's desired webhook from env. `WHATSAPP_HOOK_URL` is mandatory (no URL,
// nothing to register); `WHATSAPP_HOOK_EVENTS` overrides the curated default;
// `WAHA_HMAC_SECRET` is reused as the engine's hmac key — it must be the same
// plaintext the receiver verifies against.
export function readWahaWebhookSettings(
	source: unknown,
): WahaWebhookSettings | null {
	const record = source as Record<string, unknown> | null | undefined;
	const url = text(record?.WHATSAPP_HOOK_URL);
	if (!url) return null;
	const events = parseWahaWebhookEvents(record?.WHATSAPP_HOOK_EVENTS);
	const hmacKey = text(record?.WAHA_HMAC_SECRET);
	return hmacKey
		? { url, events, hmacKey }
		: { url, events };
}

// Normalizes the comma-separated engine-style override: trim, dedupe, enforce
// the single message stream, and fall back to the curated set when empty.
export function parseWahaWebhookEvents(input: unknown): string[] {
	const raw = text(input);
	if (!raw) return [...WAHA_WEBHOOK_DEFAULT_EVENTS];
	const events = raw
		.split(",")
		.map((event) => event.trim())
		.filter(Boolean);
	const deduped = [...new Set(events)];
	return asSingleMessageStream(
		deduped.length > 0 ? deduped : [...WAHA_WEBHOOK_DEFAULT_EVENTS],
	);
}

// `message` and `message.any` both fire for the same message. When both are
// subscribed the receiver is POSTed twice per message; `message.any` covers
// every creation (including our own), so the redundant `message` is dropped.
export function asSingleMessageStream(events: string[]): string[] {
	if (!events.includes("message")) return events;
	if (!events.includes(WAHA_WEBHOOK_MESSAGE_EVENT)) return events;
	return events.filter((event) => event !== "message");
}

// The `config.webhooks[0]` entry the app registers on the engine.
export function sessionWebhookFor(
	settings: WahaWebhookSettings,
): WahaEngineWebhook {
	const webhook: WahaEngineWebhook = {
		url: settings.url,
		events: asSingleMessageStream([...settings.events]),
		retries: WAHA_WEBHOOK_RETRIES,
	};
	if (settings.hmacKey) webhook.hmac = { key: settings.hmacKey };
	return webhook;
}

// Reads the engine's `session.config.webhooks` list back from a `GET
// /api/sessions/{name}` body. Entries without a plain url are skipped.
export function wahaSessionWebhooks(input: unknown): WahaEngineWebhook[] {
	const record = input as { config?: { webhooks?: unknown } };
	const raw = Array.isArray(record?.config?.webhooks)
		? (record.config.webhooks as unknown[])
		: [];
	const out: WahaEngineWebhook[] = [];
	for (const entry of raw) {
		const webhook = parseEngineWebhook(entry);
		if (webhook) out.push(webhook);
	}
	return out;
}

function parseEngineWebhook(input: unknown): WahaEngineWebhook | null {
	const record = asRecord(input);
	const url = text(record?.url);
	if (!url) return null;
	const events = Array.isArray(record?.events)
		? record.events
				.filter((event) => typeof event === "string")
				.map(String)
		: [];
	const webhook: WahaEngineWebhook = { url, events };
	const hmac = asRecord(record?.hmac);
	const key = optionalText(hmac?.key);
	if (key) webhook.hmac = { key };
	const retries = asRecord(record?.retries);
	if (retries) {
		webhook.retries = {
			policy: optionalText(retries.policy),
			delaySeconds: optionalNumber(retries.delaySeconds),
			attempts: optionalNumber(retries.attempts),
		};
	}
	return webhook;
}

// True when the engine holds no webhook for our url, or the one it holds
// differs in events or hmac key — i.e. when a write is needed. Registering
// only when this is true keeps a single delivery path (no duplicate entries).
export function wahaWebhookNeedsRegistration(
	registered: WahaEngineWebhook[],
	settings: WahaWebhookSettings,
): boolean {
	const desired = sessionWebhookFor(settings);
	const existing = registered.find((webhook) => webhook.url === desired.url);
	if (!existing) return true;
	if (!sameEventSet(existing, desired)) return true;
	return (desired.hmac?.key ?? "") !== (existing.hmac?.key ?? "");
}

// Delivery-readiness report surfaced by the session routes and the WhatsApp
// view. Works (status WORKING) is not enough: with no `WHATSAPP_HOOK_URL` there
// is nothing to register and no message reaches the receiver, even from a brand
// new number. `registered` reflects what the engine actually holds, so a
// session created before this env existed stays visibly unregistered.
export interface WahaWebhookReadiness {
	configured: boolean;
	registered: boolean;
}

export function webhookReadiness(
	settings: WahaWebhookSettings | null,
	registered: WahaEngineWebhook[],
): WahaWebhookReadiness {
	if (!settings) return { configured: false, registered: false };
	return {
		configured: true,
		registered: !wahaWebhookNeedsRegistration(registered, settings),
	};
}

function sameEventSet(
	current: WahaEngineWebhook,
	desired: WahaEngineWebhook,
): boolean {
	if (current.events.length !== desired.events.length) return false;
	const left = [...current.events].sort();
	const right = [...desired.events].sort();
	return left.every((event, index) => event === right[index]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) return null;
	return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function optionalText(value: unknown): string | undefined {
	return text(value) ?? undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}