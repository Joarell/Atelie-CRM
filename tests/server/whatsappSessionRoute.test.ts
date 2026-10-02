import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { DELETE, GET, POST } from '../../src/pages/api/whatsapp/session';
import { WAHA_WEBHOOK_DEFAULT_EVENTS } from '../../src/domain/wahaWebhookConfig';
import { USERS_TABLE, SESSIONS_TABLE, WAHA_SESSIONS_TABLE } from '../../src/server/tables';
import type { Role } from '../../src/domain/crm';
import { FakeD1 } from '../helpers/fakeD1';

const state = vi.hoisted(() => ({
  db: null as unknown as FakeD1,
  wahaUrl: 'http://waha.test' as string | undefined,
  wahaKey: 'plaintext-local' as string | undefined,
  wahaSession: 'default' as string | undefined,
  wahaHookUrl: 'https://app.test/api/whatsapp/webhook' as string | undefined,
  wahaHookSecret: 'sec' as string | undefined
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
      return state.wahaHookUrl;
    },
    get WAHA_HMAC_SECRET() {
      return state.wahaHookSecret;
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

function context(
  method: string,
  token?: string,
  role: Role | null = 'admin'
): APIContext {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const locals: Record<string, unknown> = role === null
    ? {}
    : { user: { id: 'u1', name: 'Admin', role } };
  return {
    request: new Request(`http://localhost/api/whatsapp/session`, { method, headers }),
    locals
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

const versionBody = (url: string): Response =>
  url.endsWith('/api/server/version')
    ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' })
    : jsonResponse({
        name: 'default',
        status: 'WORKING',
        config: {
          webhooks: [
            {
              url: state.wahaHookUrl,
              events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
              hmac: { key: state.wahaHookSecret }
            }
          ]
        }
      });

describe('/api/whatsapp/session', () => {
  beforeEach(() => {
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
    state.wahaHookUrl = 'https://app.test/api/whatsapp/webhook';
    state.wahaHookSecret = 'sec';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('@spec:AC-115 GET sem token responde 401 e nao devolve QR', async () => {
    const calls = stubWaha(versionBody);
    const response = await GET(context('GET', undefined, null));
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).not.toContain('base64');
    expect(body).not.toContain('qr');
    expect(calls).toHaveLength(0);
  });

  it('@spec:AC-116 DELETE sem token responde 401 e nao derruba a sessao', async () => {
    const calls = stubWaha(versionBody);
    const response = await DELETE(context('DELETE', undefined, null));
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)).toHaveLength(0);
  });

  it('@spec:AC-117 viewer nao le a sessao e agent nao a derruba', async () => {
    const calls = stubWaha(versionBody);
    expect((await GET(context('GET', 'tok', 'viewer'))).status).toBe(403);
    expect((await DELETE(context('DELETE', 'tok', 'agent'))).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)).toHaveLength(0);
  });

  it('@spec:AC-118 admin recebe o estado da sessao', async () => {
    stubWaha(versionBody);
    const response = await GET(context('GET', 'tok', 'admin'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      session: { name: 'default', status: 'WORKING' }
    });
  });

  it('admin pode parear e derrubar a sessao', async () => {
    const calls = stubWaha(versionBody);
    expect((await GET(context('GET', 'tok', 'admin'))).status).toBe(200);
    expect((await POST(context('POST', 'tok', 'admin'))).status).toBe(200);
    expect((await DELETE(context('DELETE', 'tok', 'admin'))).status).toBe(200);
    // GET: version + session + QR-bearing refetch; POST: + start; DELETE: stop
    expect(calls).toHaveLength(7);
  });

  it('GET returns the health + session snapshot and mirrors the status', async () => {
    const calls = stubWaha(versionBody);
    const response = await GET(context('GET', 'tok'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      configured: true,
      session: { name: 'default', status: 'WORKING' },
      webhook: { configured: true, registered: true }
    });
    // version probe + health session + QR-bearing refetch
    expect(calls.map((c) => c.url)).toEqual([
      'http://waha.test/api/server/version',
      'http://waha.test/api/sessions/default',
      'http://waha.test/api/sessions/default'
    ]);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({ name: 'default', status: 'WORKING' });
  });

  it('GET surfaces the pairing QR fetched from the auth endpoint', async () => {
    const calls = stubWaha((url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      return jsonResponse({ name: 'default', status: 'SCAN_QR_CODE' });
    });
    const response = await GET(context('GET'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string; qr?: string };
      health: { session: { name: string; status: string } | null };
    };
    expect(body.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE',
      qr: 'data:image/png;base64,AAA='
    });
    expect(body.health.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE'
    });
    expect(calls).toHaveLength(4);
    expect(calls[3].url).toBe('http://waha.test/api/default/auth/qr');
  });

  it('GET returns a defined STOPPED session when WAHA has none yet', async () => {
    const calls = stubWaha((url) =>
      url.endsWith('/api/server/version')
        ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' })
        : jsonResponse({ message: 'Session not found' }, 404)
    );
    const response = await GET(context('GET'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string } | null;
      health: {
        reachable: boolean;
        authenticated: boolean;
        healthy: boolean;
        detail: string | null;
      };
    };
    expect(body.session).not.toBeNull();
    expect(body.session).not.toBeUndefined();
    expect(body.session).toEqual({ name: 'default', status: 'STOPPED' });
    expect(body.health).toMatchObject({
      reachable: true,
      authenticated: true,
      healthy: false,
      detail: 'sessao_inexistente'
    });
    expect(calls.map((c) => c.url)).toEqual([
      'http://waha.test/api/server/version',
      'http://waha.test/api/sessions/default'
    ]);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({
      name: 'default',
      status: 'STOPPED'
    });
  });

  it('GET reports 503 when WAHA is not configured', async () => {
    state.wahaUrl = undefined;
    const response = await GET(context('GET'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      configured: false,
      webhook: { configured: false, registered: false }
    });
  });

  it('POST starts the session and mirrors it', async () => {
    const calls = stubWaha(versionBody);
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session: { name: 'default', status: 'WORKING' },
      webhook: { configured: true, registered: true }
    });
    // connection probe (version + session) precedes the start
    expect(calls.map((c) => c.url)).toEqual([
      'http://waha.test/api/server/version',
      'http://waha.test/api/sessions/default',
      'http://waha.test/api/sessions/default/start'
    ]);
    expect(calls[2].init.method).toBe('POST');
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({ name: 'default', status: 'WORKING' });
  });

  it('GET/POST still start the engine but flag the webhook unconfigured when WHATSAPP_HOOK_URL is missing', async () => {
    state.wahaHookUrl = undefined;
    const calls = stubWaha(versionBody);
    const getResponse = await GET(context('GET'));
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      configured: true,
      webhook: { configured: false, registered: false }
    });
    const postResponse = await POST(context('POST'));
    expect(postResponse.status).toBe(200);
    expect(await postResponse.json()).toMatchObject({
      session: { name: 'default', status: 'WORKING' },
      webhook: { configured: false, registered: false }
    });
    expect(calls.some((c) => c.url.endsWith('/start'))).toBe(true);
  });

  it('POST resets a stale FAILED credential set and returns the fresh QR', async () => {
    const calls = stubWaha((url, init) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (init.method === 'DELETE') return jsonResponse({}, 200);
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      if (url.endsWith('/start')) {
        return jsonResponse({ name: 'default', status: 'SCAN_QR_CODE' }, 201);
      }
      return jsonResponse({ name: 'default', status: 'FAILED' });
    });
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string; qr?: string };
    };
    expect(body.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE',
      qr: 'data:image/png;base64,AAA='
    });
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET http://waha.test/api/server/version',
      'GET http://waha.test/api/sessions/default',
      'DELETE http://waha.test/api/sessions/default?force=true',
      'POST http://waha.test/api/sessions/default/start',
      'GET http://waha.test/api/default/auth/qr'
    ]);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({
      name: 'default',
      status: 'SCAN_QR_CODE'
    });
  });

  it('POST retries once when a freshly re-created session still fails', async () => {
    let tries = 0;
    const calls = stubWaha((url, init) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (init.method === 'DELETE') return jsonResponse({}, 200);
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      if (url.endsWith('/start')) {
        tries += 1;
        return jsonResponse(
          { name: 'default', status: tries < 2 ? 'FAILED' : 'SCAN_QR_CODE' },
          201
        );
      }
      return jsonResponse({ name: 'default', status: tries > 0 ? 'FAILED' : 'WORKING' });
    });
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string; qr?: string };
    };
    expect(body.session).toMatchObject({ status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA=' });
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET http://waha.test/api/server/version',
      'GET http://waha.test/api/sessions/default',
      'POST http://waha.test/api/sessions/default/start',
      'DELETE http://waha.test/api/sessions/default?force=true',
      'POST http://waha.test/api/sessions/default/start',
      'GET http://waha.test/api/default/auth/qr'
    ]);
  });

  it('POST maps a WAHA refusal to 502', async () => {
    stubWaha(() => jsonResponse({ message: 'nope' }, 500));
    const response = await POST(context('POST'));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'waha_start_500' });
  });

  it('POST registers the app webhook on the session it creates', async () => {
    let starts = 0;
    const calls = stubWaha((url, init) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/api/sessions/default/start')) {
        starts += 1;
        return starts === 1
          ? jsonResponse({ message: 'Session not found' }, 404)
          : jsonResponse({ name: 'default', status: 'WORKING' }, 201);
      }
      if (url.endsWith('/api/sessions') && init.method === 'POST') {
        return jsonResponse({ name: 'default', status: 'STOPPED' }, 201);
      }
      return jsonResponse({ message: 'Session not found' }, 404);
    });
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session: { name: 'default', status: 'WORKING' }
    });
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET http://waha.test/api/server/version',
      'GET http://waha.test/api/sessions/default',
      'POST http://waha.test/api/sessions/default/start',
      'POST http://waha.test/api/sessions',
      'POST http://waha.test/api/sessions/default/start'
    ]);
    expect(JSON.parse(calls[3].init.body as string)).toMatchObject({
      name: 'default',
      config: {
        webhooks: [
          {
            url: state.wahaHookUrl,
            events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
            hmac: { key: state.wahaHookSecret }
          }
        ]
      }
    });
  });

  it('POST bridges STARTING into SCAN_QR_CODE and returns the QR', async () => {
    let plan = 'STARTING';
    const calls = stubWaha((url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      if (url.endsWith('/start')) {
        return jsonResponse({ name: 'default', status: 'STARTING' }, 201);
      }
      const body = jsonResponse({ name: 'default', status: plan });
      plan = 'SCAN_QR_CODE';
      return body;
    });
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string; qr?: string };
    };
    expect(body.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE',
      qr: 'data:image/png;base64,AAA='
    });
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET http://waha.test/api/server/version',
      'GET http://waha.test/api/sessions/default',
      'POST http://waha.test/api/sessions/default/start',
      'GET http://waha.test/api/sessions/default',
      'GET http://waha.test/api/default/auth/qr'
    ]);
  });

  it('POST re-registra a webhook quando a do engine esta divergente', async () => {
    // A sessao ja existe e responde 409 no start, entao o `webhooks` do POST e
    // descartado pelo engine. Se o engine estiver com um hmac velho, apenas
    // reabrir a sessao NAO conserta: e o PUT /api/whatsapp/webhook-config que
    // re-sincroniza. O POST tambem tem de consertar, senao o banner manda o
    // usuario para uma remediacao que nao funciona.
    const calls = stubWaha((url, init) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/start')) {
        return jsonResponse({ message: 'Session is already running' }, 409);
      }
      return jsonResponse({
        name: 'default',
        status: 'WORKING',
        config: {
          webhooks: [
            {
              url: state.wahaHookUrl,
              events: [...WAHA_WEBHOOK_DEFAULT_EVENTS],
              hmac: { key: 'hmac-velho' }
            }
          ]
        }
      });
    });
    const response = await POST(context('POST', 'tok', 'admin'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { webhook: { registered: boolean } };
    expect(body.webhook.registered).toBe(true);
    const repair = calls.find(
      (c) => c.init.method === 'PUT' && c.url.endsWith('/api/sessions/default')
    );
    expect(repair).toBeTruthy();
    expect(JSON.parse(repair!.init.body as string)).toMatchObject({
      config: { webhooks: [{ hmac: { key: state.wahaHookSecret } }] }
    });
  });

  it('POST nao mexe na webhook quando ela ja esta em dia', async () => {
    const calls = stubWaha(versionBody);
    await POST(context('POST', 'tok', 'admin'));
    expect(
      calls.some((c) => c.init.method === 'PUT' && c.url.endsWith('/api/sessions/default'))
    ).toBe(false);
  });

  it('POST tolerates the already-running 409 and returns the live QR', async () => {
    const calls = stubWaha((url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      if (url.endsWith('/start')) {
        return jsonResponse({ message: 'Session is already running' }, 409);
      }
      return jsonResponse({ name: 'default', status: 'SCAN_QR_CODE' });
    });
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { name: string; status: string; qr?: string };
    };
    expect(body.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE',
      qr: 'data:image/png;base64,AAA='
    });
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)[2]).toBe(
      'POST http://waha.test/api/sessions/default/start'
    );
    expect(calls.map((c) => c.url)).toContain('http://waha.test/api/default/auth/qr');
  });

  it('DELETE stops the session and marks the mirror STOPPED', async () => {
    const calls = stubWaha((url) =>
      url.endsWith('/api/sessions/default/stop') ? jsonResponse({}, 200) : jsonResponse({}, 404)
    );
    const response = await DELETE(context('DELETE'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(calls[0].url).toBe('http://waha.test/api/sessions/default/stop');
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({ name: 'default', status: 'STOPPED' });
  });
});