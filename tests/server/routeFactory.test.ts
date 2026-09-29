import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import { createCollectionRoutes, createItemRoutes } from '../../src/server/routeFactory';
import { ORDERS_SHAPE } from '../../src/server/tables';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

const { GET, POST } = createCollectionRoutes('orders', ORDERS_SHAPE);
const { PUT, DELETE } = createItemRoutes('orders', ORDERS_SHAPE);

const order = {
  id: 'o1',
  customerId: 'c1',
  customerName: 'Ana',
  lines: [{ productId: 'cake', productName: 'Bolo', qty: 2, unitPrice: 40 }],
  deliveryDate: '2026-09-20',
  status: 'pendente',
  paymentStatus: 'a_pagar',
  notes: '',
  stockDeducted: false,
  createdAt: '2026-09-17T10:00:00Z'
};

function endpoint(params: { id?: string } = {}): APIContext {
  return { request: new Request('http://localhost/api/orders'), params } as unknown as APIContext;
}

function postRequest(body: unknown): APIContext {
  return {
    request: new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    params: {}
  } as unknown as APIContext;
}

function itemContext(request: Request, id: string): APIContext {
  return { request, params: { id } } as unknown as APIContext;
}

describe('createCollectionRoutes', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  it('GET lists rows as entities', async () => {
    state.db = FakeD1.with('orders', [order]);
    const response = await GET(endpoint());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([{ ...order, lines: expect.any(Array), stockDeducted: false }]);
  });

  it('GET returns an empty array when there are no rows', async () => {
    const response = await GET(endpoint());
    expect(await response.json()).toEqual([]);
  });

  it('POST inserts the entity and replies 201', async () => {
    const response = await POST(postRequest(order));
    expect(response.status).toBe(201);
    expect(((await response.json()) as { id: string }).id).toBe('o1');
    expect(state.db.rows('orders')).toHaveLength(1);
  });

  it('POST persists and GET returns the inbox createdFrom flag', async () => {
    const inboxOrder = { ...order, id: 'o-inbox', createdFrom: 'inbox' };
    const post = await POST(postRequest(inboxOrder));
    expect(post.status).toBe(201);
    const got = await GET(endpoint());
    const rows = (await got.json()) as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.id === 'o-inbox'))
      .toMatchObject({ createdFrom: 'inbox' });
  });

  it('GET defaults createdFrom when the row has no flag', async () => {
    const plainOrder = { ...order, id: 'o-plain', createdFrom: '' };
    state.db = FakeD1.with('orders', [plainOrder]);
    const got = await GET(endpoint());
    const rows = (await got.json()) as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.id === 'o-plain'))
      .toMatchObject({ createdFrom: '' });
  });
});

describe('createItemRoutes', () => {
  beforeEach(() => {
    state.db = FakeD1.empty();
  });

  it('PUT merges the patch and returns the saved entity', async () => {
    state.db = FakeD1.with('orders', [order]);
    const update = new Request('http://localhost/api/orders/o1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pronto' })
    });
    const put = await PUT(itemContext(update, 'o1'));
    expect(put.status).toBe(200);
    const saved = (await put.json()) as { status: string; stockDeducted: boolean };
    expect(saved.status).toBe('pronto');
    expect(saved.stockDeducted).toBe(false);
  });

  it('PUT replies 404 for a missing id', async () => {
    const update = new Request('http://localhost/api/orders/nope', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pronto' })
    });
    const response = await PUT(itemContext(update, 'nope'));
    expect(response.status).toBe(404);
  });

  it('DELETE removes the row and replies ok', async () => {
    state.db = FakeD1.with('orders', [order]);
    const del = new Request('http://localhost/api/orders/o1', { method: 'DELETE' });
    const response = await DELETE(itemContext(del, 'o1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.db.rows('orders')).toHaveLength(0);
  });

  it('DELETE is a no-op for a missing id', async () => {
    const del = new Request('http://localhost/api/orders/nope', { method: 'DELETE' });
    const response = await DELETE(itemContext(del, 'nope'));
    expect(response.status).toBe(200);
  });
});