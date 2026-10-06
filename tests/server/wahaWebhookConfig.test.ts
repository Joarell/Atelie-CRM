import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import {
  GET,
  PUT
} from '../../src/pages/api/whatsapp/webhook-config';
import { WAHA_WEBHOOK_DEFAULT_EVENTS } from '../../src/domain/wahaWebhookConfig';
import { USERS_TABLE, SESSIONS_TABLE } from '../../src/server/tables';
import { FakeD1 } from '../helpers/fakeD1';

const state = vi.hoisted(() => ({
  db: null as unknown as FakeD1,
  wahaUrl: 'http://waha.test' as string | undefined,
  wahaKey: 'plaintext-local' as string | undefined,
  wahaSession: 'default' as string | undefined,
  hookUrl: 'https://app.test/api/whatsapp/webhook' as string | undefined,
  hookHmac: 'test-secret-0123456789abcdef0123456789' as string | undefined
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
    },
    get WHATSAPP_HOOK_URL() {
      return state.hookUrl;
    },
    get WAHA_HMAC_SECRET() {
      return state.hookHmac;
    }
  }
}));

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
      ]
    ])
  );
}

function context(method: string, token?: string): APIContext {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return {
    request: new Request('http://localhost/api/whatsapp/webhook-config', {
      method,
      headers
    })
  } as unknown as APIContext;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubWaha(handler: (url: string, init: RequestInit) => Response) {
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

const registeredWebhook = () => ({
  url: state.hookUrl,
  events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
  hmac: { key: state.hookHmac },
  retries: { policy: 'constant', delaySeconds: 5, attempts: 3 }
});

const sessionWithWebhooks = (url: string): Response => {
  if (url.endsWith('/api/server/version')) {
    return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
  }
  return jsonResponse({
    name: 'default',
    status: 'WORKING',
    config: { webhooks: [registeredWebhook()] }
  });
};

describe('/api/whatsapp/webhook-config', () => {
  beforeEach(() => {
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
    state.hookUrl = 'https://app.test/api/whatsapp/webhook';
    state.hookHmac = 'test-secret-0123456789abcdef0123456789';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('GET', () => {
    it('requires a session (401) and never calls WAHA', async () => {
      const calls = stubWaha(sessionWithWebhooks);
      const response = await GET(context('GET'));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'sessao_invalida' });
      expect(calls).toHaveLength(0);
    });

    it('reports 503 without the engine configuration', async () => {
      state.wahaUrl = undefined;
      const calls = stubWaha(sessionWithWebhooks);
      const response = await GET(context('GET', 'tok'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'waha_nao_configurado' });
      expect(calls).toHaveLength(0);
    });

    it('reports configured:false when the app has no hook URL to register', async () => {
      state.hookUrl = undefined;
      const calls = stubWaha(sessionWithWebhooks);
      const response = await GET(context('GET', 'tok'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        configured: false,
        url: null,
        events: [],
        registered: false
      });
      expect(calls).toHaveLength(0);
    });

    it('is registered when the engine already holds our webhook', async () => {
      const calls = stubWaha(sessionWithWebhooks);
      const response = await GET(context('GET', 'tok'));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        configured: true,
        url: state.hookUrl,
        events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
        registered: true
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://waha.test/api/sessions/default');
    });

    it('is not registered while the engine has no session and no webhook', async () => {
      const calls = stubWaha(() => jsonResponse({ message: 'Session not found' }, 404));
      const response = await GET(context('GET', 'tok'));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { registered: boolean };
      expect(body.registered).toBe(false);
      expect(calls).toHaveLength(1);
    });

    it('is not registered when the event set diverges', async () => {
      stubWaha((url) => {
        if (url.endsWith('/api/server/version')) {
          return jsonResponse({ version: '2026.7.2', engine: 'NOWEB' });
        }
        const webhook = registeredWebhook();
        webhook.events = ['message.any'];
        return jsonResponse({ name: 'default', status: 'WORKING', config: { webhooks: [webhook] } });
      });
      const response = await GET(context('GET', 'tok'));
      const body = (await response.json()) as { registered: boolean };
      expect(body.registered).toBe(false);
    });

    it('reports an unreachable engine as not registered', async () => {
      stubWaha(() => jsonResponse({}, 500));
      const response = await GET(context('GET', 'tok'));
      const body = (await response.json()) as { registered: boolean };
      expect(body.registered).toBe(false);
    });
  });

  describe('PUT', () => {
    it('requires a session (401) and never calls WAHA', async () => {
      const calls = stubWaha(sessionWithWebhooks);
      const response = await PUT(context('PUT'));
      expect(response.status).toBe(401);
      expect(calls).toHaveLength(0);
    });

    it('reports 400 when the app has no hook URL to register', async () => {
      state.hookUrl = undefined;
      const calls = stubWaha(sessionWithWebhooks);
      const response = await PUT(context('PUT', 'tok'));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'webhook_nao_configurado' });
      expect(calls).toHaveLength(0);
    });

    it('is a no-op when the webhook is already registered', async () => {
      const calls = stubWaha(sessionWithWebhooks);
      const response = await PUT(context('PUT', 'tok'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, registered: true, updated: false });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://waha.test/api/sessions/default');
    });

    it('registers the single webhook on the engine when absent', async () => {
      const calls = stubWaha((url, init) => {
        if (init.method === 'PUT') {
          return jsonResponse({ name: 'default', status: 'WORKING' });
        }
        return jsonResponse({ message: 'Session not found' }, 404);
      });
      const response = await PUT(context('PUT', 'tok'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, registered: true, updated: true });
      expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
        'GET http://waha.test/api/sessions/default',
        'PUT http://waha.test/api/sessions/default'
      ]);
      expect(JSON.parse(calls[1].init.body as string)).toMatchObject({
        name: 'default',
        config: {
          webhooks: [
            {
              url: state.hookUrl,
              events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
              hmac: { key: state.hookHmac }
            }
          ]
        }
      });
    });

    it('maps an engine refusal to 502', async () => {
      stubWaha(() => jsonResponse({}, 500));
      const response = await PUT(context('PUT', 'tok'));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: 'waha_update_500' });
    });
  });
});