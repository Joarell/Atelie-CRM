import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { POST as postWebhook } from '../../src/pages/api/whatsapp/webhook';
import { createCollectionRoutes } from '../../src/server/routeFactory';
import {
  MESSAGES_SHAPE, CONVERSATIONS_SHAPE, CONTACTS_SHAPE
} from '../../src/server/tables';
import { FakeD1 } from '../helpers/fakeD1';

// >= HMAC_MIN_BYTES (32): `readWahaWebhookConfig` recusa segredo curto e
// placeholders, entao 's3cret' nao representa mais um segredo valido.
const state = vi.hoisted(() => ({
  SECRET: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  db: null as unknown as FakeD1,
  hmacSecret: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
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

// The exact routes the inbox poll's ApiRepository.load() calls, fed by the
// same D1 the webhook just wrote to — this ties the WAHA receive path (HTTP
// webhook → D1) to what the chat history can actually see.
const messagesGET = createCollectionRoutes('messages', MESSAGES_SHAPE).GET;
const conversationsGET = createCollectionRoutes(
  'conversations', CONVERSATIONS_SHAPE
).GET;
const contactsGET = createCollectionRoutes('contacts', CONTACTS_SHAPE).GET;

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(body)
  );
  return [...new Uint8Array(mac)].map((b) =>
    b.toString(16).padStart(2, '0')).join('');
}

function webhookContext(body: unknown, signature?: string): APIContext {
  const raw = JSON.stringify(body);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-webhook-hmac', signature);
  const request = new Request(
    'http://localhost/api/whatsapp/webhook',
    { method: 'POST', headers, body: raw }
  );
  return { request } as unknown as APIContext;
}

// As rotas de colecao agora exigem sessao (o gate por papel vive na fabrica),
// entao um contexto sem `locals.user` responde 401 em vez da lista.
function asCaller(): APIContext {
  return {
    request: new Request('http://localhost/api/messages'),
    locals: { user: { id: 'u1', role: 'admin' } }
  } as unknown as APIContext;
}

async function sendWebhook(body: unknown): Promise<void> {
  const response = await postWebhook(
    webhookContext(body, await sign(JSON.stringify(body), state.SECRET))
  );
  expect(response.status).toBe(200);
}

function entries(
  body: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return body;
}

const INBOUND = {
  event: 'message.any',
  session: 'default',
  payload: {
    id: 'true_5511999999999@c.us_RECV1',
    from: '5511999999999@c.us',
    to: '5531999999999@c.us',
    body: 'tem bolo de limão?',
    type: 'text',
    ack: 0,
    timestamp: 1750000000,
    fromMe: false,
    hasMedia: false,
    _data: { notifyName: 'Maria', key: { remoteJidAlt: '5511999999999' } }
  }
};

describe('webhook → D1 → API GET (histórico de recebimento)', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
    state.hmacSecret = state.SECRET;
    state.requireSignature = 'true';
  });

  it('serves a webhook-received message to the conversations the poll reads', async () => {
    await sendWebhook(INBOUND);

    const asMessages = await messagesGET(asCaller());
    const messages = entries(await asMessages.json());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: 'inbound',
      externalId: 'RECV1',
      text: 'tem bolo de limão?',
      conversationId: expect.any(String) as unknown as string
    });

    const asConversations = await conversationsGET(asCaller());
    const conversations = entries(await asConversations.json());
    expect(conversations).toHaveLength(1);
    expect(conversations[0].remoteId).toBe('5511999999999@c.us');
    expect(conversations[0].lastMessageAt).toBeTruthy();

    const asContacts = await contactsGET(asCaller());
    const contacts = entries(await asContacts.json());
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: 'Maria' });
  });

  it('lands a no-timestamp inbound in the open chat of a saved contact', async () => {
    // The reported scenario: a saved contact with an already-open chat sends
    // a new WhatsApp message. Real engine payloads may omit `timestamp` —
    // the delivered event must reuse the SAME conversation (no duplicates),
    // never get stamped 1970-01-01, and touch lastMessageAt so the inbox
    // list/preview can move.
    state.db = FakeD1.from({
      contacts: [{
        id: 'c-ana', name: 'Ana', phone: '5511999990001',
        email: '', notes: '', tags: '[]', createdAt: 't0'
      }],
      conversations: [{
        id: 'conv-ana', contactId: 'c-ana', channel: 'whatsapp',
        channelPhone: '5511999990001', lastMessageAt: 't1',
        assignedUserId: '', status: 'open', snoozedUntil: '',
        createdAt: 't0', remoteId: '5511999990001@c.us'
      }],
      messages: [{
        id: 'm-1', conversationId: 'conv-ana', direction: 'inbound',
        text: 'olá', createdBy: '', createdAt: 't1', externalId: 'PREV1',
        ack: 0, waStatus: 'sent', messageType: 'text', mediaUrl: '',
        mediaMime: '', remoteJid: '5511999990001@c.us', fromMe: 0,
        waTimestamp: 0, editedAt: '', revokedAt: '', deliveredAt: '',
        readAt: ''
      }]
    });
    await sendWebhook({
      event: 'message.any',
      payload: {
        id: 'true_5511999990001@c.us_NEW1',
        from: '5511999990001@c.us',
        to: '5511987427669@c.us',
        body: 'tem a anilha pronta?',
        type: 'text',
        ack: 0,
        fromMe: false,
        _data: { notifyName: 'Ana' }
      }
    });

    const asMessages = await messagesGET(asCaller());
    const messages = entries(await asMessages.json());
    expect(messages).toHaveLength(2);
    const fresh = messages.find((m) => m.externalId === 'NEW1');
    expect(fresh).toBeDefined();
    expect(fresh!.conversationId).toBe('conv-ana');
    expect(fresh!.createdAt).not.toBe('1970-01-01T00:00:00.000Z');
    expect(Date.parse(fresh!.createdAt as string)).toBeGreaterThan(0);

    const asConversations = await conversationsGET(asCaller());
    const conversations = entries(await asConversations.json());
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe('conv-ana');
    expect(conversations[0].lastMessageAt).toBe(fresh!.createdAt);
  });

  it('serves the delivered/read ack so the tick can refresh', async () => {
    await sendWebhook(INBOUND);
    await sendWebhook({
      event: 'message.ack',
      payload: { id: 'true_5511999999999@c.us_RECV1', ack: 2 }
    });

    const asMessages = await messagesGET(asCaller());
    const messages = entries(await asMessages.json());
    expect(messages[0].waStatus).toBe('delivered');
  });

  it('never duplicates the echo of an outbound message in the served history', async () => {
    await sendWebhook(INBOUND);
    await sendWebhook({
      event: 'message.any',
      payload: {
        id: 'true_5511999999999@c.us_SENT1',
        to: '5511999999999@c.us',
        body: 'claro que tem!',
        type: 'text',
        ack: 1,
        timestamp: 1750000001,
        fromMe: true,
        _data: { notifyName: 'Minha Loja' }
      }
    });

    const asMessages = await messagesGET(asCaller());
    const messages = entries(await asMessages.json());
    expect(messages).toHaveLength(2);
    const sent = messages.filter((m) => m.direction === 'outbound');
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('claro que tem!');
  });
});