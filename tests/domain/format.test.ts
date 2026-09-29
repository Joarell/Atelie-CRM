// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { formatBRL, formatNumber, formatDate, todayISO, nowISO, uid, escapeHtml } from '../../src/domain/format';

describe('formatBRL', () => {
  it('formats zero', () => {
    expect(formatBRL(0)).toBe('R$\u00A00,00');
  });

  it('formats a whole number', () => {
    expect(formatBRL(100)).toBe('R$\u00A0100,00');
  });

  it('formats thousands with separators', () => {
    expect(formatBRL(1234.5)).toBe('R$\u00A01.234,50');
  });

  it('formats negative values', () => {
    expect(formatBRL(-25.1)).toBe('-R$\u00A025,10');
  });

  it('rounds to two decimals', () => {
    expect(formatBRL(0.105)).toBe('R$\u00A00,11');
  });
});

describe('formatNumber', () => {
  it('defaults to one decimal', () => {
    expect(formatNumber(2.34)).toBe('2,3');
  });

  it('respects the digit count', () => {
    expect(formatNumber(2.345, 2)).toBe('2,35');
    expect(formatNumber(1234, 0)).toBe('1.234');
  });
});

describe('formatDate', () => {
  it('formats ISO dates as dd/mm/yyyy', () => {
    expect(formatDate('2026-09-17')).toBe('17/09/2026');
  });

  it('shows an em dash for empty input', () => {
    expect(formatDate('')).toBe('—');
  });
});

describe('todayISO / nowISO', () => {
  it('todayISO matches YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nowISO is a full ISO datetime', () => {
    const iso = nowISO();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(iso.startsWith(todayISO())).toBe(true);
  });
});

describe('uid', () => {
  it('generates a UUID v4', () => {
    expect(uid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uid()));
    expect(ids.size).toBe(1000);
  });
});

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<b>"x" & <i>y</i></b>')).toBe('&lt;b&gt;"x" &amp; &lt;i&gt;y&lt;/i&gt;&lt;/b&gt;');
  });

  it('keeps plain text untouched', () => {
    expect(escapeHtml('Hello, world')).toBe('Hello, world');
  });

  it('handles null-ish input as empty string', () => {
    expect(escapeHtml('' as unknown as string)).toBe('');
  });
});