import type { AppContext } from '../../state/AppContext';
import { formatBRL, escapeText } from '../../domain/format';
import { autoRerender } from '../reactive';
import { qs } from '../dom';

let currentMonthKey = currentMonth();
let rerender: () => void;

export function renderCmvView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	currentMonthKey = currentMonth();
	const doRerender = () => draw(root, ctx, currentMonthKey);
	rerender = doRerender;
	return autoRerender(doRerender, [
		ctx.ingredients.subscribe.bind(ctx.ingredients),
		ctx.orders.subscribe.bind(ctx.orders),
		ctx.products.subscribe.bind(ctx.products),
		ctx.purchases.subscribe.bind(ctx.purchases),
		ctx.movements.subscribe.bind(ctx.movements)
	]);
}

function draw(root: HTMLElement, ctx: AppContext, month: string): void {
	const report = ctx.cmv.report(month);
	const rows = [
		cmvRow('Estoque Inicial (EI)', report.initialStock),
		cmvRow('Compras do Período (C)', report.purchases),
		cmvRow('Estoque Final (EF)', report.finalStock),
		cmvRow('CMV = EI + C − EF', report.cmv, true),
		cmvRow('Mão de Obra do Período', report.laborCost),
		cmvRow('CPV = CMV + Mão de Obra', report.cpv, true)
	];
	root.innerHTML = `
		<div class="section-head">
			<div><h2>CMV do Período</h2><p>Apuração CMV = EI + C − EF</p></div>
			<div class="field-row" style="grid-template-columns:auto 1fr;">
				<label class="field-label" style="margin-right:8px;">Mês</label>
				<input type="month" class="input" id="cmv-month" value="${month}">
			</div>
		</div>
		<div class="cmv-report">${rows.join('')}</div>`;
	wireEvents(root, ctx);
}

function cmvRow(label: string, value: number, total = false): string {
	const cls = total ? 'total' : '';
	return `<div class="cmv-row ${cls}"><span>${label}</span>` +
		`<span>${formatBRL(value)}</span></div>`;
}

function currentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs<HTMLInputElement>('#cmv-month', root).addEventListener('change', (e) => {
		const month = (e.target as HTMLInputElement).value;
		draw(root, ctx, month);
	});
}