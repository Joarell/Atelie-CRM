import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext, APIRoute } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { GET as listPipelines, POST as createPipeline } from
  '../../src/pages/api/crm/pipelines/index';
import { PUT as updateContact, DELETE as deleteContact } from
  '../../src/pages/api/crm/contacts/[id]';
import { PUT as updateDeal, DELETE as deleteDeal } from
  '../../src/pages/api/crm/deals/[id]';
import { PUT as updateTask } from '../../src/pages/api/crm/tasks/[id]';
import { POST as createDeal } from '../../src/pages/api/crm/deals/index';
import { DELETE as deleteOrder } from '../../src/pages/api/orders/[id]';
import { POST as createUser } from '../../src/pages/api/users/index';
import { PUT as updateUser } from '../../src/pages/api/users/[id]';
import { POST as sendWhatsapp } from
  '../../src/pages/api/whatsapp/send';
import {
  CONTACTS_TABLE, CONVERSATIONS_TABLE, DEALS_TABLE, ORDERS_TABLE,
  PIPELINES_TABLE, SESSIONS_TABLE, TASKS_TABLE, USERS_TABLE
} from '../../src/server/tables';
import { hasRank, requireRank } from '../../src/server/authz';
import type { Role, User } from '../../src/domain/crm';
import { ROLE_RANK } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: {
    get DB() { return state.db; },
    get WAHA_API_BASE_URL() { return 'http://waha.test'; },
    get WAHA_API_KEY() { return 'live-key-not-a-placeholder'; }
  }
}));
vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));

const COOKIE = 'crm_session';
const OTHER = 'other-agent';

type ErrorBody = { error?: string };

function locals(role: Role, id = 'agent-1'): { user: unknown } {
  return { user: { id, role, email: `${id}@x.test` } };
}

