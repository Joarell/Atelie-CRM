// ABC (Pareto) curve for the inbox's first chart: the open chat contact's
// orders ranked by BRL value, each point carrying the cumulative % of the
// contact's order value so the renderer can trace the classic 80/20 curve
// with A/B/C class bands. Pure (no I/O, no DOM), unit-tested in isolation.

import type { Order } from './types';
import { orderItemsText, orderLinesTotal } from './orderHistory';

export type AbcClass = 'A' | 'B' | 'C';

// Cumulative value % separating the classes — the usual 80/15/5 split.
export const ABC_A_TO = 80;
export const ABC_B_TO = 95;

export const ABC_ORDER: readonly AbcClass[] = ['A', 'B', 'C'];

export const ABC_LABELS: Record<AbcClass, string> = {
  A: 'Classe A — até 80% do valor',
  B: 'Classe B — de 80% a 95%',
  C: 'Classe C — os 5% finais'
};

// Short labels for the inbox's client-classification badge.
export const ABC_CLIENT_LABELS: Record<AbcClass, string> = {
  A: 'Cliente A',
  B: 'Cliente B',
  C: 'Cliente C'
};

export interface AbcPoint {
  key: string;
  label: string;      // every order line, shown in the hover tooltip
  short: string;      // first order line, drawn under the x axis
  date: string;       // created date, YYYY-MM-DD
  value: number;      // BRL total of the order
  share: number;      // % of the contact's total order value
  cumPct: number;     // cumulative % of the total up to this point
  itemPct: number;    // cumulative % of the ranked orders so far
  abcClass: AbcClass;
}

export interface AbcResult {
  total: number;      // BRL value across the ranked orders
  count: number;      // how many orders were ranked
  points: AbcPoint[];
}

// The class an order belongs to by cumulative value share. A lone order is
// always class A: 100% of the value sits in a single order.
export function abcClassForCum(cumPct: number, single = false): AbcClass {
  if (single || cumPct <= ABC_A_TO) return 'A';
  if (cumPct <= ABC_B_TO) return 'B';
  return 'C';
}

// Classifies a client by their own ABC curve: the tier of their highest
// value order (the first point on the curve). Walkthrough: many small,
// balanced orders puts the top one at <=80% of the client's total -> A;
// a top order carrying 80-95% -> B; one order swallowing >95% -> C.
// A client with no value-bearing orders has no classification (null).
export function clientAbcClass(orders: Order[]): AbcClass | null {
  const first = abcCurve(orders).points[0];
  return first ? first.abcClass : null;
}

// Zero-value orders are dropped: they only add a flat, meaningless tail.
// The rest are ranked by value (createdAt breaks ties) and folded into a
// cumulative share, so the curve climbs steeply through A and flattens in C.
export function abcCurve(orders: Order[]): AbcResult {
  const ranked = orders
    .map(toValue)
    .filter((row) => row.value > 0)
    .sort(byValueDesc);
  return foldPoints(ranked);
}

function foldPoints(ranked: ValueRow[]): AbcResult {
  const total = ranked.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return { total: 0, count: 0, points: [] };
  const points: AbcPoint[] = [];
  let cum = 0;
  for (let i = 0; i < ranked.length; i += 1) {
    const row = ranked[i];
    cum += row.value;
    points.push(toPoint(row, {
      cumPct: (cum / total) * 100,
      itemPct: ((i + 1) / ranked.length) * 100,
      single: ranked.length === 1,
      total
    }));
  }
  return { total, count: ranked.length, points };
}

interface Fold {
  cumPct: number;
  itemPct: number;
  single: boolean;
  total: number;
}

function toPoint(row: ValueRow, fold: Fold): AbcPoint {
  const { cumPct, itemPct, single, total } = fold;
  return {
    key: row.order.id,
    label: orderItemsText(row.order.lines),
    short: shortLabel(row.order),
    date: row.order.createdAt.slice(0, 10),
    value: row.value,
    share: (row.value / total) * 100,
    cumPct,
    itemPct,
    abcClass: abcClassForCum(cumPct, single)
  };
}

interface ValueRow {
  order: Order;
  value: number;
}

function toValue(order: Order): ValueRow {
  return { order, value: orderLinesTotal(order.lines) };
}

function byValueDesc(a: ValueRow, b: ValueRow): number {
  if (a.value !== b.value) return b.value - a.value;
  return b.order.createdAt.localeCompare(a.order.createdAt);
}

function shortLabel(order: Order): string {
  const first = order.lines[0];
  if (!first) return '';
  return `${first.qty}× ${first.productName}`;
}