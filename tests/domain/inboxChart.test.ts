import { describe, expect, it } from 'vitest';
import type { Order, OrderStatus } from '../../src/domain/types';
import {
  ORDER_STACK_SERIES,
  ordersToYearSeries,
  seriesKeyForStatus
} from '../../src/domain/inboxChart';

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

describe('inbox chart year aggregation', () => {
  it('returns an empty list for no orders', () => {
    expect(ordersToYearSeries([])).toEqual([]);
  });

  it('groups orders by year, sorted ascending, with a total', () => {
    const rows = ordersToYearSeries([
      order('a', '2025-03-01T10:00:00.000Z', 'entregue'),
      order('b', '2026-01-01T10:00:00.000Z', 'entregue'),
      order('c', '2024-01-01T10:00:00.000Z', 'cancelado')
    ]);
    expect(rows.map((r) => r.year)).toEqual([2024, 2025, 2026]);
    expect(rows.map((r) => r.total)).toEqual([1, 1, 1]);
  });

  it('stacks every status onto its series bucket', () => {
    const rows = ordersToYearSeries([
      order('a', '2026-01-01T10:00:00.000Z', 'entregue'),
      order('b', '2026-01-01T10:00:00.000Z', 'pendente'),
      order('c', '2026-01-01T10:00:00.000Z', 'producao'),
      order('d', '2026-01-01T10:00:00.000Z', 'pronto'),
      order('e', '2026-01-01T10:00:00.000Z', 'cancelado')
    ]);
    expect(rows).toHaveLength(1);
    const counts = rows[0].counts;
    expect(counts.entregue).toBe(1);
    expect(counts.ativo).toBe(3);
    expect(counts.cancelado).toBe(1);
    expect(rows[0].total).toBe(5);
  });

  it('keeps every series key present when others stay zero', () => {
    const row = ordersToYearSeries([
      order('a', '2026-01-01T10:00:00.000Z', 'entregue')
    ])[0];
    expect(row.counts.entregue).toBe(1);
    expect(row.counts.ativo).toBe(0);
    expect(row.counts.cancelado).toBe(0);
    expect(Object.keys(row.counts).sort()).toEqual(
      ORDER_STACK_SERIES.map((s) => s.key).sort());
  });

  it('sums repeated orders within the same year', () => {
    const counts = ordersToYearSeries([
      order('a', '2026-01-01T10:00:00.000Z', 'entregue'),
      order('b', '2026-02-01T10:00:00.000Z', 'entregue')
    ])[0].counts;
    expect(counts.entregue).toBe(2);
  });

  it('tallies the BRL value of every order in the year', () => {
    const row = ordersToYearSeries([
      order('a', '2026-01-01T10:00:00.000Z', 'entregue', 260),
      order('b', '2026-02-01T10:00:00.000Z', 'entregue', 130),
      order('c', '2026-03-01T10:00:00.000Z', 'pendente', 89.9)
    ])[0];
    expect(row.value).toBeCloseTo(479.9, 2);
    expect(row.values.entregue).toBeCloseTo(390, 2);
    expect(row.values.ativo).toBeCloseTo(89.9, 2);
    expect(row.values.cancelado).toBe(0);
  });

  it('keeps zero-valued lines out of the aggregates', () => {
    const row = ordersToYearSeries([
      order('a', '2026-01-01T10:00:00.000Z', 'entregue'),
      order('b', '2026-02-01T10:00:00.000Z', 'cancelado')
    ])[0];
    expect(row.value).toBe(0);
    expect(row.total).toBe(2);
  });

  it('skips orders whose createdAt carries no year', () => {
    const rows = ordersToYearSeries([
      order('a', 'not-a-date', 'entregue'),
      order('b', '2026-01-01T10:00:00.000Z', 'entregue')
    ]);
    expect(rows.map((r) => r.year)).toEqual([2026]);
  });

  it('maps each status to its series key', () => {
    expect(seriesKeyForStatus('entregue')).toBe('entregue');
    expect(seriesKeyForStatus('pendente')).toBe('ativo');
    expect(seriesKeyForStatus('producao')).toBe('ativo');
    expect(seriesKeyForStatus('pronto')).toBe('ativo');
    expect(seriesKeyForStatus('cancelado')).toBe('cancelado');
  });
});