// Stacked status series shared by the inbox charts: ORDER_STACK_SERIES +
// seriesKeyForStatus feed the period chart ("Pedidos por período") in
// `src/domain/inboxChartPeriod.ts`, and ordersToYearSeries keeps the
// yearly aggregation this file always backed (still unit-tested). The
// inbox's first chart now renders the ABC curve (`src/domain/abcCurve.ts`).
// Pure (no I/O, no DOM) so the count math is unit-tested in isolation.

import type { Order, OrderStatus } from './types';
import { orderLinesTotal } from './orderHistory';

// Stacked series in bottom-up draw order: delivered sits at the base, then
// the in-flight bucket, then cancelled on top.
export interface OrderYearSeries {
	key: string;
	label: string;
	statuses: OrderStatus[];
}

export const ORDER_STACK_SERIES: OrderYearSeries[] = [
	{ key: 'entregue', label: 'Entregue', statuses: ['entregue'] },
	{
		key: 'ativo',
		label: 'Em andamento',
		statuses: ['pendente', 'producao', 'pronto']
	},
	{ key: 'cancelado', label: 'Cancelado', statuses: ['cancelado'] }
];

export interface InboxChartYear {
	year: number;
	counts: Record<string, number>;
	values: Record<string, number>;
	total: number;
	value: number;
}

// The calendar year a count lands on. Orders carry ISO datetimes; strings
// that do not parse to a plausible year yield NaN, which the aggregator
// skips instead of crashing the chart.
export function orderYear(order: Order): number {
	const year = Number(order.createdAt.slice(0, 4));
	return Number.isFinite(year) && year >= 2000 ? year : NaN;
}

export function seriesKeyForStatus(status: OrderStatus): string {
	const series = ORDER_STACK_SERIES.find((s) =>
		s.statuses.includes(status));
	return series ? series.key : ORDER_STACK_SERIES[0].key;
}

// Count the contact's orders per year, years sorted ascending. Every year
// carries all series keys (zeros included) so the stack renderer never has
// to backfill a gap. Values are the BRL totals from `orderLinesTotal`.
export function ordersToYearSeries(orders: Order[]): InboxChartYear[] {
	const byYear = new Map<number, InboxChartYear>();
	for (const order of orders) {
		const year = orderYear(order);
		if (Number.isNaN(year)) continue;
		let row = byYear.get(year);
		if (!row) {
			row = {
				year,
				counts: zeroCounts(),
				values: zeroCounts(),
				total: 0,
				value: 0
			};
			byYear.set(year, row);
		}
		const key = seriesKeyForStatus(order.status);
		const amount = orderLinesTotal(order.lines);
		row.counts[key] += 1;
		row.values[key] += amount;
		row.total += 1;
		row.value += amount;
	}
	return [...byYear.values()].sort((a, b) => a.year - b.year);
}

function zeroCounts(): Record<string, number> {
	return Object.fromEntries(
		ORDER_STACK_SERIES.map((s) => [s.key, 0])
	) as Record<string, number>;
}