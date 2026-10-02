import { describe, it, expect, beforeEach } from 'vitest';
import {
  authenticateWahaWebhook,
  handleWahaWebhook,
  readWahaWebhookConfig,
  verifyWahaHmac
} from '../../src/server/wahaWebhook';
import { FakeD1 } from '../helpers/fakeD1';

function request(body: string, signature?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-webhook-hmac', signature);
  return new Request('http://localhost/api/whatsapp/webhook', { method: 'POST', headers, body });
}

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

// 64 bytes hex: `readWahaWebhookConfig` recusa segredo curto, entao um literal
// tipo SECRET nao serve mais como fixture de "segredo valido".
const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

const BODY = JSON.stringify({
  event: 'message.any',
  session: 'default',
  payload: { id: 'true_5511999999999@c.us_ABC', from: '5511999999999@c.us', body: 'oi', fromMe: false }
});

describe('readWahaWebhookConfig refuses weak secrets', () => {
  it('rejects the documented placeholder as if it were empty', () => {
    // O valor que o proprio .dev.vars.example mandava preencher passava quando
    // o unico criterio era "text()": a assinatura HMAC ficava sem forca real.
    expect(
      readWahaWebhookConfig({
        WAHA_HMAC_SECRET: 'gere-um-segredo-por-ambiente-openssl-rand-hex-32'
      })
    ).toEqual({ hmacSecret: null, requireSignature: false });
  });

  it('rejects a short secret (< 32 bytes)', () => {
    expect(readWahaWebhookConfig({ WAHA_HMAC_SECRET: 's3cret' }))
      .toEqual({ hmacSecret: null, requireSignature: false });
  });

  it('rejects common placeholders regardless of case/padding', () => {
    for (const bad of ['change-me', 'CHANGE-ME', ' secret ', 'INVALID_CHANGE_ME']) {
      expect(readWahaWebhookConfig({ WAHA_HMAC_SECRET: bad }).hmacSecret)
        .toBeNull();
    }
  });

  it('fails closed: a signed event cannot pass without a usable secret', async () => {
    const signature = await sign(BODY, SECRET);
    const ok = await authenticateWahaWebhook(
      request(BODY, signature),
      { hmacSecret: null, requireSignature: false }
    );
    expect(ok.ok).toBe(false);
    expect(ok.signatureVerified).toBe(false);
  });
});

describe('readWahaWebhookConfig / authenticateWahaWebhook', () => {
  it('reads the secret and strict mode off by default', () => {
    expect(readWahaWebhookConfig({})).toEqual({ hmacSecret: null, requireSignature: false });
    expect(readWahaWebhookConfig({ WAHA_HMAC_SECRET: SECRET })).toEqual({ hmacSecret: SECRET, requireSignature: false });
    expect(readWahaWebhookConfig({ WAHA_HMAC_SECRET: SECRET, WAHA_WEBHOOK_REQUIRE_SIGNATURE: 'true' })).toEqual({
      hmacSecret: SECRET,
      requireSignature: true
    });
  });

  it('accepts unsigned events when no secret is set (open setup)', async () => {
    const auth = await authenticateWahaWebhook(request(BODY), { hmacSecret: null, requireSignature: false });
    expect(auth).toEqual({ ok: true, reason: 'ok', signatureVerified: false });
  });

  it('refuses unsigned events in strict mode', async () => {
    const auth = await authenticateWahaWebhook(request(BODY), { hmacSecret: 's', requireSignature: true });
    expect(auth).toEqual({ ok: false, reason: 'missing_signature', signatureVerified: false });
  });

  it('accepts a correct signature and rejects a wrong one', async () => {
    const good = await sign(BODY, SECRET);
    const ok = await authenticateWahaWebhook(request(BODY, good), { hmacSecret: SECRET, requireSignature: true });
    expect(ok).toEqual({ ok: true, reason: 'ok', signatureVerified: true });

    const bad = await authenticateWahaWebhook(request(BODY, 'deadbeef'), { hmacSecret: SECRET, requireSignature: true });
    expect(bad).toEqual({ ok: false, reason: 'bad_signature', signatureVerified: false });
  });

  it('rejects a signature even when no secret is configured', async () => {
    const auth = await authenticateWahaWebhook(request(BODY, 'anything'), { hmacSecret: null, requireSignature: true });
    expect(auth).toEqual({ ok: false, reason: 'bad_signature', signatureVerified: false });
  });

  it('verifyWahaHmac is constant-time equal on the lowercase hex', async () => {
    const signature = await sign(BODY, SECRET);
    expect(await verifyWahaHmac(BODY, signature.toUpperCase(), SECRET)).toBe(true);
    expect(await verifyWahaHmac(BODY + 'x', signature, SECRET)).toBe(false);
    expect(await verifyWahaHmac(BODY, signature, 'other')).toBe(false);
  });
});

describe('handleWahaWebhook — archive then dispatch', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = FakeD1.empty();
  });

  it('archives the raw body and ingests the message', async () => {
    const outcome = await handleWahaWebhook(db, BODY);
    expect(outcome).toEqual({ accepted: true, reason: 'ok', archive: true });
    expect(db.rows('webhook_events')).toHaveLength(1);
    expect(db.rows('webhook_events')[0].eventType).toBe('message.any');
    expect(db.rows('webhook_events')[0].payload).toBe(BODY);
    expect(db.rows('messages')).toHaveLength(1);
  });

  it('still archives an event the CRM cannot interpret, accepting it', async () => {
    const outcome = await handleWahaWebhook(db, JSON.stringify({ event: 'unhandled.event', payload: {} }));
    expect(outcome.accepted).toBe(true);
    expect(db.rows('webhook_events')).toHaveLength(1);
    expect(db.rows('messages')).toHaveLength(0);
  });

  it('refuses invalid json and non-events without archiving', async () => {
    expect(await handleWahaWebhook(db, '{nope')).toEqual({ accepted: false, reason: 'invalid_json', archive: false });
    expect(await handleWahaWebhook(db, JSON.stringify({ notAnEvent: true }))).toEqual({
      accepted: false,
      reason: 'invalid_request',
      archive: false
    });
    expect(db.rows('webhook_events')).toHaveLength(0);
  });

  it('never throws on an event that explodes during dispatch', async () => {
    const outcome = await handleWahaWebhook(db, JSON.stringify({ event: 'message.any', payload: { from: 'x', id: '' } }));
    expect(outcome.accepted).toBe(true);
    expect(db.rows('webhook_events')).toHaveLength(1);
  });
});