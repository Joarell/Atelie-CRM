// @vitest-environment happy-dom
// Integration tests: Full API route flows with database
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { hashPassword } from '../../src/server/auth';
import {
  USERS_TABLE,
  CUSTOMERS_TABLE,
  ORDERS_TABLE,
  CONTACTS_TABLE,
  CONVERSATIONS_TABLE,
  MESSAGES_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE
} from '../../src/server/tables';
import type { User } from '../../src/domain/crm';
import type { Customer, Order } from '../../src/domain/types';
import type { Contact, Conversation, Message } from '../../src/domain/crm';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { POST as logoutPost } from '../../src/pages/api/auth/logout';
import { GET as meGet } from '../../src/pages/api/auth/me';
import { GET as customersGet, POST as customersPost } from '../../src/pages/api/customers/index';
import { PUT as customersPut, DELETE as customersDelete } from '../../src/pages/api/customers/[id]';
import { GET as ordersGet, POST as ordersPost } from '../../src/pages/api/orders/index';
import { GET as contactsGet, POST as contactsPost } from '../../src/pages/api/crm/contacts/index';
import { GET as conversationsGet, POST as conversationsPost } from '../../src/pages/api/crm/conversations/index';
import { GET as messagesGet, POST as messagesPost } from '../../src/pages/api/crm/messages/index';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

function apiContext(request: Request, params: Record<string, string> = {}): APIContext {
  return { request, params, locals: { user: { id: 'test-user' } } } as unknown as APIContext;
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
  const loginData = await loginResponse.json() as { token: string; user: User };
  return { user, token: loginData.token };
}

describe('Integration: Auth + CRUD flows', () => {
  beforeEach(async () => {
    state.db = FakeD1.empty();
  });

  it('full user lifecycle: register -> login -> me -> logout', async () => {
    const { token } = await createTestUser(state.db, 'integration@test.com', 'password123');
    
    // GET /api/auth/me
    const meResponse = await meGet(apiContext(new Request('http://localhost/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })));
    expect(meResponse.status).toBe(200);
    const meData = await meResponse.json() as User;
    expect(meData.email).toBe('integration@test.com');
    expect(meData).not.toHaveProperty('passwordHash');
    
    // POST /api/auth/logout
    const logoutResponse = await logoutPost(apiContext(new Request('http://localhost/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })));
    expect(logoutResponse.status).toBe(200);
    
    // Verify session deleted
    const sessions = state.db.rows(SESSIONS_TABLE);
    expect(sessions).toHaveLength(0);
    
    // Verify audit log
    const audits = state.db.rows(AUTH_AUDIT_TABLE);
    expect(audits.some(a => a.action === 'login_ok')).toBe(true);
    expect(audits.some(a => a.action === 'logout')).toBe(true);
  });

  it('customer CRUD: create -> read -> update -> delete', async () => {
    const { token } = await createTestUser(state.db, 'crm@test.com', 'password123');
    
    // CREATE customer
    const createResponse = await customersPost(apiContext(new Request('http://localhost/api/customers', jsonBody({
      name: 'João Silva',
      phone: '11987654321',
      email: 'joao@email.com',
      notes: 'Cliente VIP'
    }, token))));
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as Customer;
    expect(created.name).toBe('João Silva');
    const customerId = created.id;
    
    // Debug: check if customer exists in DB
    const dbCustomers = state.db.rows(CUSTOMERS_TABLE);
    console.log('DB customers after create:', dbCustomers);
    
    // READ customers
    const listResponse = await customersGet(apiContext(new Request('http://localhost/api/customers', { headers: { Authorization: `Bearer ${token}` } })));
    expect(listResponse.status).toBe(200);
    const customers = await listResponse.json() as Customer[];
    expect(customers).toHaveLength(1);
    
    // UPDATE customer
    const updateResponse = await customersPut(apiContext(new Request(`http://localhost/api/customers/${customerId}`, jsonBody({
      name: 'João Santos',
      phone: '11987654321',
      email: 'joao.santos@email.com'
    }, token)), { id: customerId }));
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json() as Customer;
    expect(updated.name).toBe('João Santos');
    
    // DELETE customer
    const deleteResponse = await customersDelete(apiContext(new Request(`http://localhost/api/customers/${customerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }), { id: customerId }));
    expect(deleteResponse.status).toBe(200);
    
    // Verify deleted
    const finalList = await customersGet(apiContext(new Request('http://localhost/api/customers', { headers: { Authorization: `Bearer ${token}` } })));
    const finalCustomers = await finalList.json() as Customer[];
    expect(finalCustomers).toHaveLength(0);
  });

  it('order flow: customer -> order -> list', async () => {
    const { token } = await createTestUser(state.db, 'orders@test.com', 'password123');
    
    // Create customer first
    const custResponse = await customersPost(apiContext(new Request('http://localhost/api/customers', jsonBody({
      name: 'Maria Oliveira',
      phone: '11999998888',
      email: 'maria@email.com'
    }, token))));
    const customer = await custResponse.json() as Customer;
    
    // Create order
    const orderResponse = await ordersPost(apiContext(new Request('http://localhost/api/orders', jsonBody({
      customerId: customer.id,
      customerName: customer.name,
      lines: [{ productId: 'prod-1', productName: 'Bolo', qty: 2, unitPrice: 5000 }],
      deliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      status: 'pendente',
      paymentStatus: 'a_pagar'
    }, token))));
    expect(orderResponse.status).toBe(201);
    const order = await orderResponse.json() as Order;
    expect(order.customerId).toBe(customer.id);
    expect(order.lines).toHaveLength(1);
    
    // List orders
    const listResponse = await ordersGet(apiContext(new Request('http://localhost/api/orders', { headers: { Authorization: `Bearer ${token}` } })));
    const orders = await listResponse.json() as Order[];
    expect(orders).toHaveLength(1);
  });

  it('CRM contact + conversation + message flow', async () => {
    const { token } = await createTestUser(state.db, 'crm-flow@test.com', 'password123');
    
    // Create contact
    const contactResponse = await contactsPost(apiContext(new Request('http://localhost/api/crm/contacts', jsonBody({
      name: 'Carlos Lima',
      phone: '11977776666',
      email: 'carlos@email.com',
      tags: ['lead', 'whatsapp']
    }, token))));
    expect(contactResponse.status).toBe(201);
    const contact = await contactResponse.json() as Contact;
    
    // Create conversation
    const convResponse = await conversationsPost(apiContext(new Request('http://localhost/api/crm/conversations', jsonBody({
      contactId: contact.id,
      channel: 'whatsapp',
      channelPhone: contact.phone,
      status: 'open'
    }, token))));
    expect(convResponse.status).toBe(201);
    const conversation = await convResponse.json() as Conversation;
    
    // Create message
    const msgResponse = await messagesPost(apiContext(new Request('http://localhost/api/crm/messages', jsonBody({
      conversationId: conversation.id,
      direction: 'inbound',
      text: 'Olá, gostaria de fazer um pedido',
      createdBy: contact.id
    }, token))));
    expect(msgResponse.status).toBe(201);
    const message = await msgResponse.json() as Message;
    expect(message.text).toBe('Olá, gostaria de fazer um pedido');
    
    // Note: lastMessageAt is updated by CrmService.sendMessage, not raw API route
    // This test verifies the raw API creates the message correctly
  });
});