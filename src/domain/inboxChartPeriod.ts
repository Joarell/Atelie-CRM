// Aggregation for the inbox "Pedidos por período" chart: the open chat
// contact's orders grouped into week/month/year buckets (driven by a menu),
// split into the same stacked status series as the yearly chart. Pure code
// (no I/O, no DOM), so the bucketing math is unit-tested in isolation.

import type { Order } from './types';
import { orderLinesTotal } from './orderHistory';
import { ORDER_STACK_SERIES, seriesKeyForStatus } from './inboxChart';

export type ChartPeriod = 'semana' | 'mes' | 'ano';

export const CHART_PERIODS: readonly ChartPeriod[] = [
  'semana',
  'mes',
  'ano'
];

export const PERIOD_LABELS: Record<ChartPeriod, string> = {
  semana: 'Semana',
  mes: 'Mês',
  ano: 'Ano'
};

export interface InboxPeriodBucket {
  key: string;
  label: string;
  counts: Record<string, number>;
  values: Record<string, number>;
  total: number;
  value: number;
}

// The bucket key an order lands on, '' for a createdAt that carries no
// usable date (the aggregator skips those instead of crashing the chart).
export function periodBucketKey(
  order: Order,
  period: ChartPeriod
): string {
  if (period === 'ano') return yearKey(order);
  if (period === 'mes') return monthKey(order);
  return weekKey(order);
}

// Buckets are a chain of zero-filled rows (every series present), one per
// distinct sortable key, ascending. Counts mirror the yearly chart; values
// are the BRL totals from `orderLinesTotal`.
export function ordersToPeriodSeries(
  orders: Order[],
  period: ChartPeriod
): InboxPeriodBucket[] {
  const byKey = new Map<string, InboxPeriodBucket>();
  for (const order of orders) {
    const key = periodBucketKey(order, period);
    if (!key) continue;
    let row = byKey.get(key);
    if (!row) {
      row = freshBucket(key, period);
      byKey.set(key, row);
    }
    addOrderToBucket(row, order);
  }
  return [...byKey.values()].sort(compareKeys);
}

function freshBucket(key: string, period: ChartPeriod): InboxPeriodBucket {
  return {
    key,
    label: bucketLabel(period, key),
    counts: zeroCounts(),
    values: zeroCounts(),
    total: 0,
    value: 0
  };
}

function addOrderToBucket(row: InboxPeriodBucket, order: Order): void {
  const series = seriesKeyForStatus(order.status);
  const amount = orderLinesTotal(order.lines);
  row.counts[series] += 1;
  row.values[series] += amount;
  row.total += 1;
  row.value += amount;
}

function compareKeys(a: InboxPeriodBucket, b: InboxPeriodBucket): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function yearKey(order: Order): string {
  const year = Number(order.createdAt.slice(0, 4));
  return Number.isFinite(year) && year >= 2000
    ? `${year}`
    : '';
}

function monthKey(order: Order): string {
  const mm = order.createdAt.slice(5, 7);
  const year = Number(order.createdAt.slice(0, 4));
  if (!Number.isFinite(year) || year < 2000) return '';
  return String(mm).length === 2 ? `${year}-${mm}` : '';
}

function weekKey(order: Order): string {
  return isoWeekKey(order.createdAt.slice(0, 10));
}

// ISO-8601 week (UTC): the Thursday of the order's week determines its year.
function isoWeekKey(date: string): string {
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p))) {
    return '';
  }
  if (!(parts[0] >= 2000 && parts[1] >= 1 && parts[1] <= 12) || parts[2] < 1) {
    return '';
  }
  const ms = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const day = (new Date(ms).getUTCDay() + 6) % 7;
  const thu = ms + (3 - day) * DAY_MS;
  const isoYear = new Date(thu).getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Day = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1 = jan4 - jan4Day * DAY_MS;
  const week = 1 + Math.floor((thu - week1) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;

function bucketLabel(period: ChartPeriod, key: string): string {
  if (key.length === 4) return key;
  if (key.charAt(5) === 'W') {
    return `S${key.slice(6)}/${key.slice(2, 4)}`;
  }
  return `${key.slice(5)}/${key.slice(0, 4)}`;
}

function zeroCounts(): Record<string, number> {
  return Object.fromEntries(
    ORDER_STACK_SERIES.map((s) => [s.key, 0])
  ) as Record<string, number>;
}