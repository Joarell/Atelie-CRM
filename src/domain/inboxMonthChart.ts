// "Pedidos do mês" chart domain: aggregates ALL orders (every customer, not
// just the open chat contact) that fall inside a calendar month, bucketed per
// day. Pure, so it's trivially testable. Shares the status-splitting helpers
// with the yearly chart via the inboxChart module.

import type { Order } from './types';
import { orderLinesTotal } from './orderHistory';

export interface InboxDayPoint {
	/** YYYY-MM-DD of the bucket (the order's createdAt, UTC). */
	day: string;
	/** DD/MM display label for the x axis and the tooltip. */
	label: string;
	/** Number of orders placed that day. */
	total: number;
	/** Sum of every line total (BRL) for the day's orders. */
	value: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function monthKeyFromISO(iso: string): string {
	return iso.slice(0, 7);
}

export function isSameMonth(createdAt: string, monthKey: string): boolean {
	const day = createdAt.slice(0, 10);
	return DAY_RE.test(day) && monthKeyFromISO(day) === monthKey;
}

function newPoint(day: string): InboxDayPoint {
	const dd = day.slice(8);
	const mm = day.slice(5, 7);
	return { day, label: `${dd}/${mm}`, total: 0, value: 0 };
}

/** Buckets every order in `orders` that falls inside `monthKey` by day. */
export function ordersByDay(
	orders: Order[], monthKey: string
): InboxDayPoint[] {
	const byDay = new Map<string, InboxDayPoint>();
	for (const order of orders) {
		if (!isSameMonth(order.createdAt, monthKey)) continue;
		const pt = byDay.get(order.createdAt.slice(0, 10)) ?? newPoint(
			order.createdAt.slice(0, 10)
		);
		pt.total += 1;
		pt.value += orderLinesTotal(order.lines);
		byDay.set(pt.day, pt);
	}
	return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Every distinct YYYY-MM present in the orders, newest first. */
export function allOrderMonths(orders: readonly Order[]): string[] {
	const seen = new Set<string>();
	for (const order of orders) {
		const day = order.createdAt.slice(0, 10);
		if (!DAY_RE.test(day)) continue;
		seen.add(day.slice(0, 7));
	}
	return [...seen].sort((a, b) => b.localeCompare(a));
}

/** Totals across all buckets. */
export function monthSummary(points: InboxDayPoint[]): {
	orders: number; value: number;
} {
	return points.reduce(
		(acc, p) => ({ orders: acc.orders + p.total, value: acc.value + p.value }),
		{ orders: 0, value: 0 }
	);
}