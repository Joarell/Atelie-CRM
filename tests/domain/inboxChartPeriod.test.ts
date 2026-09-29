import { describe, expect, it } from 'vitest';
import type { Order, OrderStatus } from '../../src/domain/types';
import { ordersToYearSeries } from '../../src/domain/inboxChart';
import {
  CHART_PERIODS,
  ordersToPeriodSeries,
  PERIOD_LABELS,
  periodBucketKey
} from '../../src/domain/inboxChartPeriod';

function order(
  id: string, createdAt: string, status: OrderStatus, value = 0
): Order {
  return {
    id, customerId: 'c', customerName: 'Ana Beatriz',
    lines: value
      ? [{ productId: 'p', productName: 'X', qty: 1, unitPrice: value }]
      : [],
    deliveryDate: '2026-01-01', status, paymentStatus: 'a_pagar',
    notes: '', stockDeducted: false, createdAt
  };
}

const ANA: Order[] = [
  order('a', '2025-05-01T10:00:00.000Z', 'entregue', 260),
  order('b', '2025-11-10T10:00:00.000Z', 'producao', 89.9),
  order('c', '2026-01-15T10:00:00.000Z', 'pendente', 650)
];

describe('period chart aggregation', () => {
  it('exposes the three menu periods with labels', () => {
    expect([...CHART_PERIODS]).toEqual(['semana', 'mes', 'ano']);
    expect(PERIOD_LABELS).toEqual({
      semana: 'Semana', mes: 'Mês', ano: 'Ano'
    });
  });

  it('returns an empty list for no orders', () => {
    expect(ordersToPeriodSeries([], 'mes')).toEqual([]);
  });

  it('roundtrips the monthly aggregation against the yearly one', () => {
    const months = ordersToPeriodSeries(ANA, 'mes');
    const years = ordersToYearSeries(ANA);
    expect(months.map((b) => b.key))
      .toEqual(['2025-05', '2025-11', '2026-01']);
    expect(months.map((b) => b.label))
      .toEqual(['05/2025', '11/2025', '01/2026']);
    expect(months.reduce((sum, b) => sum + b.total, 0))
      .toBe(years.reduce((sum, y) => sum + y.total, 0));
    expect(months.reduce((sum, b) => sum + b.value, 0))
      .toBeCloseTo(years.reduce((sum, y) => sum + y.value, 0), 2);
  });

  it('stacks series and tallies values per month', () => {
    const rows = ordersToPeriodSeries(ANA, 'mes');
    const may = rows[0];
    expect(may.total).toBe(1);
    expect(may.counts.entregue).toBe(1);
    expect(may.values.entregue).toBeCloseTo(260, 2);
    const nov = rows[1];
    expect(nov.counts.ativo).toBe(1);
    expect(nov.values.ativo).toBeCloseTo(89.9, 2);
    const jan = rows[2];
    expect(jan.counts.ativo).toBe(1);
    expect(jan.values.ativo).toBeCloseTo(650, 2);
  });

  it('keeps every series key present when others stay zero', () => {
    const row = ordersToPeriodSeries(
      [order('a', '2026-03-02T10:00:00.000Z', 'entregue')], 'mes')[0];
    expect(Object.keys(row.counts).sort())
      .toEqual(['ativo', 'cancelado', 'entregue']);
    expect(row.counts.cancelado).toBe(0);
  });

  it('groups week buckels with the ISO year next to the month view', () => {
    const weeks = ordersToPeriodSeries(ANA, 'semana');
    expect(weeks.map((b) => b.key))
      .toEqual(['2025-W18', '2025-W46', '2026-W03']);
    expect(weeks.map((b) => b.label))
      .toEqual(['S18/25', 'S46/25', 'S03/26']);
    expect(weeks[2].value).toBeCloseTo(650, 2);
    expect(weeks[2].counts.ativo).toBe(1);
  });

  it('handles ISO week year boundaries (Dec 29 2025 is week 1 of 2026)', () => {
    const rows = ordersToPeriodSeries([
      order('a', '2025-12-29T10:00:00.000Z', 'entregue'),
      order('b', '2026-01-04T10:00:00.000Z', 'entregue')
    ], 'semana');
    expect(rows.map((b) => b.key)).toEqual(['2026-W01']);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(2);
  });

  it('sorts ascending and merges same-week orders', () => {
    const rows = ordersToPeriodSeries([
      order('a', '2026-01-15T10:00:00.000Z', 'entregue'),
      order('b', '2026-01-14T10:00:00.000Z', 'entregue'),
      order('c', '2026-01-05T10:00:00.000Z', 'cancelado')
    ], 'semana');
    expect(rows.map((b) => b.key)).toEqual(['2026-W02', '2026-W03']);
    expect(rows[0].total).toBe(1);
    expect(rows[1].total).toBe(2);
  });

  it('skips orders whose createdAt carries no usable date', () => {
    for (const period of CHART_PERIODS) {
      const rows = ordersToPeriodSeries([
        order('a', 'not-a-date', 'entregue'),
        order('b', '2026-01-15T10:00:00.000Z', 'entregue')
      ], period);
      expect(rows).toHaveLength(1);
      expect(rows[0].total).toBe(1);
    }
  });

  it('returns an empty bucket key for unparseable dates', () => {
    const bad = order('a', 'not-a-date', 'entregue');
    for (const period of CHART_PERIODS) {
      expect(periodBucketKey(bad, period)).toBe('');
    }
  });
});