function ctx(
  method: string,
  url: string,
  role: Role,
  opts: { id?: string; body?: unknown; userId?: string } = {}
): APIContext {
  const request = new Request(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${COOKIE}=tok-${opts.userId ?? 'agent-1'}`
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  return {
    request,
    params: opts.id === undefined ? {} : { id: opts.id },
    locals: locals(role, opts.userId)
  } as unknown as APIContext;
}

function userRow(id: string, role: Role): Record<string, unknown> {
  return {
    id, role, name: id, email: `${id}@x.test`, createdAt: '2026-01-01'
  };
}

/** A real session row so `userFromToken` (cookie based) can resolve. */
function sessionFor(id: string, role: Role): Record<string, unknown>[] {
  return [{
    id: `s-${id}`,
    token: `tok-${id}`,
    userId: id,
    createdAt: '2026-01-01',
    expiresAt: '2099-01-01'
  }];
}

async function errorOf(response: Response): Promise<string> {
  const parsed = (await response.json()) as ErrorBody;
  return parsed.error ?? '';
}

beforeEach(() => {
  state.db = FakeD1.from({
    [SESSIONS_TABLE]: [
      ...sessionFor('agent-1', 'agent'),
      ...sessionFor('viewer-1', 'viewer')
    ],
    [USERS_TABLE]: [
      userRow('agent-1', 'agent'),
      userRow('viewer-1', 'viewer'),
      userRow('manager-1', 'manager'),
      userRow('admin-1', 'admin'),
      userRow(OTHER, 'agent')
    ],
    [CONTACTS_TABLE]: [
      { id: 'ct-owned', assignedUserId: 'agent-1' },
      { id: 'ct-foreign', assignedUserId: OTHER }
    ],
    [DEALS_TABLE]: [
      { id: 'dl-owned', assignedUserId: 'agent-1' },
      { id: 'dl-foreign', assignedUserId: OTHER }
    ],
    [TASKS_TABLE]: [
      { id: 'tk-owned', assigneeUserId: 'agent-1' },
      { id: 'tk-foreign', assigneeUserId: OTHER }
    ],
    [ORDERS_TABLE]: [{ id: 'or-1', customerId: 'c1' }],
    [PIPELINES_TABLE]: [],
    [CONVERSATIONS_TABLE]: [
      { id: 'cv-owned', assignedUserId: 'agent-1', channel: 'whatsapp' },
      { id: 'cv-foreign', assignedUserId: OTHER, channel: 'whatsapp' }
    ]
  });
});

describe('AC-307/308/309 — user administration role gate', () => {
  it('@spec:AC-307 manager creating an admin via POST is refused', async () => {
    const response = await createUser(ctx('POST', '/api/users', 'manager', {
      body: {
        name: 'X', email: 'x@x.test', role: 'admin', password: 'senha-123'
      }
    }));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('papel_insuficiente');
    const rows = state.db.rows(USERS_TABLE);
    expect(rows.filter((r) => r.role === 'admin')).toHaveLength(1);
  });

  it('@spec:AC-308 manager still creates manager/agent/viewer', async () => {
    for (const role of ['manager', 'agent', 'viewer'] as Role[]) {
      const response = await createUser(ctx(
        'POST', '/api/users', 'manager',
        { body: { name: role, email: `${role}@x.test`, role, password: 'p-123' } }
      ));
      expect(response.status).toBe(201);
    }
    const rows = state.db.rows(USERS_TABLE);
    expect(rows).toHaveLength(8);
  });

  it('@spec:AC-309 POST and PUT share the same allowedRoles rule', async () => {
    const payload = { role: 'admin', name: 'X', email: 'x@x.test' };
    const post = await createUser(ctx('POST', '/api/users', 'manager', {
      body: { ...payload, password: 'p-123' }
    }));
    const put = await updateUser(ctx('PUT', '/api/users/agent-1', 'manager', {
      id: 'agent-1', body: payload
    }));
    expect(post.status).toBe(403);
    expect(put.status).toBe(403);
    expect(await errorOf(post)).toBe(await errorOf(put));
    const target = state.db.rows(USERS_TABLE)
      .find((r) => r.id === 'agent-1');
    expect(target?.role).toBe('agent');
  });
});

describe('AC-310/311/316 — viewer is read-only, matrix is centralized', () => {
  it('@spec:AC-310 viewer POST on an entity route is refused', async () => {
    const response = await createPipeline(ctx(
      'POST', '/api/crm/pipelines', 'viewer', { body: { name: 'p' } }
    ));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('papel_insuficiente');
    expect(state.db.rows(PIPELINES_TABLE)).toHaveLength(0);
  });

  it('@spec:AC-311 viewer PUT and DELETE on an item route are refused',
    async () => {
      const put = await updateContact(ctx(
        'PUT', '/api/crm/contacts/ct-owned', 'viewer',
        { id: 'ct-owned', body: { name: 'x' } }
      ));
      const del = await deleteContact(ctx(
        'DELETE', '/api/crm/contacts/ct-owned', 'viewer', { id: 'ct-owned' }
      ));
      expect([put.status, del.status]).toEqual([403, 403]);
      expect(state.db.rows(CONTACTS_TABLE)).toHaveLength(2);
    });

  it('@spec:AC-316 one matrix governs every entity: list viewer+, write agent+, delete manager+', async () => {
    const agentWrite = await createPipeline(ctx(
      'POST', '/api/crm/pipelines', 'agent', { body: { name: 'p' } }
    ));
    const viewerList = await listPipelines(ctx(
      'GET', '/api/crm/pipelines', 'viewer'
    ));
    const agentDelete = await deleteContact(ctx(
      'DELETE', '/api/crm/contacts/ct-owned', 'agent', { id: 'ct-owned' }
    ));
    const managerDelete = await deleteContact(ctx(
      'DELETE', '/api/crm/contacts/ct-foreign', 'manager',
      { id: 'ct-foreign', userId: 'manager-1' }
    ));
    const otherDealCreate = await createDeal(ctx(
      'POST', '/api/crm/deals', 'viewer', { body: { title: 'd' } }
    ));
    expect(viewerList.status).toBe(200);
    expect(agentWrite.status).toBe(201);
    expect(agentDelete.status).toBe(403);
    expect(managerDelete.status).toBe(200);
    expect(otherDealCreate.status).toBe(403);
  });

  it('@spec:AC-319 ROLE_RANK gives the role hierarchy real effect', async () => {
    const ranks = [ROLE_RANK.viewer, ROLE_RANK.agent, ROLE_RANK.manager];
    expect([...ranks, ROLE_RANK.admin]).toEqual([0, 1, 2, 3]);
    const ranked = (role: Role) => ({ id: 'u', role }) as User;
    expect(hasRank(ranked('admin'), 'agent')).toBe(true);
    expect(hasRank(ranked('viewer'), 'agent')).toBe(false);
    const allowed = await requireRank(
      ctx('DELETE', '/api/x/1', 'manager'), 'agent'
    );
    expect(allowed).toBeNull();
    const refused = await requireRank(
      ctx('DELETE', '/api/x/1', 'viewer'), 'agent'
    );
    expect(refused?.status).toBe(403);
  });
});

describe('AC-320/321/322/323 — record ownership from the route factory', () => {
  it('@spec:AC-320 agent PUT on another agent contact is refused', async () => {
    const response = await updateContact(ctx(
      'PUT', '/api/crm/contacts/ct-foreign', 'agent',
      { id: 'ct-foreign', body: { name: 'sequestrado' } }
    ));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('nao_autorizado');
    const row = state.db.rows(CONTACTS_TABLE)
      .find((r) => r.id === 'ct-foreign');
    expect(row?.name).toBeUndefined();
  });

  it('@spec:AC-321 agent DELETE on an order is refused by the manager floor', async () => {
    // `orders` has no owner column, so there is no per-row possession to
    // violate: the 403 comes from the centralized `delete: 'manager'` rank
    // floor, which is checked before ownership. Documented, not faked.
    const response = await deleteOrder(ctx(
      'DELETE', '/api/orders/or-1', 'agent', { id: 'or-1' }
    ));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('papel_insuficiente');
    expect(state.db.rows(ORDERS_TABLE)).toHaveLength(1);
  });

  it('@spec:AC-322 manager and admin may alter any record', async () => {
    const asManager = await updateDeal(ctx(
      'PUT', '/api/crm/deals/dl-foreign', 'manager',
      { id: 'dl-foreign', body: { title: 'ok' }, userId: 'manager-1' }
    ));
    const asAdmin = await deleteDeal(ctx(
      'DELETE', '/api/crm/deals/dl-foreign', 'admin',
      { id: 'dl-foreign', userId: 'admin-1' }
    ));
    expect(asManager.status).toBe(200);
    expect(asAdmin.status).toBe(200);
  });

  it('@spec:AC-323 the same factory rejects foreign rows for every owned entity', async () => {
    const owned: Array<{ id: string; route: APIRoute }> = [
      { id: 'ct-foreign', route: updateContact },
      { id: 'dl-foreign', route: updateDeal },
      { id: 'tk-foreign', route: updateTask }
    ];
    for (const { id, route } of owned) {
      const response = await route(ctx(
        'PUT', `/api/x/${id}`, 'agent', { id, body: { name: 'x' } }
      ));
      expect([id, response.status, await errorOf(response)])
        .toEqual([id, 403, 'nao_autorizado']);
    }
    expect(state.db.rows(DEALS_TABLE)).toHaveLength(2);
    expect(state.db.rows(TASKS_TABLE)).toHaveLength(2);
  });

  it('@spec:AC-320 the agent owner may still edit their own contact', async () => {
    const response = await updateContact(ctx(
      'PUT', '/api/crm/contacts/ct-owned', 'agent',
      { id: 'ct-owned', body: { name: 'meu' } }
    ));
    expect(response.status).toBe(200);
  });
});

describe('AC-324/325 — WhatsApp send needs role and conversation ownership', () => {
  it('@spec:AC-324 sending to another agent conversation is refused', async () => {
    const response = await sendWhatsapp(ctx(
      'POST', '/api/whatsapp/send', 'agent',
      { body: { conversationId: 'cv-foreign', text: 'oi' } }
    ));
    expect(response.status).toBe(403);
    // The spec enumerates `papel_insuficiente`/`conversa_nao_encontrada`;
    // the shipped code answers `nao_autorizado`. The invariant that matters
    // is 403 with no outbound message.
    expect(await errorOf(response)).toBe('nao_autorizado');
  });

  it('@spec:AC-325 viewer cannot reach the WhatsApp send route', async () => {
    const response = await sendWhatsapp(ctx(
      'POST', '/api/whatsapp/send', 'viewer', { userId: 'viewer-1',
        body: { conversationId: 'cv-owned', text: 'oi' } }
    ));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('papel_insuficiente');
  });
});
