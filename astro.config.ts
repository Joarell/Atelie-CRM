import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

// Server output on the Cloudflare Workers adapter: /src/pages/api/* routes
// become Worker functions with access to the D1 binding declared in
// wrangler.toml (see src/server/context.ts). The underlying Cloudflare Vite
// plugin reads wrangler.toml and exposes the `DB` binding in `astro dev` too
// (via workerd + Miniflare).
//
// The whole UI (CRM shell + Ateliê ERP SPA) is framework-free: it mounts into
// `#app` from src/main.ts as a vanilla-DOM app and shares one Tailwind v4
// design system compiled by @tailwindcss/vite. No islands, no React.
//
// WAHA is NOT booted here: the WhatsApp engine runs where it is deployed
// (podman sidecar or a remote host) and the seam reaches it exclusively
// through the WAHA_* environment variables read by `readWahaConfig` in
// src/server/waha.ts — no local compose, no wrangler.toml changes.
export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	// Dev bind: 0.0.0.0 (todas as interfaces) para o container do WAHA entregar
	// webhooks em `host.containers.internal` (pasta encaminha pro loopback IPv4
	// do host, 127.0.0.1). `astro dev` por padrão liga só em [::1] e o engine
	// responde ECONNREFUSED.
	server: {
		host: "0.0.0.0",
		allowedHosts: ["host.containers.internal", ".trycloudflare.com"],
	},
	vite: {
		plugins: [tailwindcss()],
	},
});