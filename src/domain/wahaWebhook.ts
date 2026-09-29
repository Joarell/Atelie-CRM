// Pure WhatsApp/WAHA webhook domain logic: the wire contract (envelope),
// message-id reconciliation and the small deterministic mappings (ack → state,
// chat id → phone, WAHA epoch → ISO). No network, no `cloudflare:workers` env,
// no DOM — `src/server/wahaWebhook.ts` + `src/server/wahaIngest.ts` depend on
// these shapes so the contract can be unit-tested in isolation. Adapted from
// DeskcommCRM-RecipeCosting/lib/waha/{envelope,message-id,ingest}.ts and
// trimmed to the single-tenant scope of this app.

// ── Wire contract ──────────────────────────────────────────────────────

export interface WahaChatKey {
	remoteJidAlt?: string;
	participantAlt?: string;
	remoteJid?: string;
	participant?: string;
}

export interface WahaMediaRef {
	url?: string;
	mimetype?: string;
}

export interface WahaPayloadData {
	notifyName?: string;
	pushName?: string;
	key?: WahaChatKey;
}

// Loose by design: a field only gets a strict type when a consumer reads it
// without its own guard. Over-typing a webhook payload turns "message enters
// the CRM" into a silent discard — the two-stage contract below exists to keep
// the raw event archived even when the strict parse fails.
export interface WahaPayload {
	id?: unknown;
	from?: unknown;
	to?: unknown;
	body?: unknown;
	type?: unknown;
	ack?: unknown;
	timestamp?: unknown;
	fromMe?: unknown;
	hasMedia?: unknown;
	media?: WahaMediaRef | null;
	status?: unknown;
	editedMessageId?: unknown;
	revokedMessageId?: unknown;
	_data?: WahaPayloadData | null;
}

export interface WahaEnvelope {
	event: string;
	session?: string;
	payload?: WahaPayload;
}

// IGNORED chat suffixes (server-side `ignore` config covers most of the waste;
// this is the second, local layer).
export const WAHA_IGNORED_CHAT_PATTERNS = [
	"@g.us", // groups
	"@broadcast", // status broadcast
	"@newsletter", // channel / newsletter
	"status@", // own status
] as const;

// Stage 1 of the contract: the minimal routing facts (event + session + a raw
// id) needed to archive the event before anything stricter runs. Returns null
// only for shapes that are not a webhook at all.
export function routeWahaEvent(
	input: unknown,
): { event: string; session: string; id: unknown } | null {
	const record = asRecord(input);
	const event = asText(record?.event);
	if (!event) return null;
	const session = asText(record?.session) ?? "";
	const payload = asRecord(record?.payload);
	return { event, session, id: payload?.id };
}

// Stage 2: the interpreted envelope. Returns null when the body is outside the
// contract so callers can refuse (400) instead of silently skipping it.
export function parseWahaEnvelope(input: unknown): WahaEnvelope | null {
	const record = asRecord(input);
	const event = asText(record?.event);
	if (!event) return null;
	const session = asText(record?.session) ?? undefined;
	const payload = parseWahaPayload(record?.payload);
	return payload ? { event, session, payload } : { event, session };
}

const WAHA_SCALAR_KEYS = [
	"id",
	"from",
	"to",
	"body",
	"type",
	"ack",
	"timestamp",
	"fromMe",
	"hasMedia",
	"status",
	"editedMessageId",
	"revokedMessageId",
] as const;

function parseWahaPayload(input: unknown): WahaPayload | null {
	const record = asRecord(input);
	if (!record) return null;
	const payload: WahaPayload = {};
	for (const key of WAHA_SCALAR_KEYS) copyIfDefined(record, payload, key);
	if (isRecord(record.media)) payload.media = parseWahaMedia(record.media);
	if (isRecord(record._data)) {
		const data = parseWahaData(record._data);
		if (
			data.notifyName !== undefined ||
			data.pushName !== undefined ||
			data.key !== undefined
		) {
			payload._data = data;
		}
	}
	return payload;
}

function copyIfDefined(
	record: Record<string, unknown>,
	target: WahaPayload,
	key: keyof WahaPayload,
): void {
	if (record[key] !== undefined) target[key] = record[key];
}

function parseWahaMedia(record: Record<string, unknown>): WahaMediaRef {
	return {
		url: optionalText(record.url),
		mimetype: optionalText(record.mimetype),
	};
}

