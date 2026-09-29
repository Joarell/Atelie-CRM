// "Pedidos do mês" bar chart: every order in the system for the current
// calendar month, one bar per day that has orders. Plain SVG, no library.

import {
  ordersByDay, monthSummary, allOrderMonths, type InboxDayPoint
} from '../../../domain/inboxMonthChart';
import { formatBRL, formatNumber } from '../../../domain/format';
import type { Order } from '../../../domain/types';

const W = 640;
const H = 160;
const PAD_TOP = 16;
const PAD_BOTTOM = 6;
const BAR_RATIO = 0.62;

const PT_MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export function monthChartLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const name = PT_MONTHS[month - 1] ?? monthKey;
  return `${name} ${year}`;
}

function maxTotal(points: InboxDayPoint[]): number {
  return points.reduce((max, p) => Math.max(max, p.total), 1) || 1;
}

function barY(p: InboxDayPoint, max: number): number {
  const span = H - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + (max - p.total) / max * span;
}

function bars(points: InboxDayPoint[]): string {
  const max = maxTotal(points);
  const slot = W / points.length;
  const barW = Math.max(slot * BAR_RATIO, 6);
  const base = H - PAD_BOTTOM;
  return points.map((p, i) => {
    const x = i * slot + (slot - barW) / 2;
    const y = barY(p, max);
    const h = Math.max(base - y, 2);
    return `<rect class="month-chart-bar" x="${x}" y="${y}" width="${barW}"` +
      ` height="${h}" rx="3"><title>${p.label} · ${p.total}</title></rect>`;
  }).join('');
}

// Day labels live in an HTML row below the plot (like the sibling charts'),
// not inside the SVG: the viewBox only spans the bars, so in-SVG text would
// be clipped. Each label is centred on its day's bar slot.
function xLabelRow(points: InboxDayPoint[]): string {
  const cells = points.map((p, i) => {
    const left = ((i + 0.5) / points.length) * 100;
    const last = i === points.length - 1 ? ' is-last' : '';
    return `<span class="month-chart-xlabel${last}"` +
      ` style="left:${left}%">${p.label}</span>`;
  }).join('');
  return `<div class="month-chart-x">${cells}</div>`;
}

function cols(points: InboxDayPoint[]): string {
  const slot = W / points.length;
  return points.map((p, i) => {
    const x = i * slot;
    const isLast = i === points.length - 1;
    return `<div class="month-chart-col" data-key="${p.day}">` +
      `<div class="inbox-chart-tip${isLast ? ' inbox-chart-tip-left' : ''}">` +
      `<strong>${p.label}</strong><span>${formatNumber(p.total)}` +
      ` pedido${p.total === 1 ? '' : 's'}</span>` +
      `<span>${formatBRL(p.value)}</span></div></div>`;
  }).join('');
}

export function monthChartPlot(
  points: InboxDayPoint[],
  summary: { orders: number; value: number }
): string {
  if (points.length === 0) return '';
  return `<div class="inbox-chart-plot">` +
    `<svg class="inbox-chart-svg" viewBox="0 0 ${W} ${H}"` +
    ` preserveAspectRatio="none">${bars(points)}</svg>` +
    `<div class="month-chart-cols">${cols(points)}</div>` +
    `${legendHtml(summary)}</div>` +
    xLabelRow(points);
}

function monthMenuHtml(months: string[], selected: string): string {
  const opts = months.map(
    (m) => `<option value="${m}"${m === selected ? ' selected' : ''}>` +
      `${monthChartLabel(m)}</option>`
  ).join('');
  return `<div class="month-menu" role="group" aria-label="Mês do gráfico">` +
    `<select class="month-select" data-month-select=""` +
    ` aria-label="Escolher mês">${opts}</select></div>`;
}

function monthOptions(months: string[], selected: string): string[] {
  const out = new Set(months);
  out.add(selected);
  return [...out].sort((a, b) => b.localeCompare(a));
}

function headHtml(months: string[], selected: string): string {
  return `<div class="inbox-chart-head"><h3>Pedidos do mês</h3>` +
    `${monthMenuHtml(months, selected)}</div>` +
    `<p class="month-chart-sub">${monthChartLabel(selected)}` +
    ` · todos os clientes</p>`;
}

export function inboxMonthChartHtml(
  orders: readonly Order[], monthKey: string
): string {
  const points = ordersByDay([...orders], monthKey);
  const summary = monthSummary(points);
  const months = monthOptions(allOrderMonths(orders), monthKey);
  const head = headHtml(months, monthKey);
  if (points.length === 0) {
    return `<section class="inbox-chart month-chart">${head}` +
      `<div class="inbox-chart-plot"><div class="month-chart-empty">` +
      `Sem pedidos neste mês</div>` +
      `${legendHtml(summary)}</div>` +
      `<div class="month-chart-x"></div>` +
      `</section>`;
  }
  return `<section class="inbox-chart month-chart">${head}` +
    `${monthChartPlot(points, summary)}</section>`;
}

function legendHtml(summary: { orders: number; value: number }): string {
  return `<div class="inbox-chart-legend">` +
    `<span class="chart-legend-item"><span class="chart-swatch ` +
    `month-chart-swatch"></span>${formatNumber(summary.orders)} pedido` +
    `${summary.orders === 1 ? '' : 's'} · ${formatBRL(summary.value)}` +
    `</span></div>`;
}