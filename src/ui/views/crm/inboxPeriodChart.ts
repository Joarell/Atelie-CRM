import type { Order } from '../../../domain/types';
import {
	CHART_PERIODS,
	PERIOD_LABELS,
	ordersToPeriodSeries,
	type ChartPeriod,
	type InboxPeriodBucket
} from '../../../domain/inboxChartPeriod';
import {
	ORDER_STACK_SERIES,
	type OrderYearSeries
} from '../../../domain/inboxChart';
import { formatBRL } from '../../../domain/format';
import { escapeAtrib as escapeAttr } from '../../../domain/format';

// The open chat contact's orders bucketed by week/month/year, the
// granularity picked in a `.period-menu` of three buttons. Same stacked
// series, same hover tooltip/legend language — but its own `period-*` classes
// so sibling charts' tests and CSS are untouched. The legend lives inside the
// plot, pinned above the axis row. Plain SVG, no library.

const W = 640;
const H = 160;
const PAD_TOP = 16;
const PAD_BOTTOM = 6;

interface Pt {
	x: number;
	y: number;
}

export function inboxPeriodChartHtml(
	orders: Order[],
	period: ChartPeriod
): string {
	const buckets = ordersToPeriodSeries(orders, period);
	const body = buckets.length > 0
		? plotHtml(buckets) + xLabelsHtml(buckets)
		: emptyHtml();
	return (
		`<section class="inbox-chart inbox-chart--period" ` +
		`aria-label="Pedidos por período do contato">` +
		`<div class="inbox-chart-head"><h3>Pedidos por período</h3>` +
		`${menuHtml(period)}</div>` +
		body +
		'</section>'
	);
}

function menuHtml(period: ChartPeriod): string {
	const options = CHART_PERIODS
		.map((p) => {
			const active = p === period;
			return `<button type="button" class="period-option${active
				? ' is-active' : ''}" data-period="${p}" ` +
				`aria-pressed="${active ? 'true' : 'false'}">` +
				`${PERIOD_LABELS[p]}</button>`;
		})
		.join('');
	return `<div class="period-menu" role="group" ` +
		`aria-label="Período do gráfico">${options}</div>`;
}

function plotHtml(buckets: InboxPeriodBucket[]): string {
	const points = shapePoints(buckets);
	const max = bucketMax(buckets);
	return (
		`<div class="inbox-chart-plot">` +
		`<svg class="inbox-chart-svg" viewBox="0 0 ${W} ${H}" ` +
		`preserveAspectRatio="none" role="img" aria-label="Gráfico de área">` +
		`<defs>${gradients()}</defs>` +
		gridLines() +
		seriesFills(buckets, points, max) +
		`</svg>` +
		bulletLayer(buckets) +
		hoverColumns(buckets, max) +
		legendHtml() +
		`</div>`
	);
}

function shapePoints(buckets: InboxPeriodBucket[]): number[] {
	if (buckets.length === 1) return [W * 0.18, W * 0.82];
	return buckets.map((_, i) => (i / (buckets.length - 1)) * W);
}

function bucketMax(buckets: InboxPeriodBucket[]): number {
	return Math.max(1, ...buckets.map((b) => b.total));
}

function valueY(value: number, max: number): number {
	const span = H - PAD_TOP - PAD_BOTTOM;
	return H - PAD_BOTTOM - (value / max) * span;
}

function tickX(i: number, count: number): string {
	const left = (count === 1 ? 0.5 : i / (count - 1)) * 100;
	return `${left}%`;
}

function gridLines(): string {
	const marks = [0, 0.25, 0.5, 0.75, 1];
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	return marks
		.map((f) => {
			const y = H - PAD_BOTTOM - f * plotH;
			return `<line class="chart-grid" x1="0" y1="${y}" ` +
				`x2="${W}" y2="${y}"/>`;
		})
		.join('');
}

function gradients(): string {
	return ORDER_STACK_SERIES
		.map((s) =>
			`<linearGradient id="period-grad-${s.key}" x1="0" y1="0" ` +
			`x2="0" y2="1"><stop class="period-stop-${s.key}" offset="5%" ` +
			`stop-opacity="0.85"/><stop class="period-stop-${s.key}" ` +
			`offset="95%" stop-opacity="0.1"/></linearGradient>`)
		.join('');
}

function seriesFills(
	buckets: InboxPeriodBucket[],
	points: number[],
	max: number
): string {
	const base = new Array(points.length).fill(0);
	return ORDER_STACK_SERIES
		.map((series) => seriesGroup(buckets, series, points, base, max))
		.join('');
}

