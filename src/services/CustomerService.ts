import type { IRepository } from '../repositories/IRepository';
import type { Order } from '../domain/types';
import type { OrderService } from './OrderService';

export interface CustomerStats {
	orderCount: number;
	totalSpent: number;
}

export class CustomerService {
	constructor(
		private readonly orders: IRepository<Order>,
		private readonly orderService: OrderService
	) {}

	ordersFor(customerId: string): Order[] {
		return this.orders
			.getAll()
			.filter((order) => order.customerId === customerId);
	}

	statsFor(customerId: string): CustomerStats {
		const orders = this.ordersFor(customerId);
		const totalSpent = orders
			.filter((o) => o.paymentStatus === 'pago')
			.reduce((sum, o) => sum + this.orderService.orderTotal(o), 0);
		return { orderCount: orders.length, totalSpent };
	}
}