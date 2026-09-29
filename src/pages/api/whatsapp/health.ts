import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { toWahaHealth } from '../../../domain/whatsapp';
import { getDb } from '../../../server/context';
import { userFromToken } from '../../../server/auth';
import { readWahaConfig, WahaClient } from '../../../server/waha';
import { json } from '../../../server/http';

// Connection test for the WhatsApp/WAHA engine. Auth-guarded like the rest of
// the CRM: the integration status is not public. The body is a pure health
// report (`src/domain/whatsapp.ts`), so the caller gets a stable `detail` code
// instead of prose. 200 = WORKING, 502 = configured but not usable,
// 503 = not configured at all.
export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'sessao_invalida' }, 401);

	const config = readWahaConfig(env);
	if (!config) {
		const health = toWahaHealth({
			configured: false,
			reachable: false,
			authenticated: false,
			identity: null,
			session: null
		});
		return json(health, 503);
	}
	const health = await new WahaClient(config).checkConnection();
	return json(health, health.healthy ? 200 : 502);
};
