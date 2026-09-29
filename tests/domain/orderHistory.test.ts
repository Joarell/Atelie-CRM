import { describe, expect, it } from 'vitest';
import {
  bumpPick,
  dropPick,
  findCustomerByName,
  ORDER_STATUS_LABELS,
  orderItemsText,
  orderLinesTotal,
  ordersForCustomerName,
  picksSubtotal,
  picksToLines,
  pushPick,
  setPickQty,
  type OrderPick
} from '../../src/domain/orderHistory';
import type {
  Customer, Order, OrderLine, OrderStatus
} from '../../src/domain/types';

function pick(
  id: string, name: string, unitPrice: number, qty = 1
): OrderPick {
  return { productId: id, productName: name, unitPrice, qty };
}

function order(
  id: string,
  customerName: string,
  createdAt: string
): Order {
  const lines: OrderLine[] = [
    { productId: 'p1', productName: 'Bolo de limão', qty: 1, unitPrice: 89.9 }
  ];
  return {
    id,
    customerId: 'c',
    customerName,
    lines,
    deliveryDate: '2026-01-24',
    status: 'producao',
    paymentStatus: 'a_pagar',
    notes: '',
    stockDeducted: false,
    createdAt
  };
}

describe('ordersForCustomerName', () => {
  it('filters orders by the contact name ignoring case and spaces', () => {
    const orders = [
      order('1', 'Ana Beatriz', '2026-01-06T08:00:00.000Z'),
      order('2', 'Ana Beatriz', '2026-01-19T08:00:00.000Z'),
      order('3', 'Carla Menezes', '2026-01-17T08:00:00.000Z')
    ];
    const matches = ordersForCustomerName(orders, '  ana beatriz ');
    expect(matches.map((o) => o.id)).toEqual(['2', '1']);
  });

  it('sorts the contact orders newest first (LIFO queue)', () => {
    const orders = [
      order('old', 'Ana Beatriz', '2026-01-06T08:00:00.000Z'),
      order('new', 'Ana Beatriz', '2026-01-19T08:00:00.000Z'),
      order('mid', 'Ana Beatriz', '2026-01-12T08:00:00.000Z')
    ];
    const matches = ordersForCustomerName(orders, 'Ana Beatriz');
    expect(matches.map((o) => o.id)).toEqual(['new', 'mid', 'old']);
  });

  it('ignores orders placed by other customers', () => {
    const orders = [
      order('1', 'Ana Beatriz', '2026-01-06T08:00:00.000Z'),
      order('2', 'Bruno Alves', '2026-01-05T08:00:00.000Z')
    ];
    const matches = ordersForCustomerName(orders, 'Ana Beatriz');
    expect(matches.map((o) => o.id)).toEqual(['1']);
  });

  it('returns no orders for a name nobody ordered from', () => {
    const orders = [order('1', 'Ana Beatriz', '2026-01-06T08:00:00.000Z')];
    expect(ordersForCustomerName(orders, 'Zeca')).toEqual([]);
  });

  it('returns no orders for a blank contact name', () => {
    const orders = [order('1', 'Ana Beatriz', '2026-01-06T08:00:00.000Z')];
    expect(ordersForCustomerName(orders, '   ')).toEqual([]);
    expect(ordersForCustomerName(orders, '')).toEqual([]);
  });
});

describe('orderItemsText', () => {
  it('joins every line as qty× product', () => {
    const lines: OrderLine[] = [
      { productId: 'a', productName: 'Docinhos', qty: 2, unitPrice: 130 },
      { productId: 'b', productName: 'Bolo de limão', qty: 1, unitPrice: 89.9 }
    ];
    expect(orderItemsText(lines)).toBe(
      '2× Docinhos, 1× Bolo de limão'
    );
  });

  it('renders an empty order as an empty string', () => {
    expect(orderItemsText([])).toBe('');
  });
});

describe('orderLinesTotal', () => {
  it('sums qty × unitPrice across the lines', () => {
    const lines: OrderLine[] = [
      { productId: 'a', productName: 'Docinhos', qty: 2, unitPrice: 130 },
      { productId: 'b', productName: 'Bolo de limão', qty: 1, unitPrice: 89.9 }
    ];
    expect(orderLinesTotal(lines)).toBeCloseTo(349.9, 5);
  });

  it('sums to zero for an empty order', () => {
    expect(orderLinesTotal([])).toBe(0);
  });
});

