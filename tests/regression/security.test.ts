// @vitest-environment happy-dom
// Regression tests: Prevent known bugs from reoccurring
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword } from '../../src/server/auth';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE,
  CUSTOMERS_TABLE,
  CONTACTS_TABLE,
  CONVERSATIONS_TABLE,
  MESSAGES_TABLE
} from '../../src/server/tables';
import type { User, Contact, Conversation } from '../../src/domain/crm';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { POST as changePasswordPost } from '../../src/pages/api/auth/change-password';
import { POST as logoutPost } from '../../src/pages/api/auth/logout';
import { GET as meGet } from '../../src/pages/api/auth/me';
import { GET as customersGet, POST as customersPost } from '../../src/pages/api/customers/index';
import { GET as contactsGet, POST as contactsPost } from '../../src/pages/api/crm/contacts/index';
import { GET as conversationsGet, POST as conversationsPost } from '../../src/pages/api/crm/conversations/index';
import { userFromToken, purgeExpiredSessions, revokeOtherSessions, deleteSessionsForUser } from '../../src/server/auth';
import { verifyPassword } from '../../src/server/auth';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

// Os gates por papel leem `locals.user.role`: um usuario sem papel reprova em
// toda escrita, entao o contexto precisa declarar um papel real.
function apiContext(request: Request, params: Record<string, string> = {}): APIContext {
  return {
    request,
    params,
    locals: { user: { id: 'test-user', role: 'admin' } }
  } as unknown as APIContext;
}

function jsonBody(data: unknown, token?: string): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { method: 'POST', headers, body: JSON.stringify(data) };
}

