import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { WahaSessionSnapshot } from '../../../domain/whatsapp';
import type { WahaEngineWebhook } from '../../../domain/wahaWebhookConfig';
import {
	readWahaWebhookSettings,
	sessionWebhookFor,
	webhookReadiness,
	wahaWebhookNeedsRegistration
} from '../../../domain/wahaWebhookConfig';
import { getDb } from '../../../server/context';
import { requireRole } from '../../../server/authz';
import { json } from '../../../server/http';
import { readWahaConfig, WahaClient, WahaError } from '../../../server/waha';
import { readWahaWebhookConfig } from '../../../server/wahaWebhook';
import { mirrorWahaSessionState } from '../../../server/wahaIngest';
import type { Role } from '../../../domain/crm';

const ADMINS: Role[] = ['admin'];

// WhatsApp session management: status (with QR for pairing), start and stop of
// the engine's `default` session. Admin-only: the QR attaches a WhatsApp
// number and stopping the session takes the whole channel down, so neither is
// reachable by an anonymous caller or a low-privilege session. The mirror
// (`waha_sessions`) keeps a durable last-state fact for the UI.

// The app owns its webhook: when the engine has no session yet, starting it
// here also creates it WITH `config.webhooks` (single registration, no second
// delivery path). Session config is only mutable at creation/update, so the
// hook is attached on this one, idempotent moment instead of per start.
function wahaWebhooksFromEnv(source: unknown): WahaEngineWebhook[] | undefined {
	const settings = readWahaWebhookSettings(source);
	return settings ? [sessionWebhookFor(settings)] : undefined;
}

// Work (status WORKING) is not enough for a message to reach the app: the
// engine must also hold the app's webhook. Replies carry `webhook` readiness
// so the view can flag a session that runs but delivers nothing — the exact
// failure here when `WHATSAPP_HOOK_URL` is absent from the env. Readiness also
// carries whether the receiver will take a delivery at all, because a session
// can be perfectly registered and still be refused on every POST.
function wahaWebhookReadiness(env: unknown, webhooks: WahaEngineWebhook[]) {
	const receiver = readWahaWebhookConfig(env);
	const accepts = receiver.hmacSecret !== null || receiver.allowUnsigned;
	return webhookReadiness(
		readWahaWebhookSettings(env),
		webhooks,
		accepts
	);
}

const WAHA_NOT_CONFIGURED_BODY = {
	configured: false,
	health: null,
	session: null,
	webhook: {
		configured: false,
		registered: false,
		acceptable: false,
		refusal: null
	}
};

export const GET: APIRoute = async (context) => {
	const denied = await requireRole(context, ADMINS);
	if (denied) return denied;
	const db = getDb();
	const config = readWahaConfig(env);
	if (!config) return json(WAHA_NOT_CONFIGURED_BODY, 503);

	const client = new WahaClient(config);
	const health = await client.checkConnection();
	// Auto-heal FAILED sessions on GET so the menu shows a QR without clicking Start
	let session: WahaSessionSnapshot;
	if (health.session?.status === 'FAILED') {
		try {
			const started = await startWithFreshQr(
				client,
				config.session,
				wahaWebhooksFromEnv(env)
			);
			session = await syncWebhook(client, config.session, started);
		} catch (error) {
			session = await sessionWithQr(
				client,
				config.session,
				health.session
			);
		}
	} else {
		session = await sessionWithQr(client, config.session, health.session);
	}
	await mirrorWahaSessionState(db, session.name, session.status);
	return json({
		configured: true,
		health: health.session?.status === 'FAILED' ? await client.checkConnection() : health,
		session,
		webhook: wahaWebhookReadiness(env, session.webhooks ?? [])
	});
};

