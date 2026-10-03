import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../server/context';
import { json } from '../../../server/http';
import type { WahaWebhookAuth } from '../../../server/wahaWebhook';
import {
	authenticateWahaWebhook,
	handleWahaWebhook,
	readWahaWebhookConfig
} from '../../../server/wahaWebhook';

// WAHA webhook endpoint (POST). Reaches the app over the network from the WAHA
// container, so it is intentionally NOT behind the Bearer session guard: the
// webhook is authenticated by HMAC when the operator sets WAHA_HMAC_SECRET (and
// refused outright when WAHA_WEBHOOK_REQUIRE_SIGNATURE="true" and the header is
// absent). Everything is archived in `webhook_events` before interpretation;
// refusal is 400 (never 5xx — WAHA redelivers what can never pass).
async function respondAuthError(auth: WahaWebhookAuth): Promise<Response> {
	const status = auth.reason === 'secret_required' ? 503 : 401;
	return json(
		{ accepted: false, reason: auth.reason, hmacVerified: false },
		status
	);
}

export const POST: APIRoute = async (context) => {
	const config = readWahaWebhookConfig(env);
	const auth = await authenticateWahaWebhook(context.request, config);
	if (!auth.ok) return respondAuthError(auth);

	const rawBody = await context.request.text();
	const outcome = await handleWahaWebhook(getDb(), rawBody);
	if (!outcome.accepted) {
		return json(
			{
				accepted: false,
				reason: outcome.reason,
				hmacVerified: auth.signatureVerified
			},
			400
		);
	}
	return json({ accepted: true, hmacVerified: auth.signatureVerified });
};