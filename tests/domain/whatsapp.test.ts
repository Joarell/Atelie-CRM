import { describe, it, expect } from 'vitest';
import {
  WAHA_DETAIL_CREDENTIAL_REFUSED,
  WAHA_DETAIL_NOT_CONFIGURED,
  WAHA_DETAIL_SESSION_NOT_FOUND,
  WAHA_DETAIL_SESSION_NOT_WORKING,
  WAHA_DETAIL_UNREACHABLE,
  WAHA_HEALTHY_STATUS,
  WAHA_QR_MAX_LENGTH,
  describeWahaServer,
  parseWahaSession,
  toWahaHealth,
  wahaQrDataUrl,
  type WahaHealthInput
} from '../../src/domain/whatsapp';

const identity = { version: '2026.7.2', engine: 'NOWEB', tier: 'CORE', multipleSessions: 'supported' as const };

function input(patch: Partial<WahaHealthInput>): WahaHealthInput {
  return {
    configured: true,
    reachable: true,
    authenticated: true,
    identity,
    session: { name: 'default', status: WAHA_HEALTHY_STATUS },
    ...patch
  };
}

describe('describeWahaServer — measured capability, not commercial inference', () => {
  it('marks 2026.7.2 CORE/NOWEB as supported', () => {
    expect(describeWahaServer({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE', apiKey: 'secret' })).toEqual({
      version: '2026.7.2',
      engine: 'NOWEB',
      tier: 'CORE',
      multipleSessions: 'supported'
    });
  });

  it.each([
    { version: '2026.7.3', engine: 'NOWEB', tier: 'CORE' },
    { version: '2026.7.2', engine: 'WEBJS', tier: 'PLUS' },
    { version: 'future', tier: 'CORE' },
    null
  ])('leaves unmeasured identity unknown: %j', (value) => {
    expect(describeWahaServer(value).multipleSessions).toBe('unknown');
  });

  it('never echoes a credential field it did not ask for', () => {
    const described = describeWahaServer({ version: '2026.7.2', engine: 'NOWEB', apiKey: 'secret' });
    expect(JSON.stringify(described)).not.toContain('secret');
  });

  it('caps the version at 100 chars and drops an over-long value to unknown', () => {
    const described = describeWahaServer({ version: 'v'.repeat(101), engine: 'NOWEB' });
    expect(described).toEqual({ version: null, engine: 'NOWEB', tier: null, multipleSessions: 'unknown' });
  });

  it('caps the engine at 100 chars the same way', () => {
    const described = describeWahaServer({ version: '2026.7.2', engine: 'e'.repeat(101) });
    expect(described.engine).toBeNull();
    expect(described.multipleSessions).toBe('unknown');
  });

  it('accepts exactly-100-char fields', () => {
    const described = describeWahaServer({ version: '2026.7.2', engine: 'e'.repeat(100) });
    expect(described.engine).toBe('e'.repeat(100));
  });
});

describe('parseWahaSession', () => {
  it('parses name + status', () => {
    expect(parseWahaSession({ name: 'default', status: 'SCAN_QR_CODE', extra: 1 })).toEqual({
      name: 'default',
      status: 'SCAN_QR_CODE'
    });
  });

  it('keeps the QR when present', () => {
    expect(parseWahaSession({ name: 'default', status: 'SCAN_QR_CODE', qr: 'data:image/png;base64,AAA' })?.qr)
      .toBe('data:image/png;base64,AAA');
  });

  it('allows a full-size QR image, not just traces', () => {
    const qr = 'data:image/png;base64,' + 'A'.repeat(9000);
    expect(parseWahaSession({ name: 'default', status: 'SCAN_QR_CODE', qr })?.qr)
      .toBe(qr);
  });

  it.each([null, {}, { name: 'default' }, { status: 'WORKING' }, { name: '', status: 'WORKING' }])(
    'returns null for an incomplete snapshot: %j',
    (value) => {
      expect(parseWahaSession(value)).toBeNull();
    }
  );
});

describe('toWahaHealth — one source of truth for the connection report', () => {
  it('is healthy only when configured, reachable, authenticated and WORKING', () => {
    expect(toWahaHealth(input({}))).toMatchObject({ healthy: true, detail: null });
  });

  it('maps "not configured" without claiming unreachable', () => {
    expect(toWahaHealth(input({ configured: false, reachable: false, authenticated: false })).detail)
      .toBe(WAHA_DETAIL_NOT_CONFIGURED);
  });

  it('separates a dead transport from a refused credential', () => {
    expect(toWahaHealth(input({ reachable: false, authenticated: false })).detail).toBe(WAHA_DETAIL_UNREACHABLE);
    expect(toWahaHealth(input({ authenticated: false })).detail).toBe(WAHA_DETAIL_CREDENTIAL_REFUSED);
  });

  it('distinguishes a missing session from a session that is down', () => {
    expect(toWahaHealth(input({ session: null })).detail).toBe(WAHA_DETAIL_SESSION_NOT_FOUND);
    expect(toWahaHealth(input({ session: { name: 'default', status: 'STOPPED' } })).detail)
      .toBe(`${WAHA_DETAIL_SESSION_NOT_WORKING}: STOPPED`);
  });

  it('exposes identity facts and the session summary, dropping the QR', () => {
    const health = toWahaHealth(input({ session: { name: 'default', status: 'WORKING', qr: 'secret' } }));
    expect(health).toMatchObject({ version: '2026.7.2', engine: 'NOWEB', tier: 'CORE' });
    expect(health.session).toEqual({ name: 'default', status: 'WORKING' });
    expect(JSON.stringify(health)).not.toContain('secret');
  });
});

describe('wahaQrDataUrl', () => {
  it('builds a bounded data URL from the engine payload', () => {
    expect(wahaQrDataUrl({ mimetype: 'image/png', data: 'aGk=' })).toBe(
      'data:image/png;base64,aGk='
    );
  });

  it('returns null for a payload without a full image', () => {
    expect(wahaQrDataUrl(null)).toBeNull();
    expect(wahaQrDataUrl({ mimetype: 'image/png' })).toBeNull();
    expect(wahaQrDataUrl({ data: 'aGk=' })).toBeNull();
    expect(wahaQrDataUrl({ mimetype: 'image/png', data: '' })).toBeNull();
  });

  it('rejects an oversized QR instead of dragging MBs into the DOM', () => {
    const big = 'a'.repeat(WAHA_QR_MAX_LENGTH + 1);
    expect(wahaQrDataUrl({ mimetype: 'image/png', data: big })).toBeNull();
  });
});
