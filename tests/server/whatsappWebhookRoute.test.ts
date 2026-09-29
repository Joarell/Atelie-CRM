import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { POST } from '../../src/pages/api/whatsapp/webhook';
import { FakeD1 } from '../helpers/fakeD1';

const state = vi.hoisted(() => ({
  db: null as unknown as FakeD1,
  hmacSecret: 's3cret' as string | undefined,
  requireSignature: 'true' as string | undefined
}));

vi.mock('cloudflare:workers', () => ({
  env: {
    get DB() {
      return state.db;
    },
    get WAHA_HMAC_SECRET() {
      return state.hmacSecret;
    },
    get WAHA_WEBHOOK_REQUIRE_SIGNATURE() {
      return state.requireSignature;
    }
  }
}));

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BODY = JSON.stringify({
  event: 'message.any',
  session: 'default',
  payload: { id: 'true_5511999999999@c.us_ABC', from: '5511999999999@c.us', body: 'oi', fromMe: false }
});

function context(body: string, signature?: string): APIContext {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-webhook-hmac', signature);
  return { request: new Request('http://localhost/api/whatsapp/webhook', { method: 'POST', headers, body }) } as unknown as APIContext;
}

describe('/api/whatsapp/webhook', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
    state.hmacSecret = 's3cret';
    state.requireSignature = 'true';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is open when no secret is configured (local/dev mirrors)', async () => {
    state.hmacSecret = undefined;
    state.requireSignature = undefined;
    const response = await POST(context(BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, hmacVerified: false });
    expect(state.db.rows('webhook_events')).toHaveLength(1);
    expect(state.db.rows('messages')).toHaveLength(1);
  });

  it('rejects unsigned events in strict mode with 401', async () => {
    const response = await POST(context(BODY));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ accepted: false, reason: 'missing_signature' });
    expect(state.db.rows('webhook_events')).toHaveLength(0);
  });

  it('accepts a valid signature and ingests the message', async () => {
    const signature = await sign(BODY, 's3cret');
    const response = await POST(context(BODY, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, hmacVerified: true });
    expect(state.db.rows('webhook_events')).toHaveLength(1);
    expect(state.db.rows('messages')).toHaveLength(1);
  });

  it('rejects a bad signature with 401, refusing before any archiving', async () => {
    const response = await POST(context(BODY, 'deadbeef'));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ accepted: false, reason: 'bad_signature' });
    expect(state.db.rows('webhook_events')).toHaveLength(0);
  });

  it('returns 400 (never 5xx) for a signed but invalid body', async () => {
    const badBody = '{nope';
    const signature = await sign(badBody, 's3cret');
    const response = await POST(context(badBody, signature));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ accepted: false, reason: 'invalid_json' });
  });
});