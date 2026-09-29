import {
  WAHA_DEFAULT_SESSION,
  WAHA_DEFAULT_TIMEOUT_MS,
  WAHA_DEV_PLACEHOLDER_KEY,
  describeWahaServer,
  parseWahaSession,
  toWahaHealth,
  wahaQrDataUrl,
  type WahaCapabilities,
  type WahaHealth,
  type WahaSessionSnapshot
} from '../domain/whatsapp';
import type { WahaEngineWebhook } from '../domain/wahaWebhookConfig';

// Minimal WAHA REST transport. Ported (and narrowed to single-tenant) from
// DeskcommCRM-RecipeCosting/lib/waha/client.ts. Two rules from that file are
// kept on purpose:
//   1. every call carries a clock ceiling — the socket that accepts and never
//      answers is what hangs the request;
//   2. the error message NEVER carries the response body (it can hold phones,
//      webhook HMACs and API keys); only the HTTP status survives.
// The `Database` seam applies here too: the client takes a plain config so it
// is testable with an injected `fetch`, no `cloudflare:workers` env needed.

export interface WahaConfig {
  baseUrl: string;
  apiKey: string;
  session: string;
}

export interface WahaClientOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * HTTP error from WAHA: message is ``waha_<operation>_<status>``,
 * body dropped.
 */
export class WahaError extends Error {
  constructor(
    public readonly operation: string,
    public readonly httpStatus: number
  ) {
    super(`waha_${operation}_${httpStatus}`);
    this.name = 'WahaError';
  }
}

export class WahaTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`waha_timeout: o WAHA nao respondeu em ${timeoutMs}ms`);
    this.name = 'WahaTimeoutError';
  }
}

// Reads the WAHA config from any env-like object. Returns null when the app is
// not configured (missing URL/key, or the example placeholder), which callers
// render as "start WAHA" instead of attempting a fake connection.
export function readWahaConfig(source: unknown): WahaConfig | null {
  const record = source as Record<string, unknown> | null | undefined;
  const url = text(record?.WAHA_API_BASE_URL);
  const apiKey = text(record?.WAHA_API_KEY);
  if (!url || !apiKey || apiKey === WAHA_DEV_PLACEHOLDER_KEY) return null;
  return {
    baseUrl: url.replace(/\/+$/, ''),
    apiKey,
    session: text(record?.WAHA_SESSION_NAME) ?? WAHA_DEFAULT_SESSION
  };
}

export class WahaClient {
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(
    private readonly config: WahaConfig,
    options: WahaClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? WAHA_DEFAULT_TIMEOUT_MS;
    const doFetch = options.fetch ?? fetch;
    // Call the captured fetch as a bare function (not as an object method):
    // workerd rejects `obj.fetch(...)` with "Illegal invocation" because the
    // Workers runtime requires `this` to be its own global — Node tolerates
    // it, which is why a plain capture passes the unit tests yet fails live.
    this.doFetch = (input, init) => doFetch(input, init);
  }

  /** The session name this client is configured to operate. */
  get session(): string {
    return this.config.session;
  }

  async getServerVersion(): Promise<WahaCapabilities> {
    const res = await this.request('/api/server/version');
    if (!res.ok) throw new WahaError('version', res.status);
    return describeWahaServer(await body(res));
  }

