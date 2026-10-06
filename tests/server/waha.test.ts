import { describe, it, expect } from 'vitest';
import {
  WAHA_DETAIL_CREDENTIAL_REFUSED,
  WAHA_DETAIL_SESSION_NOT_FOUND,
  WAHA_DETAIL_UNREACHABLE
} from '../../src/domain/whatsapp';
import { WahaClient, WahaError, WahaTimeoutError, readWahaConfig, wahaClientFromEnv } from '../../src/server/waha';

const CONFIG = { baseUrl: 'http://waha.test', apiKey: 'plaintext-local', session: 'default' };

interface FetchCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function recordingFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init: init ?? {} };
    calls.push(call);
    return handler(call);
  };
  return { calls, fetch: impl as unknown as typeof fetch };
}

function headersOf(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

describe('readWahaConfig', () => {
  const complete = { WAHA_API_BASE_URL: 'http://waha:3000/', WAHA_API_KEY: 'k', WAHA_SESSION_NAME: 'atendimento' };

  it('normalises the base URL and reads the session name', () => {
    expect(readWahaConfig(complete)).toEqual({
      baseUrl: 'http://waha:3000',
      apiKey: 'k',
      session: 'atendimento'
    });
  });

  it('falls back to the default session name', () => {
    expect(readWahaConfig({ WAHA_API_BASE_URL: 'http://waha:3000', WAHA_API_KEY: 'k' })?.session).toBe('default');
  });

  it.each([
    undefined,
    {},
    { WAHA_API_BASE_URL: 'http://waha:3000' },
    { WAHA_API_KEY: 'k' },
    { WAHA_API_BASE_URL: 'http://waha:3000', WAHA_API_KEY: 'dev_plaintext_change_me' },
    { WAHA_API_BASE_URL: '  ', WAHA_API_KEY: 'k' },
    { WAHA_API_BASE_URL: 'http://waha:3000', WAHA_API_KEY: '   ' }
  ])('is null when not configured: %j', (source) => {
    expect(readWahaConfig(source)).toBeNull();
  });

  it('trims surrounding whitespace from the values', () => {
    expect(readWahaConfig({ WAHA_API_BASE_URL: '  http://waha:3000/  ', WAHA_API_KEY: '  k  ' })).toEqual({
      baseUrl: 'http://waha:3000',
      apiKey: 'k',
      session: 'default'
    });
  });

  it('the env factory mirrors readWahaConfig', () => {
    expect(wahaClientFromEnv(complete)).toBeInstanceOf(WahaClient);
    expect(wahaClientFromEnv({})).toBeNull();
  });
});

describe('WahaClient — transport contract', () => {
  it('getServerVersion hits server/version with the API key', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({ version: '2026.7.2', engine: 'NOWEB' }));
    const caps = await new WahaClient(CONFIG, { fetch }).getServerVersion();
    expect(calls[0].url).toBe('http://waha.test/api/server/version');
    expect(headersOf(calls[0])['X-Api-Key']).toBe('plaintext-local');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(caps).toMatchObject({ version: '2026.7.2', engine: 'NOWEB', multipleSessions: 'supported' });
  });

  it('getSession returns null on a structured 404 absence', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ message: 'Session not found' }, 404));
    await expect(new WahaClient(CONFIG, { fetch }).getSession('default')).resolves.toBeNull();
  });

  it('getSession parses the snapshot', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ name: 'default', status: 'WORKING' }));
    await expect(new WahaClient(CONFIG, { fetch }).getSession('default')).resolves.toEqual({
      name: 'default',
      status: 'WORKING'
    });
  });

  it('startSession POSTs to the session start endpoint', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({ name: 'default', status: 'STARTING' }, 201));
    await new WahaClient(CONFIG, { fetch }).startSession('default');
    expect(calls[0].url).toBe('http://waha.test/api/sessions/default/start');
    expect(calls[0].init.method).toBe('POST');
  });

  it('startSession creates the session first, then starts it, on a 404', async () => {
    let startCalls = 0;
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith('/api/sessions/default/start')) {
        startCalls += 1;
        return startCalls === 1
          ? jsonResponse({ message: 'Session not found' }, 404)
          : jsonResponse({ name: 'default', status: 'WORKING' }, 201);
      }
      if (call.url.endsWith('/api/sessions')) {
        return jsonResponse({ name: 'default', status: 'STOPPED' }, 201);
      }
      return jsonResponse({}, 404);
    });
    const session = await new WahaClient(CONFIG, { fetch }).startSession('default');
    expect(session).toEqual({ name: 'default', status: 'WORKING' });
    expect(calls.map((c) => c.url)).toEqual([
      'http://waha.test/api/sessions/default/start',
      'http://waha.test/api/sessions',
      'http://waha.test/api/sessions/default/start'
    ]);
    expect(calls[1].init.method).toBe('POST');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      name: 'default',
      config: {}
    });
  });

  it('startSession does not create the session for a non-404 error', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({}, 500));
    const error = (await new WahaClient(CONFIG, { fetch })
      .startSession('default')
      .catch((e: unknown) => e)) as WahaError;
    expect(error.message).toBe('waha_start_500');
    expect(calls).toHaveLength(1);
  });

  it('startSession maps a create failure when the engine needs one', async () => {
    const { calls, fetch } = recordingFetch((call) =>
      call.url.endsWith('/start') ? jsonResponse({}, 404) : jsonResponse({}, 500)
    );
    const error = (await new WahaClient(CONFIG, { fetch })
      .startSession('default')
      .catch((e: unknown) => e)) as WahaError;
    expect(error.message).toBe('waha_create_500');
    expect(calls).toHaveLength(2);
  });

  it('stopSession POSTs to the session stop endpoint', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({}));
    await new WahaClient(CONFIG, { fetch }).stopSession('default');
    expect(calls[0].url).toBe('http://waha.test/api/sessions/default/stop');
  });

  it('deleteSession DELETEs the session with the force flag', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({}));
    await new WahaClient(CONFIG, { fetch }).deleteSession('default');
    expect(calls[0].url).toBe(
      'http://waha.test/api/sessions/default?force=true'
    );
    expect(calls[0].init?.method).toBe('DELETE');
  });

  it('deleteSession is idempotent when the session is already gone (404)', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 404));
    await expect(
      new WahaClient(CONFIG, { fetch }).deleteSession('default')
    ).resolves.toBeUndefined();
  });

  it('deleteSession maps an engine refusal to waha_delete_{status}', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 500));
    const error = (await new WahaClient(CONFIG, { fetch })
      .deleteSession('default')
      .catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe('waha_delete_500');
  });

  it('getSessionQr returns a data URL from the base64 auth payload', async () => {
    const { calls, fetch } = recordingFetch(() =>
      jsonResponse({ mimetype: 'image/png', data: 'AAA=' })
    );
    const qr = await new WahaClient(CONFIG, { fetch }).getSessionQr('default');
    expect(qr).toBe('data:image/png;base64,AAA=');
    expect(calls[0].url).toBe('http://waha.test/api/default/auth/qr');
    expect(headersOf(calls[0])['Accept']).toBe('image/png, application/json');
  });

  // The real NOWEB engine answers /auth/qr with `Content-Type: image/png` and
  // the raw PNG bytes — not the JSON envelope above. Parsed as JSON that body
  // fails, wahaQrDataUrl() returns null and the QR never reaches the view.
  it('getSessionQr encodes a raw image/png body into a data URL', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { fetch } = recordingFetch(() => new Response(png, {
      status: 200,
      headers: { 'content-type': 'image/png' }
    }));
    const expected = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`;
    const qr = await new WahaClient(CONFIG, { fetch }).getSessionQr('default');
    expect(qr).toBe(expected);
  });

  it('getSessionQr still throws on a body that is neither image nor JSON', async () => {
    const { fetch } = recordingFetch(() => new Response('not a qr', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    }));
    const error = (await new WahaClient(CONFIG, { fetch })
      .getSessionQr('default')
      .catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.message).toBe('waha_qr_200');
  });

  it('getSessionQr is null when the engine has no QR yet (404)', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 404));
    await expect(new WahaClient(CONFIG, { fetch }).getSessionQr('default'))
      .resolves.toBeNull();
  });

  it('getSessionQr maps an engine error to waha_qr_{status}', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 500));
    const error = (await new WahaClient(CONFIG, { fetch })
      .getSessionQr('default')
      .catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe('waha_qr_500');
  });

  it('encodes the session name in the path', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({ name: 'qa/crm', status: 'WORKING' }));
    await new WahaClient(CONFIG, { fetch }).getSession('qa/crm');
    expect(calls[0].url).toBe('http://waha.test/api/sessions/qa%2Fcrm');
  });

  it('sendText sends the payload, adding reply_to only when replying', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({ ok: true }));
    const client = new WahaClient(CONFIG, { fetch });
    await client.sendText('default', '5511999@c.us', 'oi');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ session: 'default', chatId: '5511999@c.us', text: 'oi' });
    await client.sendText('default', '5511999@c.us', 'oi', 'FULL_ID');
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({ reply_to: 'FULL_ID' });
  });

  it('startSession maps a server error to waha_start_500', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ message: 'boom' }, 500));
    const error = (await new WahaClient(CONFIG, { fetch }).startSession('default').catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe('waha_start_500');
  });

  it('stopSession maps a refused credential to waha_stop_401', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ message: 'Unauthorized' }, 401));
    const error = (await new WahaClient(CONFIG, { fetch }).stopSession('default').catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.httpStatus).toBe(401);
    expect(error.message).toBe('waha_stop_401');
  });

  it('getSession throws waha_session_200 when the body has no status', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ name: 'default' }));
    const error = (await new WahaClient(CONFIG, { fetch }).getSession('default').catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.message).toBe('waha_session_200');
  });
});

describe('WahaClient — webhook registration transport', () => {
  const WEBHOOK = {
    url: 'https://app.test/api/whatsapp/webhook',
    events: ['message.any'],
    hmac: { key: 'sec' },
    retries: { policy: 'constant', delaySeconds: 5, attempts: 3 }
  };

  it('createSession carries config.webhooks when provided', async () => {
    const { calls, fetch } = recordingFetch(() =>
      jsonResponse({ name: 'default', status: 'STOPPED' }, 201)
    );
    const session = await new WahaClient(CONFIG, { fetch }).createSession(
      'default',
      [WEBHOOK]
    );
    expect(session).toEqual({ name: 'default', status: 'STOPPED' });
    expect(calls[0].url).toBe('http://waha.test/api/sessions');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: 'default',
      config: { webhooks: [WEBHOOK] }
    });
  });

  it('createSession stays config:{} without webhooks', async () => {
    const { calls, fetch } = recordingFetch(() =>
      jsonResponse({ name: 'default', status: 'STOPPED' }, 201)
    );
    await new WahaClient(CONFIG, { fetch }).createSession('default');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: 'default',
      config: {}
    });
  });

  it('createSession maps a refusal to waha_create_{status}', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 500));
    const error = (await new WahaClient(CONFIG, { fetch })
      .createSession('default', [WEBHOOK])
      .catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.message).toBe('waha_create_500');
  });

  it('startSession registers the webhook on the first-creation body', async () => {
    let starts = 0;
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith('/api/sessions/default/start')) {
        starts += 1;
        return starts === 1
          ? jsonResponse({ message: 'Session not found' }, 404)
          : jsonResponse({ name: 'default', status: 'WORKING' }, 201);
      }
      if (call.url.endsWith('/api/sessions')) {
        return jsonResponse({ name: 'default', status: 'STOPPED' }, 201);
      }
      return jsonResponse({}, 404);
    });
    const session = await new WahaClient(CONFIG, { fetch }).startSession(
      'default',
      [WEBHOOK]
    );
    expect(session).toEqual({ name: 'default', status: 'WORKING' });
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      name: 'default',
      config: { webhooks: [WEBHOOK] }
    });
  });

  it('updateSession PUTs the webhooks config', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({}));
    await new WahaClient(CONFIG, { fetch }).updateSession('default', [WEBHOOK]);
    expect(calls[0].url).toBe('http://waha.test/api/sessions/default');
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: 'default',
      config: { webhooks: [WEBHOOK] }
    });
  });

  it('updateSession is a no-op when the session is gone (404)', async () => {
    const { calls, fetch } = recordingFetch(() => jsonResponse({}, 404));
    await expect(
      new WahaClient(CONFIG, { fetch }).updateSession('default', [WEBHOOK])
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('updateSession maps a refusal to waha_update_{status}', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({}, 500));
    const error = (await new WahaClient(CONFIG, { fetch })
      .updateSession('default', [WEBHOOK])
      .catch((e: unknown) => e)) as WahaError;
    expect(error).toBeInstanceOf(WahaError);
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe('waha_update_500');
  });

  it('getSession surfaces the registered webhooks from the session config', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        name: 'default',
        status: 'WORKING',
        config: { webhooks: [WEBHOOK] }
      })
    );
    await expect(new WahaClient(CONFIG, { fetch }).getSession('default'))
      .resolves.toEqual({
        name: 'default',
        status: 'WORKING',
        webhooks: [WEBHOOK]
      });
  });

  it('getSession omits webhooks when the config holds none', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({ name: 'default', status: 'WORKING' })
    );
    await expect(new WahaClient(CONFIG, { fetch }).getSession('default'))
      .resolves.toEqual({ name: 'default', status: 'WORKING' });
  });
});

describe('WahaClient — the response body never enters the exception', () => {
  const SENSITIVE = '{"apiKey":"a1b2c3d4","phone":"+5511987654321","hmac":"segredo"}';
  const NEEDLES = ['a1b2c3d4', '+5511987654321', 'segredo'];

  it('keeps the status and drops the body', async () => {
    const { fetch } = recordingFetch(() => new Response(SENSITIVE, { status: 500 }));
    const error = await new WahaClient(CONFIG, { fetch }).getSession('default').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WahaError);
    expect((error as WahaError).message).toBe('waha_session_500');
    for (const needle of NEEDLES) expect(JSON.stringify(error)).not.toContain(needle);
  });

  it('sendText never leaks the body either', async () => {
    const { fetch } = recordingFetch(() => new Response(SENSITIVE, { status: 401 }));
    const error = (await new WahaClient(CONFIG, { fetch })
      .sendText('default', '5511999@c.us', 'oi')
      .catch((e: unknown) => e)) as WahaError;
    expect(error.httpStatus).toBe(401);
    expect(error.message).toBe('waha_send_401');
  });
});

describe('WahaClient — every call has a clock ceiling', () => {
  const hanging: typeof fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'TimeoutError'))
      );
    })) as unknown as typeof fetch;

  it('a socket that accepts and never answers gives up and says it was the clock', async () => {
    const client = new WahaClient(CONFIG, { timeoutMs: 10, fetch: hanging });
    const error = (await client.getServerVersion().catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(WahaTimeoutError);
    expect(error.message.toLowerCase()).toMatch(/timeout|tempo|abort/);
  });

  it('a healthy server still passes (positive control)', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ name: 'default', status: 'WORKING' }));
    await expect(new WahaClient(CONFIG, { timeoutMs: 5_000, fetch }).getSession('default')).resolves.toBeTruthy();
  });
});

describe('WahaClient.checkConnection', () => {
  const hanging: typeof fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'TimeoutError'))
      );
    })) as unknown as typeof fetch;

  it('is healthy when the key is accepted and the session is WORKING', async () => {
    const { fetch } = recordingFetch((call) =>
      call.url.endsWith('/api/server/version')
        ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' })
        : jsonResponse({ name: 'default', status: 'WORKING' })
    );
    await expect(new WahaClient(CONFIG, { fetch }).checkConnection()).resolves.toMatchObject({
      configured: true,
      reachable: true,
      authenticated: true,
      healthy: true,
      detail: null
    });
  });

  it('reports a refused credential as reachable but not authenticated', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ message: 'Unauthorized' }, 401));
    await expect(new WahaClient(CONFIG, { fetch }).checkConnection()).resolves.toMatchObject({
      reachable: true,
      authenticated: false,
      healthy: false,
      detail: WAHA_DETAIL_CREDENTIAL_REFUSED
    });
  });

  it('reports a dead transport without blaming the credential', async () => {
    const dead: typeof fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new WahaClient(CONFIG, { fetch: dead }).checkConnection()).resolves.toMatchObject({
      reachable: false,
      healthy: false,
      detail: WAHA_DETAIL_UNREACHABLE
    });
  });

  it('reports a missing session when the server answers but the session is absent', async () => {
    const { fetch } = recordingFetch((call) =>
      call.url.endsWith('/api/server/version')
        ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB' })
        : jsonResponse({ message: 'Session not found' }, 404)
    );
    await expect(new WahaClient(CONFIG, { fetch }).checkConnection()).resolves.toMatchObject({
      reachable: true,
      authenticated: true,
      healthy: false,
      detail: WAHA_DETAIL_SESSION_NOT_FOUND
    });
  });

  it('reports a version probe that times out as unreachable', async () => {
    const client = new WahaClient(CONFIG, { timeoutMs: 10, fetch: hanging });
    await expect(client.checkConnection()).resolves.toMatchObject({
      configured: true,
      reachable: false,
      authenticated: false,
      healthy: false,
      session: null,
      detail: WAHA_DETAIL_UNREACHABLE
    });
  });

  it('reports a session probe that times out as a missing session (as-is current behaviour)', async () => {
    const { fetch } = recordingFetch((call) =>
      call.url.endsWith('/api/server/version')
        ? jsonResponse({ version: '2026.7.2', engine: 'NOWEB' })
        : hanging(call.url, call.init)
    );
    await expect(new WahaClient(CONFIG, { timeoutMs: 10, fetch }).checkConnection()).resolves.toMatchObject({
      configured: true,
      reachable: true,
      authenticated: true,
      healthy: false,
      session: null,
      detail: WAHA_DETAIL_SESSION_NOT_FOUND
    });
  });
});
