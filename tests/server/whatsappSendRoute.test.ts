import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { POST } from '../../src/pages/api/whatsapp/send';
import { USERS_TABLE, SESSIONS_TABLE, CONVERSATIONS_TABLE } from '../../src/server/tables';
import { FakeD1 } from '../helpers/fakeD1';

const state = vi.hoisted(() => ({
  db: null as unknown as FakeD1,
  wahaUrl: 'http://waha.test' as string | undefined,
  wahaKey: 'plaintext-local' as string | undefined,
  wahaSession: 'default' as string | undefined
}));

vi.mock('cloudflare:workers', () => ({
  env: {
    get DB() {
      return state.db;
    },
    get WAHA_API_BASE_URL() {
      return state.wahaUrl;
    },
    get WAHA_API_KEY() {
      return state.wahaKey;
    },
    get WAHA_SESSION_NAME() {
      return state.wahaSession;
    }
  }
}));

const CONVERSATION = {
  id: 'c1',
  contactId: 'ct1',
  channel: 'whatsapp',
  channelPhone: '5511999999999',
  remoteId: '5511999999999@c.us',
  lastMessageAt: '',
  assignedUserId: '',
  status: 'open',
  snoozedUntil: '',
  createdAt: ''
};

function authedDb(): FakeD1 {
  return new FakeD1(
    new Map<string, Record<string, unknown>[]>([
      [
        USERS_TABLE,
        [{ id: 'u1', name: 'Admin', email: 'a@b.c', passwordHash: 'x', role: 'admin', createdAt: '2026-01-01T00:00:00Z' }]
      ],
      [
        SESSIONS_TABLE,
        [
          {
            token: 'tok',
            userId: 'u1',
            createdAt: '2026-01-01T00:00:00Z',
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        ]
      ],
      [CONVERSATIONS_TABLE, [CONVERSATION]]
    ])
  );
}

function context(token?: string, body?: unknown): APIContext {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return {
    request: new Request('http://localhost/api/whatsapp/send', {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } as unknown as APIContext;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubSend(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init: init ?? {} };
    calls.push(call);
    return handler(url, call.init);
  };
  vi.stubGlobal('fetch', impl as unknown as typeof fetch);
  return calls;
}

describe('/api/whatsapp/send', () => {
  beforeEach(() => {
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a session (401)', async () => {
    const calls = stubSend(() => jsonResponse({ id: 'true_5511999999999@c.us_SENTID' }));
    const response = await POST(context(undefined, { conversationId: 'c1', text: 'oi' }));
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('sends text to the WAHA engine and returns the persisted message', async () => {
    const calls = stubSend(() => jsonResponse({ id: 'true_5511999999999@c.us_SENTID' }));
    const response = await POST(context('tok', { conversationId: 'c1', text: 'Estamos chegando!' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ message: { waStatus: 'sent', externalId: 'SENTID' } });
    expect(calls[0].url).toBe('http://waha.test/api/sendText');
    const body = JSON.parse((calls[0].init.body as string) ?? '{}');
    expect(body).toMatchObject({ session: 'default', chatId: '5511999999999@c.us', text: 'Estamos chegando!' });
    expect(state.db.rows('messages')).toHaveLength(1);
    expect(state.db.rows('messages')[0].waStatus).toBe('sent');
  });

  it('accepts a reply_to when the request carries it', async () => {
    const calls: Array<{ init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init: init ?? {} });
        return jsonResponse({ id: 'true_5511999999999@c.us_SENTID' });
      }) as unknown as typeof fetch
    );
    const response = await POST(
      context('tok', { conversationId: 'c1', text: 'oi', replyTo: 'true_5511999999999@c.us_PREV' })
    );
    expect(response.status).toBe(201);
    expect(JSON.parse((calls[0].init.body as string) ?? '{}')).toMatchObject({
      reply_to: 'true_5511999999999@c.us_PREV'
    });
  });

  it('rebuilds @c.us instead of sending to a stored @lid peer', async () => {
    state.db = new FakeD1(
      new Map([
        [USERS_TABLE, authedDb().rows(USERS_TABLE)],
        [SESSIONS_TABLE, authedDb().rows(SESSIONS_TABLE)],
        [CONVERSATIONS_TABLE, [{ ...CONVERSATION, remoteId: '176369157804064@lid' }]]
      ])
    );
    const calls = stubSend(() => jsonResponse({ id: 'true_5511999999999@c.us_LIDTARGET' }));
    const response = await POST(context('tok', { conversationId: 'c1', text: 'oi' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ message: { waStatus: 'sent' } });
    expect(JSON.parse((calls[0].init.body as string) ?? '{}')).toMatchObject({
      chatId: '5511999999999@c.us'
    });
  });

  it('maps business validation to 422/404', async () => {
    const noConversation = await POST(context('tok', { conversationId: 'nope', text: 'oi' }));
    expect(noConversation.status).toBe(404);

    state.db = new FakeD1(
      new Map([
        [USERS_TABLE, authedDb().rows(USERS_TABLE)],
        [SESSIONS_TABLE, authedDb().rows(SESSIONS_TABLE)],
        [CONVERSATIONS_TABLE, [{ ...CONVERSATION, channelPhone: '', remoteId: '' }]]
      ])
    );
    const noPhone = await POST(context('tok', { conversationId: 'c1', text: 'oi' }));
    expect(noPhone.status).toBe(422);

    state.db = new FakeD1(
      new Map([
        [USERS_TABLE, authedDb().rows(USERS_TABLE)],
        [SESSIONS_TABLE, authedDb().rows(SESSIONS_TABLE)],
        [CONVERSATIONS_TABLE, [{ ...CONVERSATION, channel: 'email' }]]
      ])
    );
    const wrongChannel = await POST(context('tok', { conversationId: 'c1', text: 'oi' }));
    expect(wrongChannel.status).toBe(422);
  });

  it('maps a WAHA refusal to 502 and marks the message failed', async () => {
    stubSend(() => jsonResponse({ message: 'nope' }, 500));
    const response = await POST(context('tok', { conversationId: 'c1', text: 'oi' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'waha_send_500' });
    expect(state.db.rows('messages')[0].waStatus).toBe('failed');
  });

  it('rejects missing or blank fields', async () => {
    expect((await POST(context('tok', {}))).status).toBe(422);
    expect((await POST(context('tok', { conversationId: 'c1', text: '  ' }))).status).toBe(422);
    expect((await POST(context('tok', { conversationId: '', text: 'oi' }))).status).toBe(422);
  });

  it('refuses invalid json', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/whatsapp/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: '{not json'
      })
    } as unknown as APIContext);
    expect(response.status).toBe(400);
  });
});