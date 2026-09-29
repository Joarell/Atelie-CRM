import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import { ACTION_LOGS_TABLE } from '../../src/server/tables';
import { newActionLogEntry, recordActionLog, getClientIdFromRequest, TraceAction, TraceActionSync } from '../../src/server/tracing';
import { UserActions } from '../../src/server/userActions';
import type { RequestHeaders } from '../../src/server/audit';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

function makeRequest(headers: Record<string, string> = {}): RequestHeaders {
  return { headers: new Headers(headers) };
}

function seedDb(): FakeD1 {
  return new FakeD1(new Map([[ACTION_LOGS_TABLE, []]]));
}

describe('tracing.ts - Action Log core functions', () => {
  beforeEach(() => { state.db = seedDb(); });

  it('creates a new action log entry with all fields', () => {
    const entry = newActionLogEntry('client-1', 'user-1', 'login', 'User logged in', { ip: '1.2.3.4' }, '1.2.3.4');
    expect(entry.id).toBeTruthy();
    expect(entry.clientId).toBe('client-1');
    expect(entry.userId).toBe('user-1');
    expect(entry.action).toBe('login');
    expect(entry.detail).toBe('User logged in');
    expect(entry.metadata).toEqual({ ip: '1.2.3.4' });
    expect(entry.ip).toBe('1.2.3.4');
    expect(entry.createdAt).toBeTruthy();
  });

  it('records an action log to the database', async () => {
    const entry = newActionLogEntry('client-1', 'user-1', 'test_action', 'Test detail', {}, '1.2.3.4');
    await recordActionLog(state.db, entry);
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].clientId).toBe('client-1');
    expect(rows[0].action).toBe('test_action');
    expect(rows[0].metadata).toBe('{}');
  });

  it('extracts client id from x-client-id header', () => {
    const req = makeRequest({ 'x-client-id': 'client-42' });
    expect(getClientIdFromRequest(req)).toBe('client-42');
  });

  it('returns default client id when header is missing', () => {
    const req = makeRequest({});
    expect(getClientIdFromRequest(req)).toBe('default');
  });
});

describe('userActions.ts - UserActions class', () => {
  beforeEach(() => { state.db = seedDb(); });

  it('records a login action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogin(req, 'user-1', true, '');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('login');
    expect(rows[0].detail).toBe('User logged in');
  });

  it('records a failed login action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogin(req, 'user-1', false, 'invalid password');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].detail).toBe('Login failed: invalid password');
    expect(JSON.parse(rows[0].metadata as string)).toEqual({ success: false });
  });

  it('records a logout action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogout(req, 'user-1');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('logout');
    expect(rows[0].detail).toBe('User logged out');
  });

  it('records a password change action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordPasswordChange(req, 'user-1', true, '');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('password_change');
    expect(rows[0].detail).toBe('Password changed successfully');
  });

  it('records an order creation action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordOrderCreate(req, 'user-1', 'order-123', 15000);
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('order_create');
    expect(rows[0].detail).toBe('Order order-123 created with total 15000');
    expect(JSON.parse(rows[0].metadata as string)).toEqual({ orderId: 'order-123', orderTotal: 15000 });
  });

  it('records an order status update action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordOrderStatusUpdate(req, 'user-1', 'order-123', 'delivered');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('order_status_update');
    expect(rows[0].detail).toBe('Order order-123 status changed to delivered');
    expect(JSON.parse(rows[0].metadata as string)).toEqual({ orderId: 'order-123', newStatus: 'delivered' });
  });

  it('records a contact creation action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordContactCreate(req, 'user-1', 'contact-456', 'John Doe');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('contact_create');
    expect(rows[0].detail).toBe('Contact John Doe (contact-456) created');
    expect(JSON.parse(rows[0].metadata as string)).toEqual({ contactId: 'contact-456', contactName: 'John Doe' });
  });

  it('records a message sent action', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordMessageSent(req, 'user-1', 'conv-789', 'Hello world');
    const rows = state.db.rows(ACTION_LOGS_TABLE);
    expect(rows[0].action).toBe('message_sent');
    expect(rows[0].detail).toBe('Message sent to conversation conv-789');
    expect(JSON.parse(rows[0].metadata as string)).toEqual({ conversationId: 'conv-789', messageLength: 11 });
  });

  it('queries actions by user', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogin(req, 'user-1', true);
    await ua.recordLogout(req, 'user-1');
    await ua.recordLogin(req, 'user-2', true);
    const actions = await ua.getUserActions('client-1', 'user-1');
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.userId === 'user-1')).toBe(true);
  });

  it('queries all actions for a client', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogin(req, 'user-1', true);
    await ua.recordLogin(req, 'user-2', true);
    const actions = await ua.getClientActions('client-1');
    expect(actions).toHaveLength(2);
  });

  it('queries actions by type', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    await ua.recordLogin(req, 'user-1', true);
    await ua.recordLogout(req, 'user-1');
    const logins = await ua.getActionsByType('client-1', 'login');
    const logouts = await ua.getActionsByType('client-1', 'logout');
    expect(logins).toHaveLength(1);
    expect(logouts).toHaveLength(1);
    expect(logins[0].action).toBe('login');
    expect(logouts[0].action).toBe('logout');
  });

  it('respects limit and offset', async () => {
    const ua = new UserActions(state.db);
    const req = makeRequest({ 'x-client-id': 'client-1' });
    for (let i = 0; i < 5; i++) {
      await ua.recordLogin(req, `user-${i}`, true);
    }
    const firstPage = await ua.getClientActions('client-1', 2, 0);
    const secondPage = await ua.getClientActions('client-1', 2, 2);
    expect(firstPage).toHaveLength(2);
    expect(secondPage).toHaveLength(2);
    expect(firstPage[0].id).not.toBe(secondPage[0].id);
  });
});

describe('TraceAction decorator', () => {
  beforeEach(() => { state.db = seedDb(); });

  it('is exported', () => {
    expect(typeof TraceAction).toBe('function');
    expect(typeof TraceActionSync).toBe('function');
  });
});