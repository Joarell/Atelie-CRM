import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { WahaEngineWebhook } from '../../../domain/wahaWebhookConfig';
import {
	readWahaWebhookSettings,
	sessionWebhookFor,
	wahaWebhookNeedsRegistration
} from '../../../domain/wahaWebhookConfig';
import { userFromToken } from '../../../server/auth';
import { getDb } from '../../../server/context';
import { json } from '../../../server/http';
import {
	readWahaConfig,
	WahaClient,
	type WahaConfig
} from '../../../server/waha';

// Webhook registration surface for the WAHA engine. Auth-guarded like health:
// the integration status is operator-only, unlike the public POST receiver.
// `WHATSAPP_HOOK_URL` (app env) is the ONE delivery path the app owns; GET
// reports whether it is registered on the engine, PUT registers or re-syncs it
// — idempotently (checking url + events + hmac first), so each new message
// arrives exactly once instead of once per webhook entry.

export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'sessao_invalida' }, 401);
	const config = readWahaConfig(env);
	if (!config) return json({ error: 'waha_nao_configurado' }, 503);
	return json(await webhookReport(config));
};

interface WebhookReport {
	configured: boolean;
	url: string | null;
	events: string[];
	registered: boolean;
}

async function webhookReport(config: WahaConfig): Promise<WebhookReport> {
	const settings = readWahaWebhookSettings(env);
	if (!settings) {
		return { configured: false, url: null, events: [], registered: false };
	}
	const registered = !wahaWebhookNeedsRegistration(
		await currentWebhooks(config),
		settings
	);
	return {
		configured: true,
		url: settings.url,
		events: settings.events,
		registered
	};
}

export const PUT: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'sessao_invalida' }, 401);
	const config = readWahaConfig(env);
	if (!config) return json({ error: 'waha_nao_configurado' }, 503);
	const settings = readWahaWebhookSettings(env);
	if (!settings) return json({ error: 'webhook_nao_configurado' }, 400);

	try {
		const webhook = sessionWebhookFor(settings);
		const already = !wahaWebhookNeedsRegistration(
			await currentWebhooks(config),
			settings
		);
		if (already) return json({ ok: true, registered: true, updated: false });
		await new WahaClient(config).updateSession(config.session, [webhook]);
		return json({ ok: true, registered: true, updated: true });
	} catch (error) {
		return json({ error: safeWahaError(error) }, 502);
	}
};

// The engine's current webhooks for the configured session. An unreachable
// engine reads as a mismatch (registered: false) rather than a lie.
async function currentWebhooks(
	config: WahaConfig
): Promise<WahaEngineWebhook[]> {
	const session = await new WahaClient(config)
		.getSession(config.session)
		.catch(() => null);
	return session?.webhooks ?? [];
}

function safeWahaError(error: unknown): string {
	return error instanceof Error ? error.message.slice(0, 200) : 'waha_unknown';
}