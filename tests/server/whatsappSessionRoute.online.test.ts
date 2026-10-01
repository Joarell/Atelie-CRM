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
import { readWahaConfig } from '../../src/server/waha';
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

  it('the app key is the one the engine accepts', async () => {
    const res = await GET(ctx('GET', 'admin'));
    const body = (await res.json()) as { health: { detail: string | null } | null };
    expect(body.health?.detail ?? null).toBeNull();
  });

  it('a non-admin is refused before the engine is ever contacted', async () => {
    const res = await GET(ctx('GET', 'viewer'));
    expect(res.status).toBe(403);
  });

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
  });
});