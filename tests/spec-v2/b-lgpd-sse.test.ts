import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import type { Database, PreparedStatement } from '../../src/server/db';
import { GET as exportData } from '../../src/pages/api/me/export';
import { GET as viewData } from '../../src/pages/api/me/data';
import { GET as sseEvents } from '../../src/pages/api/crm/events';
import { listEntities } from '../../src/server/crud';
import {
  CONTACTS_TABLE, CONVERSATIONS_TABLE, CUSTOMERS_TABLE, MESSAGES_TABLE,
  ORDERS_TABLE, SESSIONS_TABLE, USERS_TABLE, DEALS_TABLE, TASKS_TABLE,
  CONSENT_TABLE, CONTACTS_SHAPE
} from '../../src/server/tables';

const state = vi.hoisted(() => ({ db: null as unknown as Database }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));
vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));

const COOKIE = 'crm_session';
const ME = 'agent-1';
const THEM = 'agent-2';

type Row = Record<string, unknown>;
type Payload = Record<string, unknown[]>;

const person = (prefix: string, who: string): Row => ({
  name: `Pessoa ${prefix}`,
  phone: `1198${prefix}0000`,
  email: `${prefix}@x.test`
});

function fixtures(): Record<string, Row[]> {
  return {
    [SESSIONS_TABLE]: [{
      id: 's-1', token: 'tok-me', userId: ME,
      createdAt: '2026-01-01', expiresAt: '2099-01-01'
    }],
    [USERS_TABLE]: [
      { id: ME, role: 'agent', name: 'Eu', email: 'eu@x.test' },
      { id: THEM, role: 'agent', name: 'Outro', email: 'outro@x.test' }
    ],
    [CONTACTS_TABLE]: [
      { id: 'ct-mine', assignedUserId: ME, ...person('1111', ME) },
      { id: 'ct-other', assignedUserId: THEM, ...person('2222', THEM) }
    ],
    [CONVERSATIONS_TABLE]: [
      { id: 'cv-mine', contactId: 'ct-mine', assignedUserId: ME },
      { id: 'cv-other', contactId: 'ct-other', assignedUserId: THEM }
    ],
    [MESSAGES_TABLE]: [
      { id: 'm-mine', conversationId: 'cv-mine', body: 'meu' },
      { id: 'm-other', conversationId: 'cv-other', body: 'alheio' }
    ],
    [CUSTOMERS_TABLE]: [
      { id: 'cu-mine', ...person('1111', ME) },
      { id: 'cu-other', ...person('2222', THEM) }
    ],
    [ORDERS_TABLE]: [
      { id: 'o-mine', customerId: 'cu-mine' },
      { id: 'o-other', customerId: 'cu-other' }
    ],
    [DEALS_TABLE]: [], [TASKS_TABLE]: [], [CONSENT_TABLE]: []
  };
}

function ctx(url = '/api/me/export'): APIContext {
  return {
    request: new Request(`http://localhost${url}`, {
      headers: { Cookie: `${COOKIE}=tok-me` }
    }),
    url: new URL(`http://localhost${url}`),
    params: {},
    locals: {}
  } as unknown as APIContext;
}

async function payloadOf(response: Response): Promise<Payload> {
  return (await response.json()) as Payload;
}

function ids(rows: unknown[]): string[] {
  return rows.map((row) => (row as Row).id as string);
}

beforeEach(() => {
  state.db = FakeD1.from(fixtures());
});

