// Order-history query surface for the CRM inbox "Pedidos" panel: all orders
// placed by the chat contact (matched by the denormalised customerName
// snapshot), newest first — a LIFO queue of the contact's past orders.
// Pure and empty of I/O so it is unit-testable in isolation.

import type { Customer, Order, OrderLine, OrderStatus } from './types';

// A single product unit selected in the inbox "Novo pedido" composer. The
// stack is LIFO (newest pick first), mirroring the "Pedidos" history ordering.
// qty is the per-unit counter: the subtotal multiplies unitPrice by it.
export interface OrderPick {
	productId: string;
	productName: string;
	unitPrice: number;
	qty: number;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	pendente: 'Pendente',
	producao: 'Em produção',
	pronto: 'Pronto',
	entregue: 'Entregue',
	cancelado: 'Cancelado'
};

function normalize(name: string): string {
	return name.trim().toLocaleLowerCase('pt-BR');
}

export function ordersForCustomerName(
	orders: Order[],
	customerName: string
): Order[] {
	const needle = normalize(customerName);
	if (!needle) return [];
	return orders
		.filter((order) => normalize(order.customerName) === needle)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function orderItemsText(lines: OrderLine[]): string {
	return lines
		.map((line) => `${line.qty}× ${line.productName}`)
		.join(', ');
}

export function orderLinesTotal(lines: OrderLine[]): number {
	return lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
}

// Newest-accepted pick is pushed onto the top of the stack (LIFO).
export function pushPick(stack: OrderPick[], pick: OrderPick): OrderPick[] {
	return [pick, ...stack];
}

export function dropPick(stack: OrderPick[], index: number): OrderPick[] {
	return stack.filter((_, i) => i !== index);
}

// "Adicionar" a unit: bumps the quantity counter of the newest pick of that
// product, or pushes a fresh single unit onto the top when it is not picked
// yet — keeping one row per product on the order.
export function bumpPick(
	stack: OrderPick[], pick: OrderPick
): OrderPick[] {
	return stack.some((p) => p.productId === pick.productId)
		? stack.map((p) =>
				p.productId === pick.productId ? { ...p, qty: p.qty + 1 } : p)
		: pushPick(stack, pick);
}

// Clamp a unit's counter to a positive quantity (1..99).
export function setPickQty(
	stack: OrderPick[], index: number, qty: number
): OrderPick[] {
	const clamped = Math.min(99, Math.max(1, Math.floor(qty)));
	return stack.map((pick, i) =>
		i === index ? { ...pick, qty: clamped } : pick);
}

export function picksSubtotal(picks: OrderPick[]): number {
	return picks.reduce(
		(sum, pick) => sum + pick.unitPrice * pick.qty, 0
	);
}

// Each composer pick becomes an order line carrying its quantity counter.
export function picksToLines(picks: OrderPick[]): OrderLine[] {
	return picks.map((pick) => ({
		productId: pick.productId,
		productName: pick.productName,
		qty: pick.qty,
		unitPrice: pick.unitPrice
	}));
}

export function findCustomerByName(
	customers: Customer[], customerName: string
): Customer | null {
	const needle = normalize(customerName);
	if (!needle) return null;
	return (
		customers.find((customer) => normalize(customer.name) === needle) ?? null
	);
}