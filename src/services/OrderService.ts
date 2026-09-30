import type { IRepository } from '../repositories/IRepository';
import type { Order, OrderLine, OrderStatus } from '../domain/types';
import { orderLinesTotal } from '../domain/orderHistory';
import { uid, nowISO } from '../domain/format';
import type { StockService } from './StockService';

export interface NewOrderInput {
	customerId: string;
	customerName: string;
	lines: OrderLine[];
	deliveryDate: string;
	notes: string;
	createdFrom?: string; // '' (ERP) or 'inbox' (Pedidos panel composer)
}

export class OrderService {
	constructor(
		private readonly orders: IRepository<Order>,
		private readonly stock: StockService
	) {}

	orderTotal(order: Pick<Order, 'lines'>): number {
		return orderLinesTotal(order.lines);
	}

	create(input: NewOrderInput): Promise<Order> {
		return this.orders.add({
			id: uid(),
			customerId: input.customerId,
			customerName: input.customerName,
			lines: input.lines,
			deliveryDate: input.deliveryDate,
			status: 'pendente',
			paymentStatus: 'a_pagar',
			notes: input.notes,
			stockDeducted: false,
			createdFrom: input.createdFrom ?? '',
			createdAt: nowISO()
		});
	}

	async setStatus(orderId: string, status: OrderStatus): Promise<void> {
		await this.orders.update(orderId, { status });
		if (status === 'producao') await this.deductStock(orderId);
	}

	async setPaymentStatus(
		orderId: string, paymentStatus: Order['paymentStatus']
	): Promise<void> {
		await this.orders.update(orderId, { paymentStatus });
	}

	async deductStock(orderId: string): Promise<void> {
		const order = this.orders.getById(orderId);
		if (!order || order.stockDeducted) return;
		await this.stock.deductForOrder(order);
		await this.orders.update(orderId, { stockDeducted: true });
	}

	monthRevenue(referenceDate = new Date()): number {
		const delivered = this.deliveredThisMonth(referenceDate);
		return delivered.reduce((sum, order) => sum + this.orderTotal(order), 0);
	}

	private deliveredThisMonth(referenceDate: Date): Order[] {
		return this.orders.getAll().filter((order) => {
			if (order.status !== 'entregue') return false;
			const created = new Date(order.createdAt);
			return created.getMonth() === referenceDate.getMonth() &&
				created.getFullYear() === referenceDate.getFullYear();
		});
	}
}