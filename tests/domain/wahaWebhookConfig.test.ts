import { describe, it, expect } from 'vitest';
import {
  WAHA_WEBHOOK_DEFAULT_EVENTS,
  WAHA_WEBHOOK_MESSAGE_EVENT,
  asSingleMessageStream,
  readWahaWebhookSettings,
  sessionWebhookFor,
  wahaSessionWebhooks,
  wahaWebhookNeedsRegistration,
  webhookReadiness
} from '../../src/domain/wahaWebhookConfig';

const settings = readWahaWebhookSettings({
  WHATSAPP_HOOK_URL: 'https://app.test/api/whatsapp/webhook',
  WAHA_HMAC_SECRET: 'secret'
})!;

describe('the registered message stream stays single', () => {
  it('default events use message.any, never pairing it with `message`', () => {
    expect(WAHA_WEBHOOK_DEFAULT_EVENTS)
      .toContain(WAHA_WEBHOOK_MESSAGE_EVENT);
    expect(WAHA_WEBHOOK_DEFAULT_EVENTS)
      .not.toContain('message');
  });

  it('drops the redundant `message` when both are requested', () => {
    expect(asSingleMessageStream(['message', 'message.any']))
      .toEqual([WAHA_WEBHOOK_MESSAGE_EVENT]);
  });

  it('keeps a single-message stream untouched', () => {
    expect(asSingleMessageStream(['message.any', 'message.ack']))
      .toEqual(['message.any', 'message.ack']);
  });

  it('keeps `message` alone when message.any is absent', () => {
    expect(asSingleMessageStream(['message', 'message.ack']))
      .toEqual(['message', 'message.ack']);
  });
});

describe('readWahaWebhookSettings', () => {
  it('is null without a WHATSAPP_HOOK_URL', () => {
    expect(readWahaWebhookSettings({})).toBeNull();
    expect(readWahaWebhookSettings({ WAHA_HMAC_SECRET: 's' })).toBeNull();
  });

  it('uses the curated event set and the HMAC secret', () => {
    expect(readWahaWebhookSettings({
      WHATSAPP_HOOK_URL: 'https://app.test/x'
    })).toEqual({ url: 'https://app.test/x', events: [...WAHA_WEBHOOK_DEFAULT_EVENTS] });
    expect(settings).toMatchObject({ url: 'https://app.test/api/whatsapp/webhook', hmacKey: 'secret' });
  });

  it('parses the comma-separated override, trims and normalizes', () => {
    expect(readWahaWebhookSettings({
      WHATSAPP_HOOK_URL: 'https://app.test/x',
      WHATSAPP_HOOK_EVENTS: ' message, message,message.any '
    })?.events).toEqual([WAHA_WEBHOOK_MESSAGE_EVENT]);
  });
});

describe('sessionWebhookFor builds the engine webhook', () => {
  it('carries url, single-stream events, hmac and bounded retries', () => {
    expect(sessionWebhookFor({
      url: 'https://app.test/x',
      events: ['message', 'message.any', 'session.status'],
      hmacKey: 'k'
    })).toEqual({
      url: 'https://app.test/x',
      events: ['message.any', 'session.status'],
      hmac: { key: 'k' },
      retries: { policy: 'constant', delaySeconds: 5, attempts: 3 }
    });
  });

  it('emits no hmac without a secret', () => {
    const configured = readWahaWebhookSettings({
      WHATSAPP_HOOK_URL: 'https://app.test/x'
    })!;
    expect(sessionWebhookFor(configured).hmac).toBeUndefined();
  });
});

describe('wahaSessionWebhooks reads the engine session config', () => {
  it('extracts url/events/hmac from config.webhooks', () => {
    expect(wahaSessionWebhooks({
      name: 'default',
      config: {
        webhooks: [
          { url: 'https://app.test/x', events: ['message.any'], hmac: { key: 'k' }, retries: null }
        ]
      }
    })).toEqual([{
      url: 'https://app.test/x',
      events: ['message.any'],
      hmac: { key: 'k' }
    }]);
  });

  it('is empty for absent or malformed webhooks', () => {
    expect(wahaSessionWebhooks({ name: 'default' })).toEqual([]);
    expect(wahaSessionWebhooks({ config: { webhooks: 'nope' } })).toEqual([]);
    expect(wahaSessionWebhooks({ config: { webhooks: [{ noUrl: 1 }] } }))
      .toEqual([]);
  });
});

describe('wahaWebhookNeedsRegistration — the idempotency guard', () => {
  function echo(): ReturnType<typeof sessionWebhookFor>[] {
    return [sessionWebhookFor(settings)];
  }

  it('registers when the engine holds nothing for our url', () => {
    expect(wahaWebhookNeedsRegistration([], settings)).toBe(true);
    expect(wahaWebhookNeedsRegistration(
      [{ url: 'https://other.test/x', events: ['message'] }],
      settings
    )).toBe(true);
  });

  it('no-ops when url, events and hmac already match', () => {
    expect(wahaWebhookNeedsRegistration(echo(), settings)).toBe(false);
  });

  it('re-registers when the event set differs', () => {
    const existing = echo();
    existing[0].events = ['message.ack'];
    expect(wahaWebhookNeedsRegistration(existing, settings)).toBe(true);
  });

  it('re-registers when the hmac key differs or is missing', () => {
    const wrongKey = echo();
    wrongKey[0].hmac = { key: 'other' };
    expect(wahaWebhookNeedsRegistration(wrongKey, settings)).toBe(true);
    const noKey = echo();
    delete noKey[0].hmac;
    expect(wahaWebhookNeedsRegistration(noKey, settings)).toBe(true);
  });
});

describe('webhookReadiness — delivery works only when registered', () => {
  it('is unconfigured without a WHATSAPP_HOOK_URL', () => {
    expect(webhookReadiness(null, [])).toEqual({
      configured: false,
      registered: false
    });
  });

  it('registered when the engine echoes the app webhook', () => {
    const registered = [sessionWebhookFor(settings)];
    expect(webhookReadiness(settings, registered)).toEqual({
      configured: true,
      registered: true
    });
  });

  it('WORKING but unregistered when the engine holds nothing', () => {
    expect(webhookReadiness(settings, [])).toEqual({
      configured: true,
      registered: false
    });
  });
});