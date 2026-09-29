import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PWA_CACHE_SHELL,
  PWA_MANIFEST_PATH,
  PWA_PRECACHE_URLS,
  PWA_SW_PATH
} from '../../src/domain/pwa';

const SW_SOURCE = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8'
);

const SELF_ORIGIN = 'https://app.example.test';

interface FakeCache {
  store: Map<string, Response>;
  match(req: unknown, opts?: { ignoreSearch?: boolean }): Promise<Response | undefined>;
  put(req: unknown, res: Response): Promise<void>;
  addAll(urls: string[]): Promise<void>;
}

interface FakeCaches {
  opened: Map<string, FakeCache>;
  open(name: string): Promise<FakeCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

interface FakeEvent {
  waitUntil?: (p: Promise<unknown>) => void;
  respondWith?: (p: Promise<unknown> | unknown) => void;
  request?: { url: string; method: string; mode: string };
  data?: unknown;
}

interface Harness {
  self: {
    skipWaiting: ReturnType<typeof vi.fn>;
    clients: { claim: ReturnType<typeof vi.fn> };
  };
  caches: FakeCaches;
  fetch: ReturnType<typeof vi.fn>;
  handlers: Record<string, Array<(e: FakeEvent) => void>>;
  fire(type: string, event: FakeEvent): Promise<unknown>;
}

function keyOf(raw: string): string {
  return new URL(raw, `${SELF_ORIGIN}${raw.startsWith('/') ? '' : '/'}`).pathname;
}

function makeCache(): FakeCache {
  return {
    store: new Map(),
    async match(req, opts) {
      const raw = typeof req === 'string' ? req : (req as { url: string }).url;
      const key = opts?.ignoreSearch
        ? keyOf(raw.split('?')[0])
        : keyOf(raw);
      return this.store.get(key);
    },
    async put(req, res) {
      const raw = typeof req === 'string' ? req : (req as { url: string }).url;
      this.store.set(keyOf(raw), res.clone());
    },
    async addAll(urls) {
      for (const single of urls) {
        this.store.set(keyOf(single), makeResponse('offline-shell', 200));
      }
    }
  };
}

function makeCaches(): FakeCaches {
  const opened = new Map<string, FakeCache>();
  return {
    opened,
    async open(name) {
      let cache = opened.get(name);
      if (!cache) {
        cache = makeCache();
        opened.set(name, cache);
      }
      return cache;
    },
    async keys() {
      return [...opened.keys()];
    },
    async delete(name) {
      return opened.delete(name);
    }
  };
}

function makeResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function buildHarness(): Harness {
  const self = {
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: SELF_ORIGIN }
  };
  const handlers: Record<string, Array<(e: FakeEvent) => void>> = {};
  const boundSelf = {
    ...self,
    addEventListener(type: string, fn: (e: FakeEvent) => void) {
      handlers[type] = handlers[type] ?? [];
      handlers[type].push(fn);
    }
  };
  const fetch = vi.fn();
  const caches = makeCaches();
  const factory = new Function('self', 'caches', 'fetch', 'URL', SW_SOURCE);
  factory(boundSelf, caches, fetch, URL);

  const fire = (type: string, event: FakeEvent): Promise<unknown> => {
    const promises: Array<Promise<unknown>> = [];
    event.waitUntil = (p) => promises.push(p);
    for (const handler of handlers[type] ?? []) {
      const maybe = handler(event) as unknown;
      if (maybe instanceof Promise) promises.push(maybe as Promise<unknown>);
    }
    return Promise.all(promises);
  };

  return {
    self: { skipWaiting: self.skipWaiting, clients: self.clients },
    caches,
    fetch,
    handlers,
    fire
  };
}

