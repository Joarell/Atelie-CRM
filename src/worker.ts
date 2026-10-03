import { astro, FetchState } from 'astro/fetch';
import { cf, finalize } from '@astrojs/cloudflare/fetch';
import { runRetention } from './server/retentionCron';
import { runBootAssertion } from './server/boot';
import { getDb } from './server/context';
import { json } from './server/http';

// Custom Worker entrypoint. The adapter's default entrypoint
// (`@astrojs/cloudflare/entrypoints/server`) cannot export a `scheduled`
// handler, and LGPD retention needs one. The `cf`/`finalize` companions
// reproduce what the default handler did — bindings, Astro.locals, static
// assets, cache headers — so this file REPLACES the default entrypoint rather
// than wrapping it. Do not point `main` at both.
// See the Astro Cloudflare adapter docs, "Using advanced routing".
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const state = new FetchState(request);
		const asset = await cf(state, env, ctx);
		if (asset) return asset;

		const boot = await runBootAssertion(getDb());
		if (!boot.ok) {
			return json(
				{ accepted: false, reason: 'boot_failed', detail: boot.error },
				503
			);
		}

		return finalize(state, await astro(state));
	},

	// LGPD retention, daily at 03:00 UTC (off-peak). The windows come from the
	// RETENTION_* vars, so a deployment can tighten them without a redeploy.
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		await runRetention(env.DB, env);
	}
};