describe('AC-301/302/303 — LGPD export is scoped to the data subject', () => {
  it('@spec:AC-301 export returns only messages from my conversations', async () => {
    const payload = await payloadOf(await exportData(ctx()));
    expect(ids(payload.messages)).toEqual(['m-mine']);
    expect(ids(payload.messages)).not.toContain('m-other');
  });

  it('@spec:AC-302 export returns only my customers and orders', async () => {
    const payload = await payloadOf(await exportData(ctx()));
    expect(ids(payload.customers)).toEqual(['cu-mine']);
    expect(ids(payload.orders)).toEqual(['o-mine']);
    expect(ids(payload.contacts)).toEqual(['ct-mine']);
  });

  it('@spec:AC-303 /api/me/data and /api/me/export agree on the scope', async () => {
    const viaData = await payloadOf(await viewData(ctx('/api/me/data')));
    const viaExport = await payloadOf(await exportData(ctx()));
    for (const key of ['messages', 'customers', 'orders', 'contacts']) {
      expect([key, ids(viaExport[key])]).toEqual([key, ids(viaData[key])]);
    }
    expect(viaExport.formatVersion).toBe('1.0');
  });

  it('@spec:AC-301 an unauthenticated export is refused', async () => {
    const context = {
      request: new Request('http://localhost/api/me/export'),
      params: {},
      locals: {}
    } as unknown as APIContext;
    const response = await exportData(context);
    expect(response.status).toBe(401);
  });
});

describe('AC-306 — listEntities has no implicit tenant filter', () => {
  it('@spec:AC-306 listEntities returns every row of the table', async () => {
    const rows = await listEntities<Row>(
      state.db, CONTACTS_TABLE, CONTACTS_SHAPE
    );
    expect(ids(rows)).toEqual(['ct-mine', 'ct-other']);
  });
});

/**
 * `FakeD1` cannot parse the JOINs the SSE scope/messages queries use, and
 * `visibleConversationIds()` runs outside the poller's try/catch — so the real
 * route would throw against it. This double answers exactly the four SSE
 * queries (scoping them to the fixtures' ownership) and delegates everything
 * else — sessions, users — to a real FakeD1, so the cookie path stays honest.
 */
class SseStatement implements PreparedStatement {
  constructor(
    private readonly db: SseDb,
    private readonly sql: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]): PreparedStatement {
    return new SseStatement(this.db, this.sql, values);
  }

  async run(): Promise<unknown> {
    return this.db.delegate(this.sql, this.values).run();
  }

  async first<T = Row>(): Promise<T | null> {
    return this.db.delegate(this.sql, this.values).first<T>();
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.db.rowsFor(this.sql) as unknown as T[] };
  }
}

class SseDb implements Database {
  constructor(private readonly base: FakeD1) {}

  delegate(sql: string, values: unknown[]): PreparedStatement {
    return this.base.prepare(sql).bind(...values);
  }

  rowsFor(sql: string): Row[] {
    if (/JOIN contacts ct/.test(sql)) return [{ id: 'cv-mine' }];
    if (/FROM messages m/.test(sql)) {
      return [{ id: 'm-mine', conversationId: 'cv-mine' }];
    }
    return [];
  }

  prepare(sql: string): PreparedStatement {
    return new SseStatement(this, sql);
  }

  async batch(statements: PreparedStatement[]): Promise<unknown> {
    const results: unknown[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }
}

/**
 * Reads exactly `count` chunks. This stream never closes, so a
 * read-until-`done` loop would hang the suite instead of failing it.
 */
async function readSse(response: Response, count: number): Promise<string> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (let i = 0; i < count; i += 1) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('AC-304/305 — the SSE stream is scoped and cookie-authenticated', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.db = new SseDb(FakeD1.from(fixtures()));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('@spec:AC-304 the stream emits only my conversations messages', async () => {
    const response = await sseEvents(ctx('/api/crm/events'));
    await vi.advanceTimersByTimeAsync(2500);
    const stream = await readSse(response, 2);
    expect(stream).toContain('m-mine');
    expect(stream).not.toContain('m-other');
    expect(stream).toContain('conversationId');
  });

  it('@spec:AC-305 auth comes from the cookie, never from a query token', async () => {
    const withToken = {
      request: new Request(
        'http://localhost/api/crm/events?token=tok-me'
      ),
      params: {},
      locals: {}
    } as unknown as APIContext;
    const denied = await sseEvents(withToken);
    expect(denied.status).toBe(401);

    const response = await sseEvents(ctx('/api/crm/events'));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
