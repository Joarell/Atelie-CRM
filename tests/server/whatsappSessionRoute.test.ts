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
  wahaHookSecret: 'test-secret-0123456789abcdef0123456789' as
    string | undefined
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

function stubWaha(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>
) {
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
    state.wahaHookSecret = 'test-secret-0123456789abcdef0123456789';
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
      webhook: {
        configured: true, registered: true,
        acceptable: true, refusal: null
      }
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
    // All four readiness fields are named, so a fallback that drops the
    // verdict fails here: the 503 body used to omit `acceptable`/`refusal`
    // while the 200 path carried them.
    expect(await response.json()).toMatchObject({
      configured: false,
      webhook: {
        configured: false, registered: false,
        acceptable: false, refusal: null
      }
    });
  });

  it('POST starts the session and mirrors it', async () => {
    const calls = stubWaha(versionBody);
    const response = await POST(context('POST'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session: { name: 'default', status: 'WORKING' },
      webhook: {
        configured: true, registered: true,
        acceptable: true, refusal: null
      }
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
      webhook: {
        configured: false, registered: false,
        acceptable: false, refusal: null
      }
    });
    const postResponse = await POST(context('POST'));
    expect(postResponse.status).toBe(200);
    expect(await postResponse.json()).toMatchObject({
      session: { name: 'default', status: 'WORKING' },
      webhook: {
        configured: false, registered: false,
        acceptable: false, refusal: null
      }
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
describe('/api/whatsapp/session — GET waits for the pairing QR', () => {
  beforeEach(() => {
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
    state.wahaHookUrl = 'https://app.test/api/whatsapp/webhook';
    state.wahaHookSecret = 'test-secret-0123456789abcdef0123456789';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The engine sits in STARTING for a moment before reaching SCAN_QR_CODE.
  // GET used to read once and hand that QR-less snapshot back, so pressing
  // "Atualizar" showed no QR — and worse, the refresh that "Iniciar sessão"
  // triggers in its `finally` overwrote the good QR POST had just delivered.
  it('GET polls past STARTING and returns the QR', async () => {
    let reads = 0;
    const calls = stubWaha((url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      if (url.endsWith('/auth/qr')) {
        return jsonResponse({ mimetype: 'image/png', data: 'AAA=' });
      }
      reads += 1;
      return jsonResponse({
        name: 'default',
        status: reads <= 3 ? 'STARTING' : 'SCAN_QR_CODE'
      });
    });
    const response = await GET(context('GET'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { status: string; qr?: string };
    };
    expect(body.session.status).toBe('SCAN_QR_CODE');
    expect(body.session.qr).toBe('data:image/png;base64,AAA=');
    expect(reads).toBeGreaterThan(3);
    expect(calls.map((c) => c.url)).toContain(
      'http://waha.test/api/default/auth/qr'
    );
  });

  // The wait must stay bounded to the states that can actually produce a QR:
  // a healthy paired session answers on the first read, with no extra polling
  // and no call to the QR endpoint.
  it('GET não faz polling extra quando a sessão já está WORKING', async () => {
    let reads = 0;
    const calls = stubWaha((url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
      }
      reads += 1;
      return jsonResponse({ name: 'default', status: 'WORKING' });
    });
    const response = await GET(context('GET'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: { status: string } };
    expect(body.session.status).toBe('WORKING');
    expect(reads).toBe(2);
    expect(calls.map((c) => c.url)).not.toContain(
      'http://waha.test/api/default/auth/qr'
    );
  });
});

// The QR wait was bounded by ATTEMPTS alone, and every attempt spends TWO
// engine round-trips whose only ceiling is the 15s client timeout. Against the
// real engine — where `/auth/qr` blocks ~10s server-side and answers 422 until
// the session is in SCAN_QR_CODE — one tap could hang for
// ~12 x (15s + 15s + 0.25s) ≈ 6 minutes. These two lock the wall-clock budget
// that bounds it, on a fake clock: no live engine is involved.
describe('/api/whatsapp/session — a espera do QR tem teto de relógio', () => {
  // Mirrors of the production constants in src/pages/api/whatsapp/session.ts.
  const BUDGET_MS = 5_000;
  const ATTEMPTS = 12;
  // What the attempt-only wait costs: every attempt plus the fallback read.
  const READS_WITHOUT_BUDGET = ATTEMPTS + 1;
  // Seconds-scale round-trips are the PREMISE: an instant stub spends no budget
  // at all, the attempt cap always wins, and the deadline stays unobservable.
  // 2s mirrors the real `/auth/qr` refusing for ~10s.
  const SLOW_READ_MS = 2_000;

  beforeEach(() => {
    vi.useFakeTimers();
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
    state.wahaHookUrl = 'https://app.test/api/whatsapp/webhook';
    state.wahaHookSecret = 'test-secret-0123456789abcdef0123456789';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Fake-clock sleep: how the stub engine "spends" time inside a read.
  function slowRead(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, SLOW_READ_MS));
  }

  // A session stuck in SCAN_QR_CODE, answering the QR endpoint only via onQr.
  function stuckEngine(onQr: () => Promise<Response>) {
    return stubWaha(async (url) => {
      if (url.endsWith('/api/server/version')) {
        return jsonResponse({
          version: '2026.7.2',
          engine: 'NOWEB',
          tier: 'CORE'
        });
      }
      if (url.endsWith('/auth/qr')) return onQr();
      return jsonResponse({ name: 'default', status: 'SCAN_QR_CODE' });
    });
  }

  // Runs the route on the fake clock. The leading `0` drains the microtask
  // chain WITHOUT moving the clock, so the wait starts at elapsed zero; the
  // steps then release each poll interval until the route answers (or not).
  async function settleOnFakeClock(pending: Promise<unknown>): Promise<boolean> {
    let done = false;
    const mark = (): void => {
      done = true;
    };
    void pending.then(mark, mark);
    await vi.advanceTimersByTimeAsync(0);
    for (let step = 0; step < 120 && !done; step++) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    return done;
  }

  it('GET para no orcamento em vez de gastar todas as tentativas', async () => {
    let qrReads = 0;
    stuckEngine(async () => {
      qrReads += 1;
      await slowRead();
      return jsonResponse({ message: 'Session is not in SCAN_QR_CODE' }, 422);
    });
    const pending = Promise.resolve(GET(context('GET')));
    expect(await settleOnFakeClock(pending)).toBe(true);
    const response = await pending;
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { status: string; qr?: string };
    };
    expect(body.session).toEqual({ name: 'default', status: 'SCAN_QR_CODE' });
    // Bounded by the wall clock: 5s / (2s QR read + 250ms poll) = 3 rounds,
    // plus the fallback read. Without the budget all 12 attempts ran.
    expect(qrReads).toBeLessThan(READS_WITHOUT_BUDGET);
    expect(qrReads).toBe(4);
  });

  it('GET ainda entrega o QR que so existe com o orcamento esgotado', async () => {
    // The engine only grows a QR after a whole budget has elapsed — which is
    // exactly the read the deadline must NOT skip: `break` out of the loop
    // still falls through to the final `attachQr`, so the pair QR ships.
    let qrReads = 0;
    let waited = 0;
    stuckEngine(async () => {
      qrReads += 1;
      if (qrReads === 1) waited = Date.now();
      const elapsed = Date.now() - waited;
      await slowRead();
      return elapsed >= BUDGET_MS
        ? jsonResponse({ mimetype: 'image/png', data: 'AAA=' })
        : jsonResponse({ message: 'Session is not in SCAN_QR_CODE' }, 422);
    });
    const pending = Promise.resolve(GET(context('GET')));
    expect(await settleOnFakeClock(pending)).toBe(true);
    const response = await pending;
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { status: string; qr?: string };
    };
    expect(body.session).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE',
      qr: 'data:image/png;base64,AAA='
    });
    // The QR came from the fallback read (4th), not from a poll inside the
    // loop: a `return current` on timeout would drop it and answer 3 reads.
    expect(qrReads).toBe(4);
    expect(state.db.rows(WAHA_SESSIONS_TABLE)[0]).toMatchObject({
      name: 'default',
      status: 'SCAN_QR_CODE'
    });
  });
});