export const POST: APIRoute = async (context) => {
	const denied = await requireRole(context, ADMINS);
	if (denied) return denied;
	const db = getDb();
	const config = readWahaConfig(env);
	if (!config) return json({ error: 'waha_nao_configurado' }, 503);

	const client = new WahaClient(config);
	try {
		const started = await startWithFreshQr(
			client,
			config.session,
			wahaWebhooksFromEnv(env)
		);
		const session = await syncWebhook(client, config.session, started);
		await mirrorWahaSessionState(db, session.name, session.status);
		return json({
			session,
			webhook: wahaWebhookReadiness(env, session.webhooks ?? [])
		});
	} catch (error) {
		return json({ error: safeWahaError(error) }, 502);
	}
};

// The engine ignores the `webhooks` argument when the session already exists
// (start answers 409 and the app falls back to reading it), so re-opening a
// drifted session never re-registered the delivery path. Only acts when the
// engine REPORTED a webhook that diverges: an update restarts the engine, so
// ambiguous evidence (no webhook echoed) must not trigger one. A session with
// no webhook at all stays the operator's `PUT /api/whatsapp/webhook-config`.
async function syncWebhook(
	client: WahaClient,
	name: string,
	session: WahaSessionSnapshot
): Promise<WahaSessionSnapshot> {
	const settings = readWahaWebhookSettings(env);
	if (!settings) return session;
	const current = session.webhooks ?? [];
	if (current.length === 0) return session;
	if (!wahaWebhookNeedsRegistration(current, settings)) return session;
	const webhook = sessionWebhookFor(settings);
	await client.updateSession(name, [webhook]);
	return { ...session, webhooks: [webhook] };
}

export const DELETE: APIRoute = async (context) => {
	const denied = await requireRole(context, ADMINS);
	if (denied) return denied;
	const db = getDb();
	const config = readWahaConfig(env);
	if (!config) return json({ error: 'waha_nao_configurado' }, 503);

	const client = new WahaClient(config);
	try {
		await client.stopSession(config.session);
		await mirrorWahaSessionState(db, config.session, 'STOPPED');
		return json({ ok: true });
	} catch (error) {
		return json({ error: safeWahaError(error) }, 502);
	}
};

// The NOWEB engine serves the pairing QR at `GET /api/{session}/auth/qr`, not
// inside the session snapshot. When the session asks for a scan we attach the
// QR data URL for the view; any QR failure is swallowed (status still renders).
async function attachQr(
	client: WahaClient,
	session: WahaSessionSnapshot
): Promise<WahaSessionSnapshot> {
	if (session.status !== 'SCAN_QR_CODE') return session;
	const qr = await client.getSessionQr(session.name).catch(() => null);
	return qr ? { ...session, qr } : session;
}

const QR_WAIT_ATTEMPTS = 12;
const QR_WAIT_INTERVAL_MS = 250;
// Wall-clock ceiling for the WHOLE wait, on top of the attempt cap: an attempt
// costs two engine round-trips and each is bounded only by the 15s client
// timeout, while NOWEB's `GET /auth/qr` itself blocks ~10s server-side
// (`SessionManagerCore.waitUntilStatus`) and answers 422 until the session is
// in SCAN_QR_CODE. The attempt cap alone therefore admitted ~12 x (15s + 15s +
// 0.25s) ≈ 6 minutes of hanging for one tap. 5s is ~5x the ~1s a live engine
// takes to reach SCAN_QR_CODE (so the happy path never pays for it) and caps
// the loop in seconds; the in-flight round-trip is left to the client timeout,
// which is the ceiling that aborts an individual call.
const QR_WAIT_BUDGET_MS = 5_000;

// Gates the NEXT attempt only, and never the fallback read after the loop: a
// QR that shows up on the last permitted round-trip must still reach the view.
function budgetExpired(startedAt: number): boolean {
	return Date.now() - startedAt >= QR_WAIT_BUDGET_MS;
}

