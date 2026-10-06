// ONLINE tier for the /api/whatsapp/session ROUTE (not just the client).
//
// The offline suite in whatsappSessionRoute.test.ts stubs `fetch`, so it proves
// the route's shape but never that the real engine accepts our key. This tier
// closes that gap: it drives the real handlers against a REAL, RUNNING WAHA
// engine using the app's OWN config (`.dev.vars`), through the real transport.
//
// It is what caught the drift where the engine rotated its key and the app kept
// sending the old one: every call answered 401 `credencial_recusada_
// pelo_transporte`, so a logged-in admin could neither start the session nor
// read the QR — while scripts/waha-smoke.ts still reported healthy because it
// carried its own fallback key.
//
// Gated by configuration: with no WAHA configured (offline dev, CI without
// secrets) the whole file skips, so the deterministic battery stays GREEN.
//
//   npm run waha:online
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { APIContext } from 'astro';
import { readWahaConfig, WahaClient } from '../../src/server/waha';
import {
  readWahaWebhookSettings,
  wahaWebhookNeedsRegistration
} from '../../src/domain/wahaWebhookConfig';
import { FakeD1 } from '../helpers/fakeD1';

function dotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const appEnv = { ...dotEnv('.dev.vars'), ...process.env };
const configured = readWahaConfig(appEnv);
const skip = () => !configured;

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));

vi.mock('cloudflare:workers', () => ({
  env: {
    get DB() {
      return state.db;
    },
    get WAHA_API_BASE_URL() {
      return process.env.WAHA_API_BASE_URL ?? dotEnv('.dev.vars').WAHA_API_BASE_URL;
    },
    get WAHA_API_KEY() {
      return process.env.WAHA_API_KEY ?? dotEnv('.dev.vars').WAHA_API_KEY;
    },
    get WAHA_SESSION_NAME() {
      return process.env.WAHA_SESSION_NAME ?? dotEnv('.dev.vars').WAHA_SESSION_NAME;
    },
    get WHATSAPP_HOOK_URL() {
      return dotEnv('.dev.vars').WHATSAPP_HOOK_URL;
    },
    get WAHA_HMAC_SECRET() {
      return dotEnv('.dev.vars').WAHA_HMAC_SECRET;
    }
  }
}));

import { GET, POST } from '../../src/pages/api/whatsapp/session';

function ctx(method: string, role: string): APIContext {
  const locals = { user: { id: 'u1', name: 'Admin', role } };
  return {
    request: new Request('http://localhost/api/whatsapp/session', { method }),
    locals
  } as unknown as APIContext;
}

describe.skipIf(skip())('WAHA session route online tier', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  it('a logged-in admin reads the real session state', async () => {
    const res = await GET(ctx('GET', 'admin'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      configured: boolean;
      session: { name: string; status: string; qr?: string } | null;
    };
    expect(body.configured).toBe(true);
    expect(body.session).not.toBeNull();
    expect(body.session?.name).toBe(configured?.session);
  });

  // Asserts key acceptance only. `health.healthy` and a null `detail` also
  // require a paired, WORKING session, which made this fail red on a freshly
  // installed engine whose session still reads SCAN_QR_CODE — an environment
  // state, not a key problem.
  it('the app key is the one the engine accepts', async () => {
    const res = await GET(ctx('GET', 'admin'));
    const body = (await res.json()) as {
      health: { reachable: boolean; authenticated: boolean } | null;
    };
    expect(body.health?.reachable).toBe(true);
    expect(body.health?.authenticated).toBe(true);
  });

  it('a non-admin is refused before the engine is ever contacted', async () => {
    const res = await GET(ctx('GET', 'viewer'));
    expect(res.status).toBe(403);
  });

  // These two POSTs need a live-engine budget, not the 5000ms default: each
  // restarts the real container and polls waitForScanQr (12 x 250ms) while
  // syncWebhook repairs the ingress. Do not "restore" the default — the drift
  // test below measures ~4065ms solo and overflows it under suite load.
  it('an admin can start the session, and a QR arrives when one is offered', async () => {
    const res = await POST(ctx('POST', 'admin'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { name: string; status: string; qr?: string };
    };
    expect(body.session.name).toBe(configured?.session);
    // A paired session legitimately has no QR; an unpaired one must carry a
    // data-URI image, otherwise the view has nothing to render.
    if (body.session.status === 'SCAN_QR_CODE') {
      expect(body.session.qr).toMatch(/^data:image\/png;base64,/);
    }
  }, 30000);
});
// Regression guard for the ingress banner: the engine ignores the `webhooks`
// argument when the session already exists, so a session whose registration
// drifted (rotated hmac, edited env) used to stay unregistered forever — every
// inbound message failed HMAC verification and was dropped. Re-opening the
// session must now heal it.
describe.skipIf(skip())('WAHA webhook drift self-heals', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  it('POST re-registers when the engine holds a stale hmac', async () => {
    const settings = readWahaWebhookSettings(appEnv);
    if (!settings || !configured) return;
    const client = new WahaClient(configured);

    await client.updateSession(configured.session, [
      { url: settings.url, events: settings.events, hmac: { key: 'stale-hmac' } }
    ]);
    const drifted = await client.getSession(configured.session);
    expect(wahaWebhookNeedsRegistration(drifted?.webhooks ?? [], settings)).toBe(true);

    const res = await POST(ctx('POST', 'admin'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhook: { registered: boolean } };
    expect(body.webhook.registered).toBe(true);

    const healed = await client.getSession(configured.session);
    expect(wahaWebhookNeedsRegistration(healed?.webhooks ?? [], settings)).toBe(false);
  }, 30000);
});
