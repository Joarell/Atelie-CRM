import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { CustomerService } from '../../src/services/CustomerService';
import { OrderService } from '../../src/services/OrderService';
import { StockService } from '../../src/services/StockService';
import type { Order, OrderLine } from '../../src/domain/types';

const line = (productId: string, qty: number, unitPrice: number): OrderLine => ({ productId, productName: 'Bolo', qty, unitPrice });

function order(id: string, customerId: string, paymentStatus: Order['paymentStatus']): Order {
  return {
    id, customerId, customerName: 'Cliente', lines: [line('cake', 2, 40)],
    deliveryDate: '2026-09-20', status: 'entregue', paymentStatus,
    notes: '', stockDeducted: true, createdAt: '2026-09-17T10:00:00Z'
  };
}

function makeHarness(orders: Order[]) {
  const ordersRepo = InMemoryRepository.seeded(orders);
  const emptyOrders = new InMemoryRepository<Order>();
  const stock = new StockService(
    emptyOrders as never,
    emptyOrders as never,
    emptyOrders as never,
    emptyOrders as never
  );
  const orderService = new OrderService(ordersRepo, stock);
  const service = new CustomerService(ordersRepo, orderService);
  return { service, ordersRepo };
}

describe('CustomerService.ordersFor', () => {
  it('returns only the orders belonging to the customer', () => {
    const { service } = makeHarness([
      order('o1', 'c1', 'pago'),
      order('o2', 'c1', 'a_pagar'),
      order('o3', 'c2', 'pago')
    ]);
    const ids = service.ordersFor('c1').map((o) => o.id);
    expect(ids).toEqual(['o1', 'o2']);
  });

  it('returns an empty list for an unknown customer', () => {
    const { service } = makeHarness([order('o1', 'c1', 'pago')]);
    expect(service.ordersFor('nobody')).toEqual([]);
  });
});

describe('CustomerService.statsFor', () => {
  it('counts every order but only spends paid ones', () => {
    const { service } = makeHarness([
      order('o1', 'c1', 'pago'),
      order('o2', 'c1', 'a_pagar'),
      order('o3', 'c2', 'pago')
    ]);
    const stats = service.statsFor('c1');
    expect(stats.orderCount).toBe(2);
    expect(stats.totalSpent).toBe(80);
  });

  it('returns zeros for a customer without orders', () => {
    const { service } = makeHarness([]);
    expect(service.statsFor('c1')).toEqual({ orderCount: 0, totalSpent: 0 });
  });
});