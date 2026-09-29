import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiAuthRepository } from '../../src/repositories/ApiAuthRepository';
import type { User } from '../../src/domain/crm';

const admin: User = {
  id: 'u1', name: 'Administrador', email: 'admin@deskcomm.local',
  passwordHash: 'x', role: 'admin', createdAt: '2026-01-01T00:00:00Z'
};

const TOKEN = 'tok-123';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))));
}

function stubLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear()
  });
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiAuthRepository', () => {
  it('is not authenticated before any login', () => {
    const auth = new ApiAuthRepository();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.currentUser()).toBeNull();
  });

  it('login() stores the token and user', async () => {
    stubFetch((url, init) => {
      expect(url).toBe('/api/auth/login');
      expect(init?.method).toBe('POST');
      return jsonResponse({ token: TOKEN, user: admin });
    });
    const auth = new ApiAuthRepository();
    const user = await auth.login('admin@deskcomm.local', 'admin123');
    expect(user.id).toBe('u1');
    expect(auth.token()).toBe(TOKEN);
    expect(auth.isAuthenticated()).toBe(true);
    expect(JSON.parse(localStorage.getItem('crm_user') as string).email).toBe('admin@deskcomm.local');
  });

  it('login() propagates the API error message', async () => {
    stubFetch(() => jsonResponse({ error: 'credenciais_invalidas' }, 401));
    const auth = new ApiAuthRepository();
    await expect(auth.login('x@x.com', 'nope')).rejects.toThrow('credenciais_invalidas');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('load() without a token keeps the session empty', async () => {
    const auth = new ApiAuthRepository();
    await auth.load();
    expect(auth.currentUser()).toBeNull();
  });

  it('load() refreshes the user from /api/auth/me with a Bearer header', async () => {
    localStorage.setItem('crm_token', TOKEN);
    stubFetch((url, init) => {
      expect(url).toBe('/api/auth/me');
      const headers = init?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe(`Bearer ${TOKEN}`);
      return jsonResponse(admin);
    });
    const auth = new ApiAuthRepository();
    await auth.load();
    expect(auth.currentUser()?.email).toBe('admin@deskcomm.local');
  });

  it('load() clears the session when /me rejects', async () => {
    localStorage.setItem('crm_token', TOKEN);
    localStorage.setItem('crm_user', JSON.stringify(admin));
    stubFetch(() => jsonResponse({ error: 'sessao_invalida' }, 404));
    const auth = new ApiAuthRepository();
    await auth.load();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('logout() posts and clears both storage keys', async () => {
    localStorage.setItem('crm_token', TOKEN);
    localStorage.setItem('crm_user', JSON.stringify(admin));
    let posted = false;
    stubFetch((url, init) => {
      posted = url === '/api/auth/logout' && init?.method === 'POST';
      return jsonResponse({ ok: true });
    });
    const auth = new ApiAuthRepository();
    await auth.logout();
    expect(posted).toBe(true);
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });

  it('subscribe() notifies listeners on login/logout', async () => {
    stubFetch(() => jsonResponse({ token: TOKEN, user: admin }));
    const auth = new ApiAuthRepository();
    let calls = 0;
    const unsubscribe = auth.subscribe(() => { calls += 1; });
    await auth.login('a@a.com', 'pw');
    await auth.logout();
    expect(calls).toBe(2);
    unsubscribe();
    await auth.login('a@a.com', 'pw');
    expect(calls).toBe(2);
  });
});