describe('service worker contract (executes public/sw.js)', () => {
  it('registers the browser lifecycle hooks', () => {
    const harness = buildHarness();
    expect(Object.keys(harness.handlers).sort()).toEqual([
      'activate',
      'fetch',
      'install',
      'message'
    ]);
  });

  it('strings up the same cache the domain constants pin', () => {
    expect(SW_SOURCE).toContain(PWA_CACHE_SHELL);
    expect(SW_SOURCE).toContain('manifest.webmanifest');
    expect(SW_SOURCE).toContain('favicon.svg');
    for (const path of PWA_PRECACHE_URLS) {
      expect(SW_SOURCE).toContain(`'${path}'`);
    }
  });

  it('precaches the shell then skips waiting on install', async () => {
    const harness = buildHarness();
    await harness.fire('install', {});
    await harness.fire('activate', {});
    const cacheName = [...harness.caches.opened.keys()][0];
    expect(cacheName).toBe(PWA_CACHE_SHELL);
    const shell = harness.caches.opened.get(PWA_CACHE_SHELL)!;
    expect([...shell.store.keys()].sort()).toEqual(
      [...PWA_PRECACHE_URLS].sort()
    );
    expect(harness.self.skipWaiting).toHaveBeenCalled();
  });

  it('deletes stale caches and claims clients on activate', async () => {
    const harness = buildHarness();
    const stale = makeCache();
    stale.store.set('/', makeResponse('old-shell', 200));
    harness.caches.opened.set('deskcomm-shell-ancient', stale);
    await harness.fire('install', {});
    await harness.fire('activate', {});
    expect(harness.caches.opened.has('deskcomm-shell-ancient')).toBe(false);
    expect(harness.self.clients.claim).toHaveBeenCalled();
  });

  it('leaves cross-origin and non-GET requests alone', async () => {
    const harness = buildHarness();
    const foreign: FakeEvent = {
      request: {
        url: 'https://evil.example/x',
        method: 'GET',
        mode: 'cors'
      },
      respondWith: undefined
    };
    await harness.fire('fetch', foreign as FakeEvent);
    expect(foreign.respondWith).toBeUndefined();

    const post: FakeEvent = {
      request: {
        url: `${SELF_ORIGIN}/api/x`,
        method: 'POST',
        mode: 'cors'
      },
      respondWith: undefined
    };
    await harness.fire('fetch', post as FakeEvent);
    expect(post.respondWith).toBeUndefined();
  });

  it('serves the precached shell for navigations when offline', async () => {
    const harness = buildHarness();
    await harness.fire('install', {});
    harness.fetch.mockRejectedValueOnce(new Error('offline'));
    const nav: FakeEvent = {
      request: { url: `${SELF_ORIGIN}/`, method: 'GET', mode: 'navigate' },
      respondWith: vi.fn()
    };
    await harness.fire('fetch', nav);
    const res = await (nav.respondWith as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(await res.text()).toBe('offline-shell');
  });

  it('prefers network for navigations but re-caches the fresh shell', async () => {
    const harness = buildHarness();
    await harness.fire('install', {});
    harness.fetch.mockResolvedValueOnce(makeResponse('fresh-shell', 200));
    const nav: FakeEvent = {
      request: { url: `${SELF_ORIGIN}/`, method: 'GET', mode: 'navigate' },
      respondWith: vi.fn()
    };
    await harness.fire('fetch', nav);
    const res = await (nav.respondWith as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(await res.text()).toBe('fresh-shell');
    const shell = harness.caches.opened.get(PWA_CACHE_SHELL)!;
    const cached = await shell.match('/');
    expect(await cached?.text()).toBe('fresh-shell');
  });

  it('never intercepts /api/ traffic', async () => {
    const harness = buildHarness();
    await harness.fire('install', {});
    const api: FakeEvent = {
      request: {
        url: `${SELF_ORIGIN}/api/inbox`,
        method: 'GET',
        mode: 'cors'
      },
      respondWith: undefined
    };
    await harness.fire('fetch', api as FakeEvent);
    expect(api.respondWith).toBeUndefined();
  });

  it('answers SKIP_WAITING messages', async () => {
    const harness = buildHarness();
    await harness.fire('message', { data: { type: 'SKIP_WAITING' } });
    expect(harness.self.skipWaiting).toHaveBeenCalled();
  });
});

describe('worker asset addresses', () => {
  it('aliases the files the manifest and precache enum point at', () => {
    expect(PWA_SW_PATH).toBe('/sw.js');
    expect(PWA_MANIFEST_PATH).toBe('/manifest.webmanifest');
    for (const path of PWA_PRECACHE_URLS) {
      expect(SW_SOURCE).toContain(`'${path}'`);
      expect(SW_SOURCE).toContain(PWA_CACHE_SHELL);
    }
  });
});