// Pure query surface for the ERP "Pedidos" kanban board: all orders whose
// delivery falls on one selected day, split into one column per status.
// No I/O or DOM — kept isolated so the board logic is unit-testable.

import type { Order, OrderStatus } from './types';
import { ORDER_STATUS_LABELS, orderLinesTotal } from './orderHistory';

// Stable column order for the board (same order the status labels define).
export const ORDER_STATUSES = Object.keys(
	ORDER_STATUS_LABELS
) as OrderStatus[];

// Orders delivered on the given ISO day, newest first.
export function ordersByDeliveryDate(
	orders: Order[],
	day: string
): Order[] {
	return orders
		.filter((order) => order.deliveryDate === day)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Bucket orders into one list per status, keeping every status key present
// (empty boards still render their column).
export function groupOrdersByStatus(
	orders: Order[],
	statuses: readonly OrderStatus[] = ORDER_STATUSES
): Record<OrderStatus, Order[]> {
	const grouped = {} as Record<OrderStatus, Order[]>;
	for (const status of statuses) {
		grouped[status] = orders.filter((o) => o.status === status);
	}
	return grouped;
}

export interface KanbanColumn {
	status: OrderStatus;
	label: string;
	orders: Order[];
	count: number;
	total: number;
}

export function kanbanColumns(
	orders: Order[],
	statuses: readonly OrderStatus[] = ORDER_STATUSES
): KanbanColumn[] {
	return statuses.map((status) => {
		const columnOrders = orders
			.filter((order) => order.status === status)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		return {
			status,
			label: ORDER_STATUS_LABELS[status],
			orders: columnOrders,
			count: columnOrders.length,
			total: columnOrders.reduce(
				(sum, order) => sum + orderLinesTotal(order.lines), 0
			)
		};
	});
}

// Moves an ISO day forward/back by whole days, staying UTC to dodge the
// local-timezone DST drift when the browser formats the input value.
export function shiftDay(day: string, delta: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + delta);
	return date.toISOString().slice(0, 10);
}