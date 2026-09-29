import { describe, it, expect } from 'vitest';
import {
  monthKeyFromISO,
  isSameMonth,
  ordersByDay,
  monthSummary,
  allOrderMonths,
  type InboxDayPoint,
} from '../../src/domain/inboxMonthChart';
import type { Order } from '../../src/domain/types';

function order(createdAt: string, value = 89.9): Order {
  return {
    id: 'o-' + createdAt,
    customerId: 'seed-customer-ana',
    customerName: 'Ana Beatriz',
    lines: [{ productId: 'p', productName: 'Bolo de limão', qty: 1, unitPrice: value }],
    status: 'entregue',
    paymentStatus: 'pago',
    createdAt,
    deliveryDate: '',
    notes: '',
    stockDeducted: false,
  };
}

describe('inboxMonthChart domain', () => {
  it('extracts the YYYY-MM month key', () => {
    expect(monthKeyFromISO('2026-09-14T10:00:00.000Z')).toBe('2026-09');
    expect(monthKeyFromISO('2026-09-14')).toBe('2026-09');
  });

  it('matches only orders inside the given calendar month', () => {
    expect(isSameMonth('2026-09-01T00:00:00.000Z', '2026-09')).toBe(true);
    expect(isSameMonth('2026-09-30T23:59:59.999Z', '2026-09')).toBe(true);
    expect(isSameMonth('2026-08-31T23:59:59.999Z', '2026-09')).toBe(false);
    expect(isSameMonth('2026-10-01T00:00:00.000Z', '2026-09')).toBe(false);
  });

  it('rejects orders without a valid YYYY-MM-DD createdAt', () => {
    expect(isSameMonth('not-a-date', '2026-09')).toBe(false);
    expect(isSameMonth('', '2026-09')).toBe(false);
  });

  it('buckets all orders of the month per day in ascending order', () => {
    const orders = [
      order('2026-09-14T10:00:00.000Z'),
      order('2026-09-02T09:00:00.000Z', 130),
      order('2026-09-14T18:00:00.000Z', 650),
      order('2026-08-30T12:00:00.000Z', 1),
      order('2026-10-01T12:00:00.000Z', 1),
    ];
    const points = ordersByDay(orders, '2026-09');
    expect(points.map((p) => p.day)).toEqual(['2026-09-02', '2026-09-14']);
    expect(points[0].label).toBe('02/09');
    expect(points[1].label).toBe('14/09');
    expect(points[0].total).toBe(1);
    expect(points[0].value).toBe(130);
    expect(points[1].total).toBe(2);
    expect(points[1].value).toBe(650 + 89.9);
  });

  it('includes every customer, not just one contact', () => {
    const orders = [
      order('2026-09-05T09:00:00.000Z', 100),
      { ...order('2026-09-05T10:00:00.000Z', 50), customerName: 'Carla Menezes' },
      { ...order('2026-09-06T09:00:00.000Z', 50), customerName: 'Bruno Alves' },
    ];
    const points = ordersByDay(orders, '2026-09');
    expect(points.length).toBe(2);
    expect(points[0].total).toBe(2);
    expect(points[0].value).toBe(150);
    expect(points[1].total).toBe(1);
  });

  it('returns an empty list when no order falls in the month', () => {
    expect(ordersByDay([order('2025-01-01T00:00:00.000Z')], '2026-09'))
      .toEqual([]);
  });

  it('zero-fills no days — only orders that exist become buckets', () => {
    const points = ordersByDay([order('2026-09-20T00:00:00.000Z')], '2026-09');
    expect(points.length).toBe(1);
  });

  it('summarizes totals across all buckets', () => {
    const points: InboxDayPoint[] = [
      { day: '2026-09-02', label: '02/09', total: 1, value: 130 },
      { day: '2026-09-14', label: '14/09', total: 2, value: 500 },
    ];
    expect(monthSummary(points)).toEqual({ orders: 3, value: 630 });
  });

  it('summarizes an empty set to zero', () => {
    expect(monthSummary([])).toEqual({ orders: 0, value: 0 });
  });
});

describe('allOrderMonths', () => {
  it('lists each distinct month, newest first', () => {
    const orders = [
      order('2025-05-01T10:00:00.000Z'),
      order('2026-01-15T10:00:00.000Z'),
      order('2025-05-20T10:00:00.000Z'),
      order('2024-03-05T10:00:00.000Z'),
    ];
    expect(allOrderMonths(orders))
      .toEqual(['2026-01', '2025-05', '2024-03']);
  });

  it('skips orders without a valid date', () => {
    expect(allOrderMonths([
      order('not-a-date'),
      order(''),
    ])).toEqual([]);
  });

  it('returns an empty list for no orders', () => {
    expect(allOrderMonths([])).toEqual([]);
  });
});