  async getSession(name: string): Promise<WahaSessionSnapshot | null> {
    const res = await this.request(`/api/sessions/${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new WahaError('session', res.status);
    const session = parseWahaSession(await body(res));
    if (!session) throw new WahaError('session', res.status);
    return session;
  }

  /**
   * Starts the session, creating it first when this WAHA line refuses to start
   * an unregistered session (404). The optional webhooks ride on that first
   * creation so the engine delivers the app's events from the very beginning
   * — passing a registration on every start is what would double-deliver.
   */
  async startSession(
    name: string,
    webhooks?: WahaEngineWebhook[],
  ): Promise<WahaSessionSnapshot> {
    try {
      return await this.doStart(name);
    } catch (error) {
      if (!(error instanceof WahaError) || error.httpStatus !== 404) {
        throw error;
      }
      await this.createSession(name, webhooks);
      return this.doStart(name);
    }
  }

  async createSession(
    name: string,
    webhooks?: WahaEngineWebhook[],
  ): Promise<WahaSessionSnapshot> {
    const config = webhooks && webhooks.length > 0 ? { webhooks } : {};
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config })
    };
    const res = await this.request('/api/sessions', init);
    if (!res.ok) throw new WahaError('create', res.status);
    const session = parseWahaSession(await body(res));
    if (!session) throw new WahaError('create', res.status);
    return session;
  }

  /**
   * Replaces the session config with the given webhooks (PUT), so a session
   * created without them starts delivering the app's events. Idempotent: a
   * missing session is a no-op. Mind the cost — WAHA stops and restarts a
   * running session on update — so callers check
   * `wahaWebhookNeedsRegistration` first.
   */
  async updateSession(
    name: string,
    webhooks: WahaEngineWebhook[],
  ): Promise<void> {
    const init: RequestInit = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config: { webhooks } })
    };
    const res = await this.request(
      `/api/sessions/${encodeURIComponent(name)}`,
      init
    );
    if (res.status === 404) return;
    if (!res.ok) throw new WahaError('update', res.status);
  }

  private async doStart(name: string): Promise<WahaSessionSnapshot> {
    const res = await this.request(sessionPath(name, 'start'), post());
    if (!res.ok) throw new WahaError('start', res.status);
    const session = parseWahaSession(await body(res));
    if (!session) throw new WahaError('start', res.status);
    return session;
  }

  async stopSession(name: string): Promise<void> {
    const res = await this.request(sessionPath(name, 'stop'), post());
    if (!res.ok) throw new WahaError('stop', res.status);
  }

  /**
   * Removes the engine session (and its stored WhatsApp credentials) so the
   * next start regenerates a fresh pair QR. NOWEB reuses stale auth and then
   * dies re-logging an already-paired number; delete is the reset that puts it
   * back into SCAN_QR_CODE. Idempotent: a missing session reads as success.
   */
  async deleteSession(name: string, force = true): Promise<void> {
    const query = force ? '?force=true' : '';
    const res = await this.request(
      `/api/sessions/${encodeURIComponent(name)}${query}`,
      { method: 'DELETE' }
    );
    if (res.status === 404) return;
    if (!res.ok) throw new WahaError('delete', res.status);
  }

  /** The pairing QR as a data URL, or null when the engine has none yet. */
  async getSessionQr(name: string): Promise<string | null> {
    const res = await this.request(qrPath(name), {
      headers: { Accept: 'application/json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new WahaError('qr', res.status);
    const qr = wahaQrDataUrl(await body(res));
    if (!qr) throw new WahaError('qr', res.status);
    return qr;
  }

  async sendText(
    session: string,
    chatId: string,
    text: string,
    replyTo?: string | null
  ): Promise<unknown> {
    const payload = {
      session,
      chatId,
      text,
      ...(replyTo ? { reply_to: replyTo } : {})
    };
    const res = await this.request('/api/sendText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new WahaError('send', res.status);
    return body(res);
  }

  // The connection test itself: is the server up, is the key accepted, and is
  // the session actually WORKING? Each failure maps to one `detail` code.
  async checkConnection(
    name: string = this.config.session
  ): Promise<WahaHealth> {
    let identity: WahaCapabilities | null = null;
    try {
      identity = await this.getServerVersion();
    } catch (error) {
      return healthFromError(error, null, false);
    }
    try {
      const session = await this.getSession(name);
      return toWahaHealth({
        configured: true,
        reachable: true,
        authenticated: true,
        identity,
        session
      });
    } catch (error) {
      return healthFromError(error, identity, true);
    }
  }

  private async request(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const headers = {
      'X-Api-Key': this.config.apiKey,
      ...(init.headers ?? {})
    };
    try {
      const url = `${this.config.baseUrl}${path}`;
      return await this.doFetch(url, { ...init, headers, signal });
    } catch (error) {
      if (isTimeout(error)) throw new WahaTimeoutError(this.timeoutMs);
      throw error;
    }
  }
}

export function wahaClientFromEnv(source: unknown): WahaClient | null {
  const config = readWahaConfig(source);
  return config ? new WahaClient(config) : null;
}

function healthFromError(
  error: unknown,
  identity: WahaCapabilities | null,
  serverAnswered: boolean
): WahaHealth {
  const isRefused =
    error instanceof WahaError &&
    (error.httpStatus === 401 || error.httpStatus === 403);
  return toWahaHealth({
    configured: true,
    reachable: serverAnswered || isRefused,
    authenticated: serverAnswered && !isRefused,
    identity,
    session: null
  });
}

function sessionPath(name: string, action: string): string {
  return `/api/sessions/${encodeURIComponent(name)}/${action}`;
}

function qrPath(name: string): string {
  return `/api/${encodeURIComponent(name)}/auth/qr`;
}

function post(): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  };
}

async function body(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function isTimeout(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError';
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}