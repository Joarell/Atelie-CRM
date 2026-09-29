// EGRESS tier for the WAHA engine (WhatsApp).
//
// The app runs on Cloudflare Workers (`output: 'server'` + the Workers
// adapter, see astro.config.ts) and the WAHA engine lives on a SEPARATE
// server (podman sidecar / remote host). The only operational risk left is
// EGRESS: can the Worker reach that host out of outbound HTTPS? This tier
// proves the exact runtime path — the REAL configured base URL resolved by
// readWahaConfig and the REAL transport (WahaClient over real `fetch`, no
// fakes/probes/spawn). It is gated by configuration, so when WAHA is not
// configured (offline dev, CI without secrets) the whole file skips cleanly
// and the deterministic offline battery stays GREEN.
//
//   npm run waha:egress
//
// The live smoke equivalent (scripts/waha-smoke.ts) enforces the same health
// semantics: reachable + authenticated = pass; anything else = fail.
import { describe, it, expect } from 'vitest';
import { readWahaConfig, WahaClient } from '../../src/server/waha';
import { WAHA_DEFAULT_SESSION } from '../../src/domain/whatsapp';

const source = {
  WAHA_API_BASE_URL: process.env.WAHA_API_BASE_URL,
  WAHA_API_KEY: process.env.WAHA_API_KEY,
  WAHA_SESSION_NAME: process.env.WAHA_SESSION_NAME
};

const configured = readWahaConfig(source);
const isOffline = () => !configured;

describe.skipIf(isOffline())('WAHA egress tier', () => {
  if (!configured) return;
  const client = new WahaClient(configured);

  it('egress path to the configured engine host is reachable and authenticated', async () => {
    const health = await client.checkConnection();
    expect(health.reachable).toBe(true);
    expect(health.authenticated).toBe(true);
  });

  it('uses the exact runtime base URL (the host the Worker egresses to)', async () => {
    // Unreachable when the config gate skips this file, but TS needs the guard.
    if (!configured) return;
    const expectedBase = (process.env.WAHA_API_BASE_URL ?? '').replace(/\/+$/, '');
    const expectedSession = process.env.WAHA_SESSION_NAME ?? WAHA_DEFAULT_SESSION;
    expect(configured.baseUrl).toBe(expectedBase);
    expect(configured.session).toBe(expectedSession);
  });
});