describe('ORDER_STATUS_LABELS', () => {
  it('labels every order status in Portuguese', () => {
    const statuses: OrderStatus[] = [
      'pendente', 'producao', 'pronto', 'entregue', 'cancelado'
    ];
    for (const status of statuses) {
      expect(ORDER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe('picks stack (LIFO)', () => {
  it('pushPick puts the newest pick on top', () => {
    const stack = pushPick(
      pushPick([], pick('cat', 'Docinhos (centena)', 130)),
      pick('bolo', 'Bolo de limão', 89.9)
    );
    expect(stack).toEqual([
      pick('bolo', 'Bolo de limão', 89.9),
      pick('cat', 'Docinhos (centena)', 130)
    ]);
  });

  it('dropPick removes the pick at the given index', () => {
    const stack = [
      pick('a', 'A', 10),
      pick('b', 'B', 20),
      pick('c', 'C', 30)
    ];
    expect(dropPick(stack, 1)).toEqual([pick('a', 'A', 10), pick('c', 'C', 30)]);
    expect(dropPick([], 0)).toEqual([]);
  });
});

describe('picksSubtotal', () => {
  it('sums the unit price of every pick', () => {
    const stack = [pick('a', 'A', 10), pick('b', 'B', 20.5)];
    expect(picksSubtotal(stack)).toBeCloseTo(30.5, 5);
  });

  it('multiplies each unit price by its quantity counter', () => {
    const stack = [pick('a', 'A', 130, 2), pick('b', 'B', 89.9, 1)];
    expect(picksSubtotal(stack)).toBeCloseTo(349.9, 5);
  });

  it('is zero for an empty stack', () => {
    expect(picksSubtotal([])).toBe(0);
  });
});

describe('picksToLines', () => {
  it('turns every pick into a one-unit order line', () => {
    const lines = picksToLines([
      pick('a', 'Docinhos (centena)', 130),
      pick('b', 'Bolo de limão', 89.9)
    ]);
    expect(lines).toEqual([
      { productId: 'a', productName: 'Docinhos (centena)', qty: 1, unitPrice: 130 },
      { productId: 'b', productName: 'Bolo de limão', qty: 1, unitPrice: 89.9 }
    ]);
  });

  it('carries the quantity counter onto each order line', () => {
    const lines = picksToLines([
      pick('a', 'Docinhos (centena)', 130, 3),
      pick('b', 'Bolo de limão', 89.9, 2)
    ]);
    expect(lines).toEqual([
      { productId: 'a', productName: 'Docinhos (centena)', qty: 3, unitPrice: 130 },
      { productId: 'b', productName: 'Bolo de limão', qty: 2, unitPrice: 89.9 }
    ]);
  });

  it('returns no lines for an empty stack', () => {
    expect(picksToLines([])).toEqual([]);
  });
});

describe('quantity counter (bumpPick)', () => {
  it('pushes a fresh single unit for a product not picked yet', () => {
    const stack = bumpPick([], pick('bolo', 'Bolo de limão', 89.9));
    expect(stack).toEqual([{ ...pick('bolo', 'Bolo de limão', 89.9), qty: 1 }]);
  });

  it('bumps the counter on the SAME row instead of duplicating it', () => {
    const stack = bumpPick(
      bumpPick([], pick('bolo', 'Bolo de limão', 89.9, 1)),
      pick('bolo', 'Bolo de limão', 89.9)
    );
    expect(stack).toEqual([{ ...pick('bolo', 'Bolo de limão', 89.9), qty: 2 }]);
  });

  it('only bumps the matching product, leaving the rest untouched', () => {
    const one = bumpPick([], pick('cat', 'Docinhos (centena)', 130));
    const two = bumpPick(one, pick('bolo', 'Bolo de limão', 89.9));
    const three = bumpPick(two, pick('cat', 'Docinhos (centena)', 130));
    expect(three).toEqual([
      { ...pick('bolo', 'Bolo de limão', 89.9), qty: 1 },
      { ...pick('cat', 'Docinhos (centena)', 130), qty: 2 }
    ]);
  });
});

describe('quantity counter (setPickQty)', () => {
  it('sets the counter of exactly the row at the index', () => {
    const stack = [
      pick('a', 'A', 10, 1),
      pick('b', 'B', 20, 1),
      pick('c', 'C', 30, 1)
    ];
    expect(setPickQty(stack, 1, 5)).toEqual([
      pick('a', 'A', 10),
      pick('b', 'B', 20, 5),
      pick('c', 'C', 30)
    ]);
  });

  it('clamps the counter between 1 and 99 units', () => {
    const stack = [pick('a', 'A', 10)] as OrderPick[];
    expect(setPickQty(stack, 0, 0)[0].qty).toBe(1);
    expect(setPickQty(stack, 0, 250)[0].qty).toBe(99);
  });
});

describe('findCustomerByName', () => {
  const customers: Customer[] = [
    { id: 'c1', name: 'Ana Beatriz', phone: '11999990000',
      email: '', notes: '' },
    { id: 'c2', name: 'Carla Menezes', phone: '', email: '', notes: '' }
  ];

  it('matches the customer name ignoring case and spaces', () => {
    expect(findCustomerByName(customers, '  ana beatriz ')?.id).toBe('c1');
  });

  it('returns null when no customer matches', () => {
    expect(findCustomerByName(customers, 'Zeca')).toBeNull();
  });

  it('returns null for a blank name', () => {
    expect(findCustomerByName(customers, '   ')).toBeNull();
  });
});