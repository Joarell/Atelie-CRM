import { describe, expect, it, vi } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import type { Database } from '../../src/server/db';
import { runRetention } from '../../src/server/retentionCron';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function insertMessage(db: FakeD1, id: string, text: string, ageDays: number) {
  return db.execute(
    `INSERT INTO messages (id, conversationId, direction, text, createdBy,
     createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, 'c1', 'in', text, 'u1', daysAgo(ageDays)]
  );
}

const ANONYMIZED = '[Anonimizado por política de retenção]';

describe('runRetention', () => {
  it('@spec:AC-015 applies the policies to the database in the env', async () => {
    const db = new FakeD1();
    await insertMessage(db, 'm-old', 'antigo', 500);
    await runRetention(db, {});
    expect(db.rows('messages')[0].text).toBe(ANONYMIZED);
  });

  it('reads the retention windows from the env', async () => {
    const db = new FakeD1();
    await insertMessage(db, 'm-new', 'recente', 10);
    await runRetention(db, { RETENTION_MESSAGES_DAYS: '5' });
    expect(db.rows('messages')[0].text).toBe(ANONYMIZED);
  });

  it('keeps the default window when the env does not set one', async () => {
    const db = new FakeD1();
    await insertMessage(db, 'm-new', 'recente', 10);
    await runRetention(db, {});
    expect(db.rows('messages')[0].text).toBe('recente');
  });

  it('reports a failing policy instead of throwing', async () => {
    // A D1 that fails on every statement must not take the Worker down: the
    // policies collect the error and the run only logs it.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = { prepare: () => {
      throw new Error('d1 indisponivel');
    } };
    await expect(runRetention(db as unknown as Database, {}))
      .resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