function parseWahaData(record: Record<string, unknown>): WahaPayloadData {
	const data: WahaPayloadData = {};
	if (record.notifyName !== undefined || record.pushName !== undefined) {
		data.notifyName = optionalText(record.notifyName);
		data.pushName = optionalText(record.pushName);
	}
	if (isRecord(record.key)) data.key = parseWahaKey(record.key);
	return data;
}

function parseWahaKey(record: Record<string, unknown>): WahaChatKey {
	// NOWEB names the peer jid `remoteJidAlt` (individual @lid chats) and
	// `participant` (group members); the `*Alt` spellings are legacy. Read
	// both so a current or older engine payload resolves the phone the same.
	return {
		remoteJidAlt: optionalText(record.remoteJidAlt),
		participantAlt: optionalText(record.participantAlt),
		remoteJid: optionalText(record.remoteJid),
		participant: optionalText(record.participant)
	};
}

// ── Message ids ────────────────────────────────────────────────────────

// WAHA send responses and webhooks carry the id in different shapes. NOWEB
// stores the BARE id (e.g. `3A30B5E2A7B9E6C1D4F`); WEBJS and some responses
// send the full `{fromMe}_{chatId}_{bareId}`. This helper reconciles them:
//   - string plain ("3A30…" or "true_5511@c.us_3A30…")
//   - WAMessageKey: { id: { _serialized | id } }
//   - NOWEB responses: { key: { id } }
export function parseWahaMessageId(input: unknown): string | null {
	if (input !== null && typeof input === "object") {
		const record = input as { id?: unknown; key?: { id?: unknown } };
		if (typeof record.id === "string") return bareWaMessageId(record.id);
		if (record.id !== null && typeof record.id === "object") {
			const nested = record.id as { _serialized?: unknown; id?: unknown };
			const serialized = optionalText(nested._serialized);
			if (serialized) return bareWaMessageId(serialized);
			const inner = optionalText(nested.id);
			if (inner) return bareWaMessageId(inner);
		}
		if (record.key !== null && typeof record.key === "object") {
			const innerKey = optionalText(record.key.id);
			if (innerKey) return bareWaMessageId(innerKey);
		}
		return null;
	}
	const value = asText(input);
	if (!value) return null;
	const bare = bareWaMessageId(value);
	return bare.length > 0 ? bare : null;
}

export function bareWaMessageId(full: string): string {
	// `true_5511999999999@c.us_BARE` / `false_..._BARE` — the remote JID never
	// contains `_`, so stripping the first two segments is safe and linear.
	const first = full.indexOf("_");
	if (first === -1) return full;
	const second = full.indexOf("_", first + 1);
	if (second === -1) return full.split("_")[1] ?? full;
	return full.slice(second + 1);
}

// The set of stored `externalId` forms that a given (full or bare) id may
// match. Used by ack/edited/revoked (dedup) and by the outbound echo cleanup.
export function wahaEchoExternalIds(
	externalId: string,
	recipient: string | null | undefined,
): string[] {
	const candidates = [bareWaMessageId(externalId)];
	if (externalId !== candidates[0]) candidates.unshift(externalId);
	if (recipient) {
		const full = `false_${recipient}_${candidates[0]}`;
		if (!candidates.includes(full)) candidates.push(full);
	}
	return candidates;
}

// ── Chat / phone ───────────────────────────────────────────────────────

