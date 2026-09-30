// Pure WhatsApp/WAHA domain logic. No network, no `cloudflare:workers` env, no
// DOM — the transport in `src/server/waha.ts` depends on these shapes, and the
// classification of a connection lives here so it can be unit-tested in
// isolation. Ported (trimmed to single-tenant) from
// DeskcommCRM-RecipeCosting/lib/channels/waha-server.ts.
import type { Contact, Conversation } from "./crm";
import {
	wahaSessionWebhooks,
	type WahaEngineWebhook
} from "./wahaWebhookConfig";

// Clock ceiling for every WAHA call. The reference spec (03-spec-whatsapp-waha)
// prescribes 15s; the point is that the socket that ACCEPTS and never answers
// is the expensive failure mode, so the client must give up on its own.
export const WAHA_DEFAULT_TIMEOUT_MS = 15_000;

// Session name used when the operator does not set WAHA_SESSION_NAME.
export const WAHA_DEFAULT_SESSION = "default";

// Placeholder key shipped in the example env. Treated as "not configured" so a
// fresh clone shows the "start WAHA" state instead of trying a fake credential.
export const WAHA_DEV_PLACEHOLDER_KEY = "dev_plaintext_change_me";

// The only state in which a message can enter or leave. Contract from the CRM
// (uppercase), same as the reference.
export const WAHA_HEALTHY_STATUS = "WORKING";

export const WAHA_SESSION_STATUSES = [
	"STARTING",
	"SCAN_QR_CODE",
	"WORKING",
	"STOPPED",
	"FAILED",
] as const;
export type WahaSessionStatus = (typeof WAHA_SESSION_STATUSES)[number];

// `detail` values surfaced by /api/whatsapp/health. They are stable machine
// codes, not prose — the operator-facing wording stays in the UI/docs.
export const WAHA_DETAIL_NOT_CONFIGURED = "waha_nao_configurado";
export const WAHA_DETAIL_UNREACHABLE = "waha_inacessivel";
export const WAHA_DETAIL_CREDENTIAL_REFUSED =
	"credencial_recusada_pelo_transporte";
export const WAHA_DETAIL_SESSION_NOT_FOUND = "sessao_inexistente";
export const WAHA_DETAIL_SESSION_NOT_WORKING = "sessao_sem_conexao";

export interface WahaServerIdentity {
	version: string | null;
	engine: string | null;
	tier: string | null;
}

export type WahaMultipleSessions = "supported" | "unsupported" | "unknown";
export interface WahaCapabilities extends WahaServerIdentity {
	multipleSessions: WahaMultipleSessions;
}

export interface WahaSessionSnapshot {
	name: string;
	status: string;
	qr?: string;
	webhooks?: WahaEngineWebhook[];
}

export interface WahaSessionSummary {
	name: string;
	status: string;
}

export interface WahaHealth {
	configured: boolean;
	reachable: boolean;
	authenticated: boolean;
	healthy: boolean;
	version: string | null;
	engine: string | null;
	tier: string | null;
	session: WahaSessionSummary | null;
	detail: string | null;
}

export interface WahaHealthInput {
	configured: boolean;
	reachable: boolean;
	authenticated: boolean;
	identity: WahaCapabilities | null;
	session: WahaSessionSnapshot | null;
}

// Measured capability, never a commercial inference: only the exact server
// identity the local QA proved gets "supported"; anything else stays "unknown"
// instead of being blocked by a guessed tier.
export function describeWahaServer(input: unknown): WahaCapabilities {
	const record = asRecord(input);
	const version = asText(record?.version, 100);
	const engine = asText(record?.engine, 100);
	const tier = asText(record?.tier, 100);
	const supported = version === "2026.7.2" && engine === "NOWEB";
	const multipleSessions: WahaMultipleSessions = supported
		? "supported"
		: "unknown";
	return { version, engine, tier, multipleSessions };
}

// A pairing QR is a base64 PNG data URL, far bigger than the 200-char default
// cap applied to names. Bounded, not unlimited, so an odd engine response does
// not drag megabytes into the DOM.
export const WAHA_QR_MAX_LENGTH = 2_000_000;

