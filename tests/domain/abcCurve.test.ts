import { describe, expect, it } from 'vitest';
import type { Order, OrderStatus } from '../../src/domain/types';
import {
  ABC_A_TO,
  ABC_B_TO,
  ABC_CLIENT_LABELS,
  ABC_LABELS,
  ABC_ORDER,
  abcClassForCum,
  abcCurve,
  clientAbcClass
} from '../../src/domain/abcCurve';

function order(
  id: string, value: number, createdAt = '2026-01-15T10:00:00.000Z'
): Order {
  return {
    id, customerId: 'c', customerName: 'Ana Beatriz',
    lines: value
      ? [{ productId: 'p', productName: 'Bolo de casamento (2 andares)',
          qty: 1, unitPrice: value }]
      : [],
    deliveryDate: '2026-01-01', status: 'entregue' as OrderStatus,
    paymentStatus: 'a_pagar', notes: '', stockDeducted: false, createdAt
  };
}

describe('abc curve classification', () => {
  it('exposes the 80/95 thresholds, class order and labels', () => {
    expect(ABC_A_TO).toBe(80);
    expect(ABC_B_TO).toBe(95);
    expect(ABC_ORDER).toEqual(['A', 'B', 'C']);
    expect(ABC_LABELS.A).toContain('80%');
    expect(ABC_LABELS.C).toContain('5%');
  });

  it('labels client tiers per ABC class', () => {
    expect(ABC_CLIENT_LABELS.A).toBe('Cliente A');
    expect(ABC_CLIENT_LABELS.B).toBe('Cliente B');
    expect(ABC_CLIENT_LABELS.C).toBe('Cliente C');
  });

  it('maps cumulative share to A/B/C classes', () => {
    expect(abcClassForCum(0)).toBe('A');
    expect(abcClassForCum(80)).toBe('A');
    expect(abcClassForCum(80.01)).toBe('B');
    expect(abcClassForCum(95)).toBe('B');
    expect(abcClassForCum(95.01)).toBe('C');
    expect(abcClassForCum(100)).toBe('C');
  });

  it('ranks a lone order as class A even at 100%', () => {
    expect(abcClassForCum(100, true)).toBe('A');
  });
});

describe('abc curve aggregation', () => {
  it('returns an empty result for no orders', () => {
    expect(abcCurve([])).toEqual({ total: 0, count: 0, points: [] });
  });

  it('drops zero-value orders from the ranking', () => {
    const result = abcCurve([order('a', 0), order('b', 80)]);
    expect(result.count).toBe(1);
    expect(result.total).toBe(80);
    expect(result.points.map((p) => p.key)).toEqual(['b']);
  });

  it('ranks orders by value and folds the cumulative share', () => {
    const result = abcCurve([
      order('small', 50),
      order('big', 800),
      order('mid', 150)
    ]);
    expect(result.total).toBe(1000);
    expect(result.count).toBe(3);
    const [a, b, c] = result.points;
    expect(a.key).toBe('big');
    expect(a.share).toBeCloseTo(80, 5);
    expect(a.cumPct).toBeCloseTo(80, 5);
    expect(a.itemPct).toBeCloseTo(33.33, 2);
    expect(a.abcClass).toBe('A');
    expect(b.cumPct).toBeCloseTo(95, 5);
    expect(b.abcClass).toBe('B');
    expect(c.cumPct).toBeCloseTo(100, 5);
    expect(c.abcClass).toBe('C');
  });

  it('breaks value ties by createdAt, newest first', () => {
    const result = abcCurve([
      order('old', 100, '2026-01-01T10:00:00.000Z'),
      order('new', 100, '2026-02-01T10:00:00.000Z')
    ]);
    expect(result.points.map((p) => p.key)).toEqual(['new', 'old']);
  });

  it('carries the item text, short label and date on each point', () => {
    const point = abcCurve([order('x', 100)]).points[0];
    expect(point.label).toBe('1× Bolo de casamento (2 andares)');
    expect(point.short).toBe('1× Bolo de casamento (2 andares)');
    expect(point.date).toBe('2026-01-15');
  });

  it('splits a classic 80/15/5 spread into clean classes', () => {
    const result = abcCurve([
      order('p5', 50), order('p3', 150), order('p4', 5),
      order('p1', 800), order('p2', 5)
    ]);
    expect(result.points.map((p) => p.abcClass))
      .toEqual(['A', 'B', 'C', 'C', 'C']);
  });
});

describe('abc client classification', () => {
  it('classifies by the class of the top-value order', () => {
    expect(clientAbcClass([
      order('big', 800), order('mid', 150), order('small', 50)
    ])).toBe('A');
    expect(clientAbcClass([
      order('big', 900), order('small', 100)
    ])).toBe('B');
    expect(clientAbcClass([
      order('huge', 990), order('tiny', 10)
    ])).toBe('C');
  });

  it('ranks a lone order as class A', () => {
    expect(clientAbcClass([order('only', 100)])).toBe('A');
  });

  it('returns null when the client has no value-bearing orders', () => {
    expect(clientAbcClass([])).toBeNull();
    expect(clientAbcClass([order('zero', 0)])).toBeNull();
  });
});