// The chat id (e.g. `5511999999999@c.us`). This is purely the digits: the CRM
// never stores the WAHA-format suffix, and `@c.us` is reconstructed on send.
export function parseWahaChatId(chatId: unknown): string | null {
	const value = asText(chatId);
	if (!value) return null;
	const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
	return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function digitsFromJid(jid: unknown): string | null {
	const value = asText(jid);
	if (!value) return null;
	const digits = value.replace(/@.*$/, "").replace(/\D/g, "");
	return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function chatIdForPhone(phoneDigits: string): string {
	return `${phoneDigits}@c.us`;
}

// The engine only routes full international jids (`55` + DDD + subscriber).
// Stored CRM phones may be national (no country code), so the send boundary
// rebuilds the country code here: BR national 10/11-digit numbers get `55`
// back, anything already international (or a foreign E.164) passes through.
export function wahaE164Phone(phone: unknown): string | null {
	const digits = asText(phone)?.replace(/\D/g, "") ?? "";
	if (!digits) return null;
	return digits.length === 10 || digits.length === 11
		? `55${digits}`
		: digits;
}

export function isIgnoredChat(chatId: unknown): boolean {
	const value = asText(chatId);
	if (!value) return true;
	return WAHA_IGNORED_CHAT_PATTERNS.some((pattern) => value.includes(pattern));
}

// ── Delivery state ─────────────────────────────────────────────────────

export type WahaDeliveryStatus = "sent" | "delivered" | "read";

// WAHA ack values: 0/1 = sent to WhatsApp, 2 = delivered, 3 = read. The CRM's
// `messages.waStatus` column uses these words so the inbox renders ticks.
export function ackToWahaStatus(ack: number): WahaDeliveryStatus {
	if (ack >= 3) return "read";
	if (ack >= 2) return "delivered";
	return "sent";
}

export function waTimestampToISO(timestamp: unknown): string {
	// WAHA only sends epoch seconds (>= 1e9); 0 is the sentinel for
	// "no timestamp" and must fall back to now, never to the Unix epoch.
	const seconds = asFiniteNumber(timestamp);
	if (seconds === null || seconds <= 0) return "";
	const ms = Number.isSafeInteger(seconds) ? seconds * 1000 : seconds;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function waNotifyName(payload: WahaPayload): string | null {
	const name = payload._data?.notifyName ?? payload._data?.pushName;
	return name && name.trim().length > 0 ? name.trim() : null;
}

// The phone WhatsApp sends alongside an @lid chat (the CRM's correlation key
// for contacts that have no plain number). The peer jid is under `_data.key`
// — NOWEB uses `remoteJidAlt` for individual chats and `participant` for
// group members; the `*Alt` legacy names are tried first, then the plain ones.
export function phoneFromWahaKey(payload: WahaPayload): string | null {
	const key = payload._data?.key;
	const peer =
		key?.remoteJidAlt ?? key?.participantAlt ??
		key?.remoteJid ?? key?.participant;
	return digitsFromJid(peer);
}

// Peers now arrive as `@lid` ids (WhatsApp assigns every user a LID). The lid
// is a routing id, not a phone number, and it cannot be used as a send target.
export function isWahaLidChat(chatId: unknown): boolean {
	return (asText(chatId)?.endsWith('@lid') ?? false);
}

// The peer phone for a chat id — the CRM's correlation key for the contact.
// `@lid` ids resolve through `_data.key` FIRST, otherwise the lid digits
// would be stored as the phone; every other chat keeps the old order.
export function wahaPeerPhone(
	chatId: unknown, payload: WahaPayload
): string | null {
	if (isWahaLidChat(chatId)) {
		return phoneFromWahaKey(payload) ?? parseWahaChatId(chatId);
	}
	return parseWahaChatId(chatId) ?? phoneFromWahaKey(payload);
}

const WAHA_EVENT_ACK = "message.ack";
const WAHA_EVENT_EDITED = "message.edited";
const WAHA_EVENT_REVOKED = "message.revoked";
const WAHA_EVENT_MESSAGE = "message.any";
export const WAHA_EVENT_SESSION_STATUS = "session.status";

export function isWahaMessageEvent(event: string): boolean {
	return event === WAHA_EVENT_MESSAGE || event === "message";
}

export function isWahaAckEvent(event: string): boolean {
	return event === WAHA_EVENT_ACK;
}

export function isWahaEditedEvent(event: string): boolean {
	return event === WAHA_EVENT_EDITED;
}

export function isWahaRevokedEvent(event: string): boolean {
	return event === WAHA_EVENT_REVOKED;
}

export function isWahaSessionEvent(event: string): boolean {
	return event === WAHA_EVENT_SESSION_STATUS || event === "state.change";
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) return null;
	return value as Record<string, unknown>;
}

function asText(value: unknown, max = 2000): string | null {
	if (typeof value !== "string" || value.length === 0) return null;
	if (value.length > max) return null;
	return value;
}

function optionalText(value: unknown, max = 2000): string | undefined {
	if (value === undefined || value === null) return undefined;
	const text = asText(value, max);
	return text ?? undefined;
}

function asFiniteNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
