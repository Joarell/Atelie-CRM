import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  WahaApiRepository,
  WahaAuthError
} from '../../src/repositories/WahaApiRepository';
import type { Message } from '../../src/domain/crm';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Response): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return Promise.resolve(handler(input, init));
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WahaApiRepository', () => {
  const repo = new WahaApiRepository('/api/whatsapp', () => 'tok');

  it('session() GETs the state and forwards the bearer token', async () => {
    const calls = stubFetch(() => jsonResponse({ configured: true, health: { healthy: true }, session: { name: 'default', status: 'WORKING' } }));
    const state = await repo.session();
    expect(state).toMatchObject({ configured: true, session: { name: 'default', status: 'WORKING' } });
    expect(calls[0].url).toBe('/api/whatsapp/session');
    expect((calls[0].init?.headers as Headers).get('Authorization')).toBe('Bearer tok');
  });

  it('session() degrades to not-configured on 503', async () => {
    stubFetch(() => jsonResponse({ configured: false }, 503));
    await expect(repo.session()).resolves.toEqual({
      configured: false, health: null, session: null,
      webhook: {
        configured: false, registered: false,
        acceptable: false, refusal: null
      }
    });
  });

  it('session() forwards the webhook readiness report', async () => {
    stubFetch(() =>
      jsonResponse({
        configured: true,
        health: { healthy: true },
        session: { name: 'default', status: 'WORKING' },
        webhook: {
          configured: true, registered: true,
          acceptable: true, refusal: null
        }
      })
    );
    expect((await repo.session()).webhook).toEqual({
      configured: true, registered: true,
      acceptable: true, refusal: null
    });
  });

  it('session() passes the QR snapshot through', async () => {
    stubFetch(() =>
      jsonResponse({
        configured: true,
        health: { healthy: false },
        session: { name: 'default', status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA' }
      })
    );
    await expect(repo.session()).resolves.toMatchObject({
      configured: true,
      session: { name: 'default', status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA' }
    });
  });

  it('session() works without any bearer token (public QR surface)', async () => {
    const anon = new WahaApiRepository('/api/whatsapp', () => null);
    const calls = stubFetch(() =>
      jsonResponse({
        configured: true,
        health: { healthy: false },
        session: { name: 'default', status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA' }
      })
    );
    await expect(anon.session()).resolves.toMatchObject({
      configured: true,
      session: { name: 'default', status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA' }
    });
    expect((calls[0].init?.headers as Headers).has('Authorization')).toBe(false);
  });

  it('session() surfaces a refused app body as a plain error (surface is public)', async () => {
    stubFetch(() => jsonResponse({ error: 'sessao_invalida' }, 401));
    await expect(repo.session()).rejects.toThrow('sessao_invalida');
    await expect(repo.session()).rejects.not.toBeInstanceOf(WahaAuthError);
  });

  it('session() forwards a non-auth server failure', async () => {
    stubFetch(() => jsonResponse({ error: 'boom' }, 500));
    await expect(repo.session()).rejects.toThrow('boom');
  });

  it('only send() treats a refused app session as an auth signal', async () => {
    stubFetch(() => jsonResponse({ error: 'sessao_invalida' }, 401));
    await expect(repo.send('c1', 'oi')).rejects.toBeInstanceOf(WahaAuthError);
  });

  it('start()/stop() decode a 401 as a plain error or ok (lifecycle is public)', async () => {
    stubFetch(() => jsonResponse({ error: 'sessao_invalida' }, 401));
    await expect(repo.start()).rejects.toThrow('sessao_invalida');
    await expect(repo.start()).rejects.not.toBeInstanceOf(WahaAuthError);
    await expect(repo.stop()).resolves.toBe(false);
  });

  it('start() POSTs and returns the session snapshot', async () => {
    const calls = stubFetch(() => jsonResponse({ session: { name: 'default', status: 'SCAN_QR_CODE' } }));
    const state = await repo.start();
    expect(state.session).toMatchObject({ name: 'default', status: 'SCAN_QR_CODE' });
    expect(calls[0].url).toBe('/api/whatsapp/session');
    expect(calls[0].init?.method).toBe('POST');
  });

  it('start() throws the server error code on refusal', async () => {
    stubFetch(() => jsonResponse({ error: 'waha_nao_configurado' }, 503));
    await expect(repo.start()).rejects.toThrow('waha_nao_configurado');
  });

  it('stop() DELETEs and reports ok', async () => {
    const calls = stubFetch(() => jsonResponse({ ok: true }));
    expect(await repo.stop()).toBe(true);
    expect(calls[0].url).toBe('/api/whatsapp/session');
    expect(calls[0].init?.method).toBe('DELETE');
  });

  it('send() POSTs to /send with the payload and returns the message', async () => {
    const message: Message = { id: 'm1', conversationId: 'c1', direction: 'outbound', text: 'oi', createdBy: 'u1', createdAt: '2026-01-01T00:00:00Z', waStatus: 'sent', externalId: 'SENTID' };
    const calls = stubFetch(() => jsonResponse({ message }));
    const saved = await repo.send('c1', 'oi');
    expect(saved).toMatchObject({ id: 'm1', waStatus: 'sent' });
    const body = JSON.parse((calls[0].init?.body as string) ?? '{}');
    expect(body).toEqual({ conversationId: 'c1', text: 'oi' });
    expect(calls[0].url).toBe('/api/whatsapp/send');
  });

  it('send() passes replyTo through', async () => {
    const calls = stubFetch(() => jsonResponse({ message: { id: 'm1', conversationId: 'c1', direction: 'outbound', text: 'x', createdBy: '', createdAt: '' } }));
    await repo.send('c1', 'x', 'true_1@c.us_PREV');
    expect(JSON.parse((calls[0].init?.body as string) ?? '{}')).toMatchObject({ replyTo: 'true_1@c.us_PREV' });
  });

  it('send() surfaces a business error code as a plain error', async () => {
    stubFetch(() => jsonResponse({ error: 'conversation_not_found' }, 404));
    await expect(repo.send('nope', 'oi')).rejects.toThrow('conversation_not_found');
  });
});