async function createTestUser(db: FakeD1, email: string, password: string): Promise<{ user: User; token: string }> {
  const { hash, salt } = await hashPassword(password);
  const user: User = {
    id: `user-${Date.now()}`,
    name: 'Test User',
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  await db.prepare(`INSERT INTO ${USERS_TABLE} (id, name, email, passwordHash, passwordSalt, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(user.id, user.name, user.email, user.passwordHash, user.passwordSalt, user.role, user.createdAt).run();
  
  const loginResponse = await loginPost(apiContext(new Request('http://localhost/api/auth/login', jsonBody({ email, password }))));
  expect(loginResponse.status).toBe(200);
  // A sessao volta num cookie HttpOnly, entao o corpo traz so o usuario publico.
  const loginData = await loginResponse.json() as { user: User };
  expect(loginData).not.toHaveProperty('token');
  // O token e' lido da linha criada, nao do header: o `Headers` do happy-dom
  // (ambiente deste arquivo) nao expoe `set-cookie` via get().
  const sessions = db.rows(SESSIONS_TABLE);
  expect(sessions).toHaveLength(1);
  return { user, token: sessions[0].token as string };
}

describe('Regression: Auth security fixes', () => {
  beforeEach(async () => {
    state.db = FakeD1.empty();
  });

  it('REGR-001: login purges expired sessions before creating new one', async () => {
    const { hash, salt } = await hashPassword('password123');
    const user: User = {
      id: 'regr-user-1',
      name: 'Regr User',
      email: 'regr@test.com',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      createdAt: '2026-01-01T00:00:00Z'
    };
    await state.db.prepare(`INSERT INTO ${USERS_TABLE} (id, name, email, passwordHash, passwordSalt, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(user.id, user.name, user.email, user.passwordHash, user.passwordSalt, user.role, user.createdAt).run();
    
    // Add expired session
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('expired-token', user.id, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z').run();
    
    // Login should purge expired session
    const loginResponse = await loginPost(apiContext(new Request('http://localhost/api/auth/login', jsonBody({ email: 'regr@test.com', password: 'password123' }))));
    expect(loginResponse.status).toBe(200);
    
    const sessions = state.db.rows(SESSIONS_TABLE);
    expect(sessions.find(s => s.token === 'expired-token')).toBeUndefined();
    expect(sessions).toHaveLength(1);
  });

  it('REGR-002: change password revokes other sessions but keeps current', async () => {
    const { token, user } = await createTestUser(state.db, 'regr2@test.com', 'oldpassword');
    
    // Create additional sessions for same user
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('other-session-1', user.id, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('other-session-2', user.id, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    
    // Change password
    const changeResponse = await changePasswordPost(apiContext(new Request('http://localhost/api/auth/change-password', jsonBody({
      currentPassword: 'oldpassword',
      newPassword: 'newpassword123'
    }, token))));
    expect(changeResponse.status).toBe(200);
    
    // Current session should remain, others revoked
    const sessions = state.db.rows(SESSIONS_TABLE);
    expect(sessions.find(s => s.token === token)).toBeTruthy();
    expect(sessions.find(s => s.token === 'other-session-1')).toBeUndefined();
    expect(sessions.find(s => s.token === 'other-session-2')).toBeUndefined();
  });

  it('REGR-004: cross-origin requests blocked by CSRF protection', async () => {
    const { hash, salt } = await hashPassword('password123');
    const user: User = {
      id: 'regr-user-4',
      name: 'Regr User 4',
      email: 'regr4@test.com',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      createdAt: '2026-01-01T00:00:00Z'
    };
    await state.db.prepare(`INSERT INTO ${USERS_TABLE} (id, name, email, passwordHash, passwordSalt, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(user.id, user.name, user.email, user.passwordHash, user.passwordSalt, user.role, user.createdAt).run();
    
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'regr4@test.com', password: 'password123' })
    });
    // Origin header is forbidden, set it via headers.set()
    (request.headers as any).set('Origin', 'https://evil.example');
    
    const context = { request } as unknown as APIContext;
    const response = await loginPost(context);
    expect(response.status).toBe(403);
  });

  it('REGR-005: session token not exposed in user response', async () => {
    const { token } = await createTestUser(state.db, 'regr5@test.com', 'password123');
    
    const meResponse = await meGet(apiContext(new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })));
    const meData = await meResponse.json() as User;
    expect(meData).not.toHaveProperty('passwordHash');
    expect(meData).not.toHaveProperty('passwordSalt');
    expect(meData).not.toHaveProperty('token');
  });

  it('REGR-006: purgeExpiredSessions only removes expired', async () => {
    const now = Date.now();
    const future = new Date(now + 86400000).toISOString();
    const past = new Date(now - 86400000).toISOString();
    
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('live-token', 'user-1', new Date().toISOString(), future).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('expired-token', 'user-1', new Date(now - 172800000).toISOString(), past).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('other-user-token', 'user-2', new Date().toISOString(), future).run();
    
    await purgeExpiredSessions(state.db);
    
    const sessions = state.db.rows(SESSIONS_TABLE).map(s => s.token);
    expect(sessions).toContain('live-token');
    expect(sessions).toContain('other-user-token');
    expect(sessions).not.toContain('expired-token');
  });

  it('REGR-007: revokeOtherSessions keeps except token', async () => {
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('keep-me', 'user-1', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('revoke-me', 'user-1', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('other-user', 'user-2', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    
    await revokeOtherSessions(state.db, 'user-1', 'keep-me');
    
    const sessions = state.db.rows(SESSIONS_TABLE).map(s => s.token);
    expect(sessions).toContain('keep-me');
    expect(sessions).not.toContain('revoke-me');
    expect(sessions).toContain('other-user');
  });

  it('REGR-008: deleteSessionsForUser only deletes target user sessions', async () => {
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('target-1', 'target-user', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('target-2', 'target-user', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    await state.db.prepare(`INSERT INTO ${SESSIONS_TABLE} (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind('other-1', 'other-user', new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()).run();
    
    await deleteSessionsForUser(state.db, 'target-user');
    
    const sessions = state.db.rows(SESSIONS_TABLE).map(s => s.token);
    expect(sessions).not.toContain('target-1');
    expect(sessions).not.toContain('target-2');
    expect(sessions).toContain('other-1');
  });
});

describe('Regression: Data integrity', () => {
  beforeEach(async () => {
    state.db = FakeD1.empty();
  });

  it('REGR-009: customer phone/email not required but stored correctly', async () => {
    const { token } = await createTestUser(state.db, 'regr9@test.com', 'password123');
    
    const response = await customersPost(apiContext(new Request('http://localhost/api/customers', jsonBody({
      name: 'No Phone Email'
    }, token))));
    expect(response.status).toBe(201);
    const customer = await response.json() as { phone: string; email: string };
    expect(customer.phone).toBe('');
    expect(customer.email).toBe('');
  });

  it('REGR-010: contact tags stored as JSON array', async () => {
    const { token } = await createTestUser(state.db, 'regr10@test.com', 'password123');
    
    const response = await contactsPost(apiContext(new Request('http://localhost/api/crm/contacts', jsonBody({
      name: 'Tag Test',
      phone: '11900000000',
      tags: ['tag1', 'tag2', 'tag3']
    }, token))));
    expect(response.status).toBe(201);
    const contact = await response.json() as Contact;
    expect(Array.isArray(contact.tags)).toBe(true);
    expect(contact.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('REGR-011: conversation status defaults to open', async () => {
    const { token } = await createTestUser(state.db, 'regr11@test.com', 'password123');
    
    const contactResponse = await contactsPost(apiContext(new Request('http://localhost/api/crm/contacts', jsonBody({
      name: 'Conv Test',
      phone: '11911112222'
    }, token))));
    const contact = await contactResponse.json() as Contact;
    
    const convResponse = await conversationsPost(apiContext(new Request('http://localhost/api/crm/conversations', jsonBody({
      contactId: contact.id,
      channel: 'whatsapp',
      channelPhone: contact.phone
    }, token))));
    expect(convResponse.status).toBe(201);
    const conversation = await convResponse.json() as Conversation;
    expect(conversation.status).toBe('open');
    expect(conversation.snoozedUntil).toBe('');
  });

  it('REGR-012: message direction stored correctly', async () => {
    const { token } = await createTestUser(state.db, 'regr12@test.com', 'password123');
    
    const contactResponse = await contactsPost(apiContext(new Request('http://localhost/api/crm/contacts', jsonBody({
      name: 'Msg Test',
      phone: '11933334444'
    }, token))));
    const contact = await contactResponse.json() as Contact;
    
    const convResponse = await conversationsPost(apiContext(new Request('http://localhost/api/crm/conversations', jsonBody({
      contactId: contact.id,
      channel: 'whatsapp',
      channelPhone: contact.phone
    }, token))));
    const conversation = await convResponse.json() as Conversation;
    
    // Inbound message
    const inboundResponse = await state.db.prepare(`INSERT INTO ${MESSAGES_TABLE} (id, conversationId, direction, text, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind('msg-in', conversation.id, 'inbound', 'Hello', contact.id, new Date().toISOString()).run();
    
    // Outbound message
    const outboundResponse = await state.db.prepare(`INSERT INTO ${MESSAGES_TABLE} (id, conversationId, direction, text, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind('msg-out', conversation.id, 'outbound', 'Hi there', 'user-id', new Date().toISOString()).run();
    
    const messages = state.db.rows(MESSAGES_TABLE);
    expect(messages.find(m => m.id === 'msg-in')?.direction).toBe('inbound');
    expect(messages.find(m => m.id === 'msg-out')?.direction).toBe('outbound');
  });
});

describe('Regression: Password hashing', () => {
  beforeEach(async () => {
    state.db = FakeD1.empty();
  });

  it('REGR-013: password hash uses per-user salt', async () => {
    const { hash: hash1, salt: salt1 } = await hashPassword('samepassword');
    const { hash: hash2, salt: salt2 } = await hashPassword('samepassword');
    
    // Same password should produce different hashes due to different salts
    expect(salt1).not.toBe(salt2);
    expect(hash1).not.toBe(hash2);
  });

  it('REGR-014: verifyPassword works with correct credentials', async () => {
    const { hash, salt } = await hashPassword('mypassword123');
    const valid = await verifyPassword('mypassword123', hash, salt);
    expect(valid).toBe(true);
  });

  it('REGR-015: verifyPassword rejects wrong password', async () => {
    const { hash, salt } = await hashPassword('mypassword123');
    const valid = await verifyPassword('wrongpassword', hash, salt);
    expect(valid).toBe(false);
  });

  it('REGR-016: verifyPassword rejects wrong salt', async () => {
    const { hash, salt } = await hashPassword('mypassword123');
    const { salt: salt2 } = await hashPassword('mypassword123');
    const valid = await verifyPassword('mypassword123', hash, salt2);
    expect(valid).toBe(false);
  });
});