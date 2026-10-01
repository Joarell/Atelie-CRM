import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword, newSession } from '../../src/server/auth';
import {
  USERS_TABLE, SESSIONS_TABLE, CONTACTS_TABLE, CONVERSATIONS_TABLE,
  MESSAGES_TABLE, DEALS_TABLE, TASKS_TABLE, CONSENT_TABLE
} from '../../src/server/tables';
import type { User } from '../../src/domain/crm';

const TOKEN = 'lgpd-rights-token';
const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));

vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));

vi.mock('../../src/server/auth', () => ({
  userFromToken: vi.fn(),
  userFromTokenString: vi.fn(),
  hashPassword: vi.fn(),
  newSession: vi.fn(),
  publicUser: (u: Record<string, unknown>) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt
  })
}));

import { userFromToken } from '../../src/server/auth';
import { GET as exportGet } from '../../src/pages/api/me/export';
import { GET as dataGet } from '../../src/pages/api/me/data';
import { DELETE as eraseDelete } from '../../src/pages/api/me/erase';

function ctx(path: string): { request: Request } {
  return { request: new Request(`http://localhost${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }) };
}

async function dbWithUser(): Promise<FakeD1> {
  const user: User = {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'hash',
    role: 'agent',
    createdAt: '2026-01-01T00:00:00Z'
  };
  const session = { token: TOKEN, userId: 'u1', createdAt: '2026-01-01T00:00:00Z' };
  return FakeD1.from({
    [USERS_TABLE]: [user as unknown as Record<string, unknown>],
    [SESSIONS_TABLE]: [session as unknown as Record<string, unknown>],
    [CONTACTS_TABLE]: [
      { id: 'c1', name: 'Maria', phone: '+5511999998888', email: 'maria@x.com', notes: '', tags: [], assignedUserId: 'u1', createdAt: '2026-01-01T00:00:00Z' }
    ],
    [CONVERSATIONS_TABLE]: [
      { id: 'cv1', contactId: 'c1', channel: 'whatsapp', channelPhone: '+5511999998888', lastMessageAt: '2026-01-01T00:00:00Z', assignedUserId: 'u1', status: 'open', snoozedUntil: '', createdAt: '2026-01-01T00:00:00Z' }
    ],
    [MESSAGES_TABLE]: [
      { id: 'm1', conversationId: 'cv1', direction: 'in', text: 'oi', fromMe: false, createdAt: '2026-01-01T00:00:00Z' }
    ],
    [DEALS_TABLE]: [
      { id: 'd1', pipelineId: 'p1', stageId: 's1', contactId: 'c1', title: 'Deal', valueCents: 10000, status: 'open', lostReason: '', nextActionAt: '', assignedUserId: 'u1', createdAt: '2026-01-01T00:00:00Z' }
    ],
    [TASKS_TABLE]: [
      { id: 't1', title: 'Task', done: false, dueAt: '', assigneeUserId: 'u1', contactId: 'c1', createdAt: '2026-01-01T00:00:00Z' }
    ],
    [CONSENT_TABLE]: [
      { id: 'k1', subjectId: 'u1', subjectType: 'user', purposes: ['marketing'], lawfulBasis: 'consent', status: 'granted', grantedAt: '2026-01-01T00:00:00Z', version: '1.0', metadata: {} }
    ]
  });
}

describe('lgpd rights', () => {
  beforeEach(async () => {
    state.db = await dbWithUser();
    vi.mocked(userFromToken).mockResolvedValue({
      id: 'u1', name: 'Test User', email: 'test@example.com',
      passwordHash: 'hash', role: 'agent',
      createdAt: '2026-01-01T00:00:00Z'
    } as User);
  });

  it('@spec:AC-020 export returns all user data in JSON', async () => {
    const res = await exportGet(ctx('/api/me/export') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.profile).toBeTruthy();
    expect(data.contacts).toHaveLength(1);
    expect(data.conversations).toHaveLength(1);
    expect(data.messages).toHaveLength(1);
    expect(data.deals).toHaveLength(1);
    expect(data.tasks).toHaveLength(1);
    expect(data.consents).toHaveLength(1);
    expect(data.exportedAt).toBeTruthy();
  });

  it('@spec:AC-021 erase anonymizes contacts/messages/deals/tasks and deletes account', async () => {
    const res = await eraseDelete(ctx('/api/me/erase') as never);
    expect(res.status).toBe(200);

    const contacts = state.db.rows(CONTACTS_TABLE);
    expect(contacts[0].name).toContain('Anonimizado');
    expect(contacts[0].phone).toBe('');

    const messages = state.db.rows(MESSAGES_TABLE);
    expect(messages[0].text).toContain('Anonimizado');

    const deals = state.db.rows(DEALS_TABLE);
    expect(deals[0].title).toBe('[Anonimizado]');

    const tasks = state.db.rows(TASKS_TABLE);
    expect(tasks[0].title).toBe('[Anonimizado]');

    expect(state.db.rows(USERS_TABLE)).toHaveLength(0);
    expect(state.db.rows(SESSIONS_TABLE)).toHaveLength(0);
  });

  it('@spec:AC-135 data.ts filters contacts exactly once', () => {
    const source = readFileSync(
      new URL('../../src/pages/api/me/data.ts', import.meta.url),
      'utf8'
    );
    const contactFilters = source.match(/all\.contacts\.filter/g) ?? [];
    expect(contactFilters).toHaveLength(1);
  });

  it('@spec:AC-136 data.ts recorte is identical to the export recorte', async () => {
    const dataRes = await dataGet(ctx('/api/me/data') as never);
    expect(dataRes.status).toBe(200);
    const data = await dataRes.json() as Record<string, unknown>;

    const exportRes = await exportGet(ctx('/api/me/export') as never);
    const exported = await exportRes.json() as Record<string, unknown>;

    for (const key of [
      'contacts', 'conversations', 'messages', 'deals', 'tasks',
      'customers', 'orders', 'consents', 'formatVersion'
    ]) {
      expect(data[key]).toEqual(exported[key]);
    }
    expect(data.contacts).toHaveLength(1);
    expect(data.conversations).toHaveLength(1);
  });

  it('@spec:AC-022 erase is audited with data_erasure_request', async () => {
    const { recordAudit } = await import('../../src/server/audit');
    const spy = vi.spyOn(await import('../../src/server/audit'), 'recordAudit');

    await eraseDelete(ctx('/api/me/erase') as never);

    expect(spy).toHaveBeenCalled();
    const entry = spy.mock.calls[0][1] as { action: string };
    expect(entry.action).toBe('data_erasure_request');
    spy.mockRestore();
  });
});
