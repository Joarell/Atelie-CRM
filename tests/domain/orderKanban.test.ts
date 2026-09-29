import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  kanbanColumns,
  ordersByDeliveryDate,
  groupOrdersByStatus,
  shiftDay
} from '../../src/domain/orderKanban';
import type {
  Order, OrderLine, OrderStatus
} from '../../src/domain/types';

function order(
  id: string,
  status: OrderStatus,
  deliveryDate: string,
  createdAt: string,
  unitPrice = 89.9
): Order {
  const lines: OrderLine[] = [
    { productId: 'p1', productName: 'Bolo de limão', qty: 1, unitPrice }
  ];
  return {
    id,
    customerId: 'c',
    customerName: 'Ana Beatriz',
    lines,
    deliveryDate,
    status,
    paymentStatus: 'a_pagar',
    notes: '',
    stockDeducted: false,
    createdAt
  };
}

describe('orderKanban — ordersByDeliveryDate', () => {
  it('keeps only orders whose delivery is on the selected day', () => {
    const orders = [
      order('a', 'pendente', '2026-01-24', '2026-01-22T09:00:00.000Z'),
      order('b', 'producao', '2026-01-25', '2026-01-23T09:00:00.000Z'),
      order('c', 'pronto', '2026-01-24', '2026-01-21T09:00:00.000Z')
    ];
    const day = ordersByDeliveryDate(orders, '2026-01-24');
    expect(day.map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('sorts the day newest first', () => {
    const orders = [
      order('old', 'pendente', '2026-01-24', '2026-01-20T09:00:00.000Z'),
      order('new', 'pendente', '2026-01-24', '2026-01-23T09:00:00.000Z'),
      order('mid', 'pendente', '2026-01-24', '2026-01-22T09:00:00.000Z')
    ];
    expect(ordersByDeliveryDate(orders, '2026-01-24').map((o) => o.id))
      .toEqual(['new', 'mid', 'old']);
  });

  it('returns an empty list for a day without deliveries', () => {
    const orders = [
      order('a', 'pendente', '2026-01-24', '2026-01-22T09:00:00.000Z')
    ];
    expect(ordersByDeliveryDate(orders, '2026-02-01')).toEqual([]);
  });
});

describe('orderKanban — groupOrdersByStatus', () => {
  it('groups every order under its own status', () => {
    const orders = [
      order('a', 'pendente', '2026-01-24', '2026-01-22T09:00:00.000Z'),
      order('b', 'pronto', '2026-01-24', '2026-01-22T09:00:00.000Z'),
      order('c', 'pendente', '2026-01-24', '2026-01-22T10:00:00.000Z')
    ];
    const grouped = groupOrdersByStatus(orders);
    expect(grouped.pendente.map((o) => o.id)).toEqual(['a', 'c']);
    expect(grouped.pronto.map((o) => o.id)).toEqual(['b']);
    expect(grouped.producao).toEqual([]);
    expect(grouped.entregue).toEqual([]);
    expect(grouped.cancelado).toEqual([]);
  });

  it('always exposes every status key, even on an empty board', () => {
    const grouped = groupOrdersByStatus([]);
    expect(Object.keys(grouped).sort()).toEqual(
      ['cancelado', 'entregue', 'pendente', 'producao', 'pronto']
    );
  });

  it('preserves the canonical status order of the board', () => {
    expect(ORDER_STATUSES).toEqual([
      'pendente', 'producao', 'pronto', 'entregue', 'cancelado'
    ]);
  });
});

describe('orderKanban — kanbanColumns', () => {
  it('reports count and total value per column', () => {
    const orders = [
      order('a', 'pendente', '2026-01-24', '2026-01-22T09:00:00.000Z', 100),
      order('b', 'pendente', '2026-01-24', '2026-01-22T10:00:00.000Z', 30),
      order('c', 'pronto', '2026-01-24', '2026-01-22T09:00:00.000Z', 50)
    ];
    const columns = kanbanColumns(orders);
    const pendente = columns.find((c) => c.status === 'pendente')!;
    expect(pendente.count).toBe(2);
    expect(pendente.total).toBeCloseTo(130, 5);
    expect(columns.find((c) => c.status === 'pronto')!.total)
      .toBeCloseTo(50, 5);
    expect(columns.find((c) => c.status === 'producao')!.orders).toEqual([]);
  });

  it('labels every column with the Portuguese status name', () => {
    const columns = kanbanColumns([]);
    expect(columns.map((c) => c.label)).toEqual([
      'Pendente', 'Em produção', 'Pronto', 'Entregue', 'Cancelado'
    ]);
  });

  it('sorts each status column newest first', () => {
    const orders = [
      order('old', 'pronto', '2026-01-24', '2026-01-20T09:00:00.000Z'),
      order('new', 'pronto', '2026-01-24', '2026-01-23T09:00:00.000Z')
    ];
    const pronto = kanbanColumns(orders).find((c) => c.status === 'pronto')!;
    expect(pronto.orders.map((o) => o.id)).toEqual(['new', 'old']);
  });
});

describe('orderKanban — shiftDay', () => {
  it('moves a day forward and backward', () => {
    expect(shiftDay('2026-01-24', 1)).toBe('2026-01-25');
    expect(shiftDay('2026-01-24', -1)).toBe('2026-01-23');
  });

  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});