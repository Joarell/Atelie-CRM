import { describe, expect, it, beforeEach } from 'vitest';
import { recordConsent, hasValidConsent, grantConsent } from '../../src/server/consent';
import { readRetentionDays } from '../../src/server/retention';
import { FakeD1 } from '../helpers/fakeD1';

describe('LGPD principles', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = FakeD1.empty();
  });

  it('@principle:P-004 consent is granular per purpose', async () => {
    await recordConsent(db, {
      subjectId: 'user-1',
      subjectType: 'user',
      purposes: ['marketing'],
      lawfulBasis: 'consent',
      status: 'granted',
      ip: '203.0.113.1',
      userAgent: 'test',
      version: '1.0',
      metadata: {}
    });

    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(true);
    expect(await hasValidConsent(db, 'user-1', 'user', 'analytics')).toBe(false);
  });

  it('@principle:P-005 retention windows are configurable', () => {
    const defaults = readRetentionDays({});
    expect(defaults.messages).toBe(365);
    expect(defaults.conversations).toBe(730);

    const custom = readRetentionDays({ RETENTION_MESSAGES_DAYS: '30' });
    expect(custom.messages).toBe(30);
    expect(custom.conversations).toBe(730);
  });

  it('@principle:P-006 data subject rights: consent can be withdrawn', async () => {
    await grantConsent(
      db, 'user-1', 'user', ['marketing'], 'consent',
      '203.0.113.1', 'test'
    );

    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(true);

    const { withdrawConsent } = await import('../../src/server/consent');
    await withdrawConsent(db, 'user-1', 'user', 'marketing');

    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(false);
  });
});
