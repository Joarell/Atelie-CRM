import { describe, it, expect } from 'vitest';
import { json, notFound } from '../../src/server/http';

describe('json', () => {
  it('returns a 200 application/json response', async () => {
    const response = json({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('supports a custom status', () => {
    expect(json({ problem: true }, 400).status).toBe(400);
  });
});

describe('notFound', () => {
  it('returns 404 with an error body', async () => {
    const response = notFound();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('accepts a custom message', async () => {
    const response = notFound('Missing');
    expect(await response.json()).toEqual({ error: 'Missing' });
  });
});