export function parseWahaSession(input: unknown): WahaSessionSnapshot | null {
	const record = asRecord(input);
	const name = asText(record?.name);
	const status = asText(record?.status);
	if (!name || !status) return null;
	const qr = qrText(record?.qr);
	const webhooks = wahaSessionWebhooks(record);
	const snapshot: WahaSessionSnapshot = { name, status };
	if (qr) snapshot.qr = qr;
	if (webhooks.length > 0) snapshot.webhooks = webhooks;
	return snapshot;
}

function qrText(value: unknown): string | null {
	if (typeof value !== 'string' || value.length === 0) return null;
	if (value.length > WAHA_QR_MAX_LENGTH) return null;
	return value;
}

// The NOWEB engine serves the pairing QR at `GET /api/{session}/auth/qr`;
// with `Accept: application/json` it replies `{ mimetype, data }` where
// `data` is the base64 image. We rebuild a bounded data URL for the `<img>`.
export function wahaQrDataUrl(input: unknown): string | null {
	const record = asRecord(input);
	const mimetype = asText(record?.mimetype, 100);
	const data = qrText(record?.data);
	if (!mimetype || !data) return null;
	return `data:${mimetype};base64,${data}`;
}

// Single source of truth for "is the connection usable, and if not, why".
export function toWahaHealth(input: WahaHealthInput): WahaHealth {
	const healthy =
		input.configured &&
		input.reachable &&
		input.authenticated &&
		input.session?.status === WAHA_HEALTHY_STATUS;
	return {
		configured: input.configured,
		reachable: input.reachable,
		authenticated: input.authenticated,
		healthy,
		version: input.identity?.version ?? null,
		engine: input.identity?.engine ?? null,
		tier: input.identity?.tier ?? null,
		session: input.session
			? { name: input.session.name, status: input.session.status }
			: null,
		detail: healthy ? null : explainUnhealthy(input),
	};
}

function explainUnhealthy(input: WahaHealthInput): string {
	if (!input.configured) return WAHA_DETAIL_NOT_CONFIGURED;
	if (!input.reachable) return WAHA_DETAIL_UNREACHABLE;
	if (!input.authenticated) return WAHA_DETAIL_CREDENTIAL_REFUSED;
	if (!input.session) return WAHA_DETAIL_SESSION_NOT_FOUND;
	return `${WAHA_DETAIL_SESSION_NOT_WORKING}: ${input.session.status}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) return null;
	return value as Record<string, unknown>;
}

function asText(value: unknown, max = 200): string | null {
	if (typeof value !== "string" || value.length === 0) return null;
	if (value.length > max) return null;
	return value;
}

// Targets of the WhatsApp "Enviar mensagem" menu. The dropdown mirrors the
// Contatos list: every contact with a phone is sendable, and a contact that
// already has a WhatsApp conversation is listed once (through it). Pure, so
// the composer behaviour is unit-testable without a DOM.
export interface ComposeTarget {
	value: string;
	contactId: string | null;
	label: string;
}

export function composeTargets(
	contacts: Contact[],
	conversations: Conversation[],
): ComposeTarget[] {
	const wa = conversations.filter((c) => c.channel === "whatsapp");
	const targets: ComposeTarget[] = wa.map((c) => ({
		value: c.id,
		contactId: c.contactId || null,
		label: composeLabel(contacts, c),
	}));
	const linked = new Set(wa.map((c) => c.contactId));
	for (const contact of contacts) {
		if (!contact.phone || linked.has(contact.id)) continue;
		targets.push({
			value: contact.id,
			contactId: contact.id,
			label: `${contact.name} · ${contact.phone}`,
		});
	}
	return targets.sort((a, b) => a.label.localeCompare(b.label));
}

export function whatsappConversationFor(
	contactId: string,
	conversations: Conversation[],
): Conversation | undefined {
	return conversations.find(
		(c) => c.contactId === contactId && c.channel === "whatsapp",
	);
}

function composeLabel(
	contacts: Contact[],
	c: Conversation,
): string {
	const name = contacts.find((x) => x.id === c.contactId)?.name ?? c.contactId;
	return `${name} · ${c.channelPhone || "sem número"}`;
}