// NOWEB answers /start while still connecting (STARTING); the QR only exists
// once the engine reaches SCAN_QR_CODE. Wait — bounded by BOTH the attempt cap
// and a wall-clock budget — so a single tap on "Iniciar sessão" returns the QR,
// not an empty STARTING card, and can never hang for minutes.
async function waitForScanQr(
	client: WahaClient,
	snapshot: WahaSessionSnapshot
): Promise<WahaSessionSnapshot> {
	const startedAt = Date.now();
	let current = snapshot;
	const pollable =
		current.status === 'STARTING' || current.status === 'SCAN_QR_CODE';
	for (let i = 0; pollable && i < QR_WAIT_ATTEMPTS; i++) {
		if (budgetExpired(startedAt)) break;
		const withQr = await attachQr(client, current);
		if (withQr.qr) return withQr;
		await sleep(QR_WAIT_INTERVAL_MS);
		current = (await client.getSession(current.name).catch(() => null)) ??
			current;
		if (current.status !== 'STARTING' && current.status !== 'SCAN_QR_CODE') {
			return current;
		}
	}
	return attachQr(client, current);
}

// The engine already auto-started the session (the pairing QR is live); asking
// for another start is refused with 409. Read the running plan instead.
async function startedSession(
	client: WahaClient,
	name: string,
	webhooks?: WahaEngineWebhook[]
): Promise<WahaSessionSnapshot> {
	try {
		return await client.startSession(name, webhooks);
	} catch (error) {
		if (error instanceof WahaError && error.httpStatus !== 409) throw error;
		return (await client.getSession(name).catch(() => null)) ?? {
			name,
			status: 'SCAN_QR_CODE'
		};
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// NOWEB force-stops a session whose QR was never scanned but keeps a "running"
// lock, so a later start bounces off with the session stuck on FAILED. Worse,
// a FAILED session with stored credentials re-tries the dead login on start
// instead of offering a QR. Deleting the engine session (auth included) resets
// it into SCAN_QR_CODE, so start regenerates the pair QR. All calls here are
// best-effort so the start is never failed because of a housekeeping error.
async function startWithFreshQr(
	client: WahaClient,
	name: string,
	webhooks?: WahaEngineWebhook[]
): Promise<WahaSessionSnapshot> {
	const plan = await attemptStart(client, name, true, webhooks);
	if (plan.status !== 'FAILED') return plan;
	await client.deleteSession(name).catch(() => undefined);
	return attemptStart(client, name, false, webhooks);
}

async function attemptStart(
	client: WahaClient,
	name: string,
	resetStuck = true,
	webhooks?: WahaEngineWebhook[]
): Promise<WahaSessionSnapshot> {
	if (resetStuck) await clearStuckSession(client, name);
	const started = await startedSession(client, name, webhooks);
	return waitForScanQr(client, started);
}

async function clearStuckSession(
	client: WahaClient,
	name: string
): Promise<void> {
	const health = await client.checkConnection(name).catch(() => null);
	if (health?.session?.status !== 'FAILED') return;
	await client.deleteSession(name).catch(() => undefined);
}

// The health report only keeps name/status (see `toWahaHealth`); the snapshot
// the UI renders must carry the pairing QR, so refetch the full session.
// Falls back to the health facts when the refetch fails — a QR is a bonus,
// never a reason to 502 a status that already rendered.
async function sessionWithQr(
	client: WahaClient,
	name: string,
	fallback: WahaSessionSnapshot | null
): Promise<WahaSessionSnapshot> {
	if (!fallback) return { name, status: 'STOPPED' };
	let session: WahaSessionSnapshot;
	try {
		session = (await client.getSession(name)) ?? {
			name: fallback.name,
			status: fallback.status
		};
	} catch {
		session = { name: fallback.name, status: fallback.status };
	}
	// Same bounded wait POST uses: NOWEB stays STARTING for a moment before it
	// reaches SCAN_QR_CODE, and a single-shot read returned that STARTING
	// snapshot with no QR — which made "Atualizar" wipe the QR that "Iniciar
	// sessão" had just delivered (its follow-up refresh overwrote it).
	return waitForScanQr(client, session);
}

function safeWahaError(error: unknown): string {
	return error instanceof Error ? error.message.slice(0, 200) : 'waha_unknown';
}