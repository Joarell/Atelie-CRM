import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['tests/setup.ts']
	},
	resolve: {
		alias: {
			// Only vitest's node env resolves `vi.mock('cloudflare:workers')`;
			// the happy-dom env (e2e boot test) needs a real module, so point
			// the virtual specifier at a throwing test double. Server tests
			// keep vi.mock'ing it and are unaffected.
			'cloudflare:workers': fileURLToPath(
				new URL(
					'./tests/helpers/cloudflareWorkers.ts',
					import.meta.url
				)
			)
		}
	},
	server: {
		allowedHosts: ['.trycloudflare.com']
	}
});