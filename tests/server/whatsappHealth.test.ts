import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import {
  WAHA_DETAIL_CREDENTIAL_REFUSED,
  WAHA_DETAIL_NOT_CONFIGURED,
  WAHA_DETAIL_SESSION_NOT_WORKING
} from '../../src/domain/whatsapp';
import { USERS_TABLE, SESSIONS_TABLE } from '../../src/server/tables';
import { FakeD1 } from '../helpers/fakeD1';
import { GET } from '../../src/pages/api/whatsapp/health';

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

function context(token?: string): APIContext {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return { request: new Request('http://localhost/api/whatsapp/health', { headers }) } as unknown as APIContext;
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

const healthyWaha = (url: string): Response =>
  url.endsWith('/api/server/version')
    ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' })
    : jsonResponse({ name: 'default', status: 'WORKING' });

describe('/api/whatsapp/health', () => {
  beforeEach(() => {
    state.db = authedDb();
    state.wahaUrl = 'http://waha.test';
    state.wahaKey = 'plaintext-local';
    state.wahaSession = 'default';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a session (401) and never calls WAHA', async () => {
    const calls = stubWaha(healthyWaha);
    const response = await GET(context());
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('reports 200 healthy when the server answers and the session is WORKING', async () => {
    const calls = stubWaha(healthyWaha);
    const response = await GET(context('tok'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      reachable: true,
      authenticated: true,
      healthy: true,
      detail: null,
      session: { name: 'default', status: 'WORKING' }
    });
    expect(calls[0].url).toBe('http://waha.test/api/server/version');
    expect((calls[0].init.headers as Record<string, string>)['X-Api-Key']).toBe('plaintext-local');
  });

  it('maps a refused credential to 502 with a credential detail', async () => {
    stubWaha(() => jsonResponse({ message: 'Unauthorized' }, 401));
    const response = await GET(context('tok'));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      reachable: true,
      authenticated: false,
      healthy: false,
      detail: WAHA_DETAIL_CREDENTIAL_REFUSED
    });
  });

  it('maps a session that is not WORKING to 502', async () => {
    stubWaha((url) =>
      url.endsWith('/api/server/version')
        ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB' })
        : jsonResponse({ name: 'default', status: 'STOPPED' })
    );
    const response = await GET(context('tok'));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      healthy: false,
      detail: `${WAHA_DETAIL_SESSION_NOT_WORKING}: STOPPED`
    });
  });

  it('reports 503 without touching the network when WAHA is not configured', async () => {
    state.wahaUrl = undefined;
    const calls = stubWaha(healthyWaha);
    const response = await GET(context('tok'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ configured: false, healthy: false, detail: WAHA_DETAIL_NOT_CONFIGURED });
    expect(calls).toHaveLength(0);
  });
});
