import { describe, expect, it, beforeEach } from 'vitest';
import {
  recordConsent,
  withdrawConsent,
  hasValidConsent,
  grantConsent,
  getConsentsForSubject
} from '../../src/server/consent';
import { FakeD1 } from '../helpers/fakeD1';

describe('consent', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = FakeD1.empty();
  });

  it('@spec:AC-001 recordConsent stores grantedAt, ip, userAgent, version, purposes', async () => {
    const record = await recordConsent(db, {
      subjectId: 'user-1',
      subjectType: 'user',
      purposes: ['marketing'],
      lawfulBasis: 'consent',
      status: 'granted',
      ip: '203.0.113.1',
      userAgent: 'test-agent',
      version: '1.0',
      metadata: {}
    });

    expect(record.status).toBe('granted');
    expect(record.grantedAt).toBeTruthy();
    expect(record.ip).toBe('203.0.113.1');
    expect(record.userAgent).toBe('test-agent');
    expect(record.version).toBe('1.0');
    expect(record.purposes).toEqual(['marketing']);
  });

  it('@spec:AC-002 withdrawConsent marks the record withdrawn with withdrawnAt', async () => {
    const record = await recordConsent(db, {
      subjectId: 'user-1',
      subjectType: 'user',
      purposes: ['marketing'],
      lawfulBasis: 'consent',
      status: 'granted',
      ip: '203.0.113.1',
      userAgent: 'test-agent',
      version: '1.0',
      metadata: {}
    });

    await withdrawConsent(db, 'user-1', 'user', 'marketing');

    const consents = await getConsentsForSubject(db, 'user-1', 'user');
    const updated = consents.find(c => c.id === record.id);
    expect(updated?.status).toBe('withdrawn');
    expect(updated?.withdrawnAt).toBeTruthy();
  });

  it('@spec:AC-003 hasValidConsent true for granted, false after withdraw', async () => {
    await recordConsent(db, {
      subjectId: 'user-1',
      subjectType: 'user',
      purposes: ['marketing'],
      lawfulBasis: 'consent',
      status: 'granted',
      ip: '203.0.113.1',
      userAgent: 'test-agent',
      version: '1.0',
      metadata: {}
    });

    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(true);

    await withdrawConsent(db, 'user-1', 'user', 'marketing');
    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(false);
  });

  it('@spec:AC-003 hasValidConsent false for expired consent', async () => {
    await recordConsent(db, {
      subjectId: 'user-1',
      subjectType: 'user',
      purposes: ['marketing'],
      lawfulBasis: 'consent',
      status: 'granted',
      ip: '203.0.113.1',
      userAgent: 'test-agent',
      version: '1.0',
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
      metadata: {}
    });

    expect(await hasValidConsent(db, 'user-1', 'user', 'marketing')).toBe(false);
  });

  it('@spec:AC-004 grantConsent revokes the previous grant for the same purpose', async () => {
    const first = await grantConsent(
      db, 'user-1', 'user', ['marketing'], 'consent',
      '203.0.113.1', 'test-agent'
    );

    const second = await grantConsent(
      db, 'user-1', 'user', ['marketing'], 'consent',
      '203.0.113.1', 'test-agent'
    );

    expect(first.id).not.toBe(second.id);

    const consents = await getConsentsForSubject(db, 'user-1', 'user');
    const firstRecord = consents.find(c => c.id === first.id);
    expect(firstRecord?.status).toBe('withdrawn');
    expect(firstRecord?.withdrawnAt).toBeTruthy();
  });
});