function seriesGroup(
	buckets: InboxPeriodBucket[],
	series: OrderYearSeries,
	points: number[],
	base: number[],
	max: number
): string {
	const top: Pt[] = [];
	const bottom: Pt[] = [];
	for (let i = 0; i < points.length; i += 1) {
		const value = buckets[i]?.counts[series.key] ?? 0;
		top.push({ x: points[i], y: valueY(base[i] + value, max) });
		bottom.push({ x: points[i], y: valueY(base[i], max) });
		base[i] += value;
	}
	return (
		`<g class="period-series period-series-${series.key}">` +
		`<path class="period-chart-area" d="${areaPath(top, bottom)}" ` +
		`fill="url(#period-grad-${series.key})"/>` +
		`<path class="period-chart-line" d="${edgePath(top)}"/>` +
		`</g>`
	);
}

function areaPath(top: Pt[], base: Pt[]): string {
	if (top.length === 0) return '';
	let d = smoothPath(top);
	const last = base[base.length - 1];
	d += ` L ${last.x} ${last.y}`;
	for (let i = base.length - 2; i >= 0; i -= 1) {
		d += ` L ${base[i].x} ${base[i].y}`;
	}
	return `${d} Z`;
}

function edgePath(top: Pt[]): string {
	return smoothPath(top);
}

// "Natural"-style smoothing: cubic beziers whose control points sit at the
// midpoint of each segment, so the curve passes through every data point.
function smoothPath(pts: Pt[]): string {
	if (pts.length === 0) return '';
	if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
	let d = `M ${pts[0].x} ${pts[0].y} `;
	for (let i = 0; i < pts.length - 1; i += 1) {
		const a = pts[i];
		const b = pts[i + 1];
		const midX = (a.x + b.x) / 2;
		d += `C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y} `;
	}
	return d;
}

function bulletLayer(buckets: InboxPeriodBucket[]): string {
	const topPct = ((H - PAD_BOTTOM) / H) * 100;
	const bullets = buckets
		.map((b, i) =>
			`<span class="period-chart-bullet" data-key="${b.key}" ` +
			`style="left:${tickX(i, buckets.length)};top:${topPct}%"></span>`)
		.join('');
	return `<div class="period-chart-bullets">${bullets}</div>`;
}

function hoverColumns(
	buckets: InboxPeriodBucket[],
	max: number
): string {
	const widthPct = 100 / buckets.length;
	return buckets
		.map((b, i) => {
			const left = i * widthPct;
			const topPct = (valueY(b.total, max) / H) * 100;
			return `<div class="period-chart-col" data-key="${b.key}" ` +
				`aria-label="${escapeAttr(bucketTipLabel(b))}" ` +
				`style="left:${left}%;width:${widthPct}%">` +
				bucketPoint(topPct) +
				bucketTipHtml(b, topPct, i === buckets.length - 1) +
				'</div>';
		})
		.join('');
}

function bucketPoint(topPct: number): string {
	return `<span class="period-chart-point" style="top:${topPct}%"></span>`;
}

function bucketTipHtml(
	bucket: InboxPeriodBucket,
	topPct: number,
	last: boolean
): string {
	const rows = ORDER_STACK_SERIES.map((s) => {
		const count = bucket.counts[s.key] ?? 0;
		const value = formatBRL(bucket.values[s.key] ?? 0);
		return `<span class="inbox-chart-tip-row"><i class="chart-swatch ` +
			`${seriesClass(s.key)}"></i>${s.label} <b>${count}</b> · ` +
			`${value}</span>`;
	}).join('');
	const side = last ? ' inbox-chart-tip-left' : '';
	return `<div class="inbox-chart-tip${side}" ` +
		`style="top:${tipTop(topPct)}%;"><strong>${bucket.label}</strong>` +
		`<span class="inbox-chart-tip-total">${formatBRL(bucket.value)}</span>` +
		rows + '</div>';
}

function tipTop(topPct: number): number {
	return Math.min(74, Math.max(24, topPct));
}

function bucketTipLabel(bucket: InboxPeriodBucket): string {
	return `${bucket.label} · Total ${formatBRL(bucket.value)}`;
}

function xLabelsHtml(buckets: InboxPeriodBucket[]): string {
	const cells = buckets
		.map((b, i) =>
			`<span class="period-chart-xlabel" data-key="${b.key}" ` +
			`style="left:${tickX(i, buckets.length)}">${b.label}</span>`)
		.join('');
	return `<div class="period-chart-x">${cells}</div>`;
}

function legendHtml(): string {
	const items = ORDER_STACK_SERIES.map((s) =>
		`<span class="chart-legend-item"><i class="chart-swatch ` +
		`${seriesClass(s.key)}"></i>${s.label}</span>`).join('');
	return `<div class="inbox-chart-legend">${items}</div>`;
}

function emptyHtml(): string {
	return `<div class="period-chart-empty">Sem pedidos no histórico ` +
		`deste contato.</div>`;
}

function seriesClass(key: string): string {
	return `period-series-${key}`;
}