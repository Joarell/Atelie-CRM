import { describe, it, expect, beforeEach } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import {
  applyRetentionPolicies,
  readRetentionDays,
  type RetentionDays
} from '../../src/server/retention';

const DEFAULTS: RetentionDays = {
  messages: 365,
  conversations: 730,
  webhookEvents: 90,
  authAudit: 365,
  actionLogs: 365,
  consents: 2555,
  orders: 2555,
  customers: 2555
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function cell(
  db: FakeD1, table: string, id: string, column: string
): unknown {
  return db.rows(table).find((r) => String(r.id) === id)?.[column];
}

function present(db: FakeD1, table: string, id: string): boolean {
  return db.rows(table).some((r) => String(r.id) === id);
}

async function seed(db: FakeD1): Promise<void> {
  const d = (n: number): string => daysAgo(n);
  await db.execute(
    `INSERT INTO messages
     (id, conversationId, direction, text, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['m-old', 'c-old', 'in', 'muito antigo', 'u1', d(500)]
  );
  await db.execute(
    `INSERT INTO messages
     (id, conversationId, direction, text, createdBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['m-new', 'c-old', 'in', 'recente', 'u1', d(10)]
  );
  await db.execute(
    `INSERT INTO conversations (id, contactId, channelPhone, createdAt)
     VALUES (?, ?, ?, ?)`,
    ['c-old', 'ct-1', '5511999999999', d(900)]
  );
  await db.execute(
    `INSERT INTO webhook_events (id, eventType, receivedAt) VALUES (?, ?, ?)`,
    ['w-old', 'message', d(200)]
  );
  await db.execute(
    `INSERT INTO auth_audit (id, action, createdAt) VALUES (?, ?, ?)`,
    ['a-old', 'login_failed', d(500)]
  );
  await db.execute(
    `INSERT INTO action_logs (id, clientId, userId, action, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    ['l-old', 'c1', 'u1', 'export', d(500)]
  );
  await db.execute(
    `INSERT INTO consents (id, subjectId, subjectType, lawfulBasis, status,
     grantedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    ['k-old-withdrawn', 'ct-1', 'contact', 'consent', 'withdrawn', d(3000)]
  );
  await db.execute(
    `INSERT INTO consents (id, subjectId, subjectType, lawfulBasis, status,
     grantedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    ['k-old-granted', 'ct-1', 'contact', 'consent', 'granted', d(3000)]
  );
}

describe('readRetentionDays', () => {
  it('falls back to the defaults when nothing is configured', () => {
    expect(readRetentionDays({})).toEqual(DEFAULTS);
  });

  it('@spec:AC-014 reads windows from the Worker env', () => {
    const env = {
      RETENTION_MESSAGES_DAYS: '30',
      RETENTION_WEBHOOK_EVENTS_DAYS: '7'
    };
    expect(readRetentionDays(env)).toEqual({
      ...DEFAULTS,
      messages: 30,
      webhookEvents: 7
    });
  });

  it('rejects a nonsensical window instead of wiping the table', () => {
    // The regression: `parseInt` of a missing/bad var produced NaN, and a NaN
    // cutoff silently anonymized or deleted EVERY row.
    for (const bad of [undefined, '', 'abc', '0', '-5']) {
      const days = readRetentionDays({ RETENTION_MESSAGES_DAYS: bad });
      expect(days.messages).toBe(DEFAULTS.messages);
    }
  });
});

describe('applyRetentionPolicies', () => {
  let db: FakeD1;

  beforeEach(async () => {
    db = new FakeD1();
    await seed(db);
  });

  it('@spec:AC-009 anonymizes old messages but keeps recent ones', async () => {
    const report = await applyRetentionPolicies(db, DEFAULTS);
    expect(report.errors).toEqual([]);
    // m-old (500d, past the 365d window) plus c-old (900d, past 730d).
    expect(report.anonymized).toBe(2);
    expect(cell(db, 'messages', 'm-old', 'text')).toBe(
      '[Anonimizado por política de retenção]'
    );
    expect(cell(db, 'messages', 'm-new', 'text')).toBe('recente');
  });

  it('honours a shorter window than the default', async () => {
    await applyRetentionPolicies(db, { ...DEFAULTS, messages: 5 });
    expect(cell(db, 'messages', 'm-new', 'text')).toBe(
      '[Anonimizado por política de retenção]'
    );
  });

  it('@spec:AC-010 anonymizes the phone of old conversations only', async () => {
    await applyRetentionPolicies(db, DEFAULTS);
    expect(cell(db, 'conversations', 'c-old', 'channelPhone')).toBe('[Anonimizado]');
  });

  it('@spec:AC-011 deletes expired webhook events, audit logs and action logs', async () => {
    const report = await applyRetentionPolicies(db, DEFAULTS);
    // three log tables plus the one withdrawn consent.
    expect(report.deleted).toBe(4);
    expect(present(db, 'webhook_events', 'w-old')).toBe(false);
    expect(present(db, 'auth_audit', 'a-old')).toBe(false);
    expect(present(db, 'action_logs', 'l-old')).toBe(false);
  });

  it('@spec:AC-012 deletes old auth_audit and action_logs', async () => {
    await applyRetentionPolicies(db, DEFAULTS);
    expect(present(db, 'auth_audit', 'a-old')).toBe(false);
    expect(present(db, 'action_logs', 'l-old')).toBe(false);
  });

  it('@spec:AC-013 deletes a withdrawn consent but never a granted one', async () => {
    await applyRetentionPolicies(db, DEFAULTS);
    expect(present(db, 'consents', 'k-old-withdrawn')).toBe(false);
    expect(present(db, 'consents', 'k-old-granted')).toBe(true);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await applyRetentionPolicies(db, DEFAULTS);
    const second = await applyRetentionPolicies(db, DEFAULTS);
    expect(second.anonymized).toBe(0);
    expect(second.deleted).toBe(0);
  });
});
