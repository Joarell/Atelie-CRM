import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiSettingsRepository } from '../../src/repositories/ApiSettingsRepository';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function stubFetch(handler: (init?: RequestInit) => Response): void {
  vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return Promise.resolve(handler(init));
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiSettingsRepository', () => {
  it('starts from the defaults', () => {
    const repo = new ApiSettingsRepository('/api/settings');
    expect(repo.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('get() returns a defensive copy', () => {
    const repo = new ApiSettingsRepository('/api/settings');
    const first = repo.get();
    first.salary = 9999;
    expect(repo.get().salary).toBe(DEFAULT_SETTINGS.salary);
  });

  it('load() replaces the value from GET', async () => {
    const stored: Settings = { ...DEFAULT_SETTINGS, salary: 3000, rent: 1200 };
    stubFetch(() => jsonResponse(stored));
    const repo = new ApiSettingsRepository('/api/settings');
    await repo.load();
    expect(repo.get().salary).toBe(3000);
    expect(repo.get().rent).toBe(1200);
  });

  it('load() keeps defaults when GET fails', async () => {
    stubFetch(() => jsonResponse(null, 500));
    const repo = new ApiSettingsRepository('/api/settings');
    await repo.load();
    expect(repo.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('update() sends a PUT and stores the server reply', async () => {
    const merged: Settings = { ...DEFAULT_SETTINGS, salary: 2500 };
    stubFetch((init) => (init?.method === 'PUT' ? jsonResponse(merged) : jsonResponse(null, 404)));
    const repo = new ApiSettingsRepository('/api/settings');
    const saved = await repo.update({ salary: 2500 });
    expect(saved.salary).toBe(2500);
    expect(repo.get().salary).toBe(2500);
  });

  it('update() falls back to a local merge when the server rejects', async () => {
    stubFetch(() => jsonResponse(null, 500));
    const repo = new ApiSettingsRepository('/api/settings');
    const saved = await repo.update({ salary: 2500 });
    expect(saved.salary).toBe(2500);
    expect(repo.get().salary).toBe(2500);
    expect(repo.get().daysPerMonth).toBe(DEFAULT_SETTINGS.daysPerMonth);
  });

  it('notifies subscribers on load and update', async () => {
    stubFetch((init) =>
      init?.method === 'PUT' ? jsonResponse({ ...DEFAULT_SETTINGS, salary: 2500 }) : jsonResponse(DEFAULT_SETTINGS)
    );
    const repo = new ApiSettingsRepository('/api/settings');
    let notified = 0;
    repo.subscribe(() => { notified += 1; });
    await repo.load();
    await repo.update({ salary: 2500 });
    expect(notified).toBe(2);
  });
});