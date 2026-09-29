import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiRepository } from '../../src/repositories/ApiRepository';

type Item = { id: string; name: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    return Promise.resolve(handler(String(input), init));
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiRepository', () => {
  let items: Item[];

  beforeEach(() => {
    items = [{ id: 'i1', name: 'Farinha' }];
  });

  it('load() hydrates the cache from GET', async () => {
    stubFetch((url) => jsonResponse(url.includes('/api/items') ? items : { error: 1 }, 200));
    const repo = new ApiRepository<Item>('/api/items');
    await repo.load();
    expect(repo.getAll()).toEqual(items);
  });

  it('load() keeps the cache empty when the response is not ok', async () => {
    stubFetch(() => jsonResponse(null, 500));
    const repo = new ApiRepository<Item>('/api/items');
    await repo.load();
    expect(repo.getAll()).toEqual([]);
  });

  it('add() POSTs and appends the saved item', async () => {
    stubFetch((url, init) =>
      init?.method === 'POST'
        ? jsonResponse({ id: 'i2', name: 'Açúcar' }, 201)
        : jsonResponse(null, 404)
    );
    const repo = new ApiRepository<Item>('/api/items');
    repo['items'] = items;
    const saved = await repo.add({ id: 'i2', name: 'Açúcar' });
    expect(saved).toEqual({ id: 'i2', name: 'Açúcar' });
    expect(repo.getAll().map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('update() PUTs and replaces the cached item', async () => {
    stubFetch((_url, init) =>
      init?.method === 'PUT'
        ? jsonResponse({ id: 'i1', name: 'Farinha Integral' })
        : jsonResponse(null, 404)
    );
    const repo = new ApiRepository<Item>('/api/items');
    repo['items'] = items;
    const saved = await repo.update('i1', { name: 'Farinha Integral' });
    expect(saved).toEqual({ id: 'i1', name: 'Farinha Integral' });
    expect(repo.getById('i1')?.name).toBe('Farinha Integral');
  });

  it('update() returns undefined when the server rejects', async () => {
    stubFetch(() => jsonResponse(null, 404));
    const repo = new ApiRepository<Item>('/api/items');
    repo['items'] = items;
    expect(await repo.update('i1', { name: 'x' })).toBeUndefined();
    expect(repo.getById('i1')?.name).toBe('Farinha');
  });

  it('remove() DELETEs and drops the item from the cache', async () => {
    stubFetch((_url, init) => (init?.method === 'DELETE' ? jsonResponse(null, 200) : jsonResponse(null, 404)));
    const repo = new ApiRepository<Item>('/api/items');
    repo['items'] = items;
    await repo.remove('i1');
    expect(repo.getAll()).toEqual([]);
    expect(repo.getById('i1')).toBeUndefined();
  });

  it('getById returns copies from the cache', () => {
    const repo = new ApiRepository<Item>('/api/items');
    repo['items'] = items;
    expect(repo.getById('i1')).toEqual({ id: 'i1', name: 'Farinha' });
    expect(repo.getById('nope')).toBeUndefined();
  });

  it('sends the bearer token on load when a token callback is provided', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(jsonResponse(items, 200));
    }));
    const repo = new ApiRepository<Item>('/api/items', () => 'tok123');
    await repo.load();
    expect((captured?.headers as Headers).get('Authorization')).toBe('Bearer tok123');
  });

  it('sends the bearer token on add when a token callback is provided', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(jsonResponse({ id: 'i2', name: 'Açúcar' }, 201));
    }));
    const repo = new ApiRepository<Item>('/api/items', () => 'tok123');
    await repo.add({ id: 'i2', name: 'Açúcar' });
    expect((captured?.headers as Headers).get('Authorization')).toBe('Bearer tok123');
  });

  it('sends the bearer token on remove when a token callback is provided', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(jsonResponse(null, 200));
    }));
    const repo = new ApiRepository<Item>('/api/items', () => 'tok123');
    await repo.remove('i1');
    expect((captured?.headers as Headers).get('Authorization')).toBe('Bearer tok123');
  });

  it('subscribe notifies listeners on each mutation', async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST' ? jsonResponse({ id: 'i2', name: 'Açúcar' }, 201) : jsonResponse([], 200)
    );
    const repo = new ApiRepository<Item>('/api/items');
    let notified = 0;
    repo.subscribe(() => { notified += 1; });
    await repo.add({ id: 'i2', name: 'Açúcar' });
    expect(notified).toBe(1);
    const unsubscribe = repo.subscribe(() => { notified += 1; });
    await repo.add({ id: 'i3', name: 'Leite' });
    expect(notified).toBe(3);
    unsubscribe();
    await repo.add({ id: 'i4', name: 'Ovo' });
    expect(notified).toBe(4);
  });
});