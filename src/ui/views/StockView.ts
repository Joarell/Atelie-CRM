import type { AppContext } from '../../state/AppContext';
import type {
	Ingredient,
	StockMovement,
	StockMovementType,
	Unit
} from '../../domain/types';
import { formatNumber, escapeHtml, formatDate } from '../../domain/format';
import {
	renderCrudTable,
	renderEmptyState,
	type TableColumn,
	type TableSummary
} from '../CrudTable';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';

export function renderStockView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.ingredients.subscribe.bind(ctx.ingredients),
		ctx.movements.subscribe.bind(ctx.movements)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const table = crudTableHtml(ctx);
	root.innerHTML = `
		<div class="section-head"><div><h2>Estoque</h2><p>Níveis atuais e ` +
		`movimentações</p></div></div>
		${table}
		<div class="section-head" style="margin-top:26px;">` +
		`<div><h2 style="font-size:15px;">Últimas movimentações</h2></div>` +
		`</div>
		${renderHistory(ctx)}`;
	wireEvents(root, ctx);
}

function crudTableHtml(ctx: AppContext): string {
	const rows = groupIngredientsByName(ctx.ingredients.getAll());
	return renderCrudTable({
		columns: columns(),
		rows,
		actions: actionButtons,
		emptyTitle: 'Sem ingredientes',
		emptyHint: 'Cadastre ingredientes na aba Ingredientes.',
		summary: buildSummary(rows)
	});
}

export type GroupedIngredient = {
	name: string;
	unit: Unit;
	stock: number;
	minStock: number;
	ids: string[];
};

export function groupIngredientsByName(
	ingredients: Ingredient[]
): GroupedIngredient[] {
	const grouped = new Map<string, GroupedIngredient>();
	for (const ing of ingredients) {
		const key = ing.name.toLowerCase();
		const hit = grouped.get(key);
		if (hit) {
			hit.stock += ing.stock;
			hit.minStock = Math.min(hit.minStock, ing.minStock);
			hit.ids.push(ing.id);
		} else {
			grouped.set(key, {
				name: ing.name, unit: ing.unit, stock: ing.stock,
				minStock: ing.minStock, ids: [ing.id]
			});
		}
	}
	return [...grouped.values()]
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function columns(): TableColumn<GroupedIngredient>[] {
	return [
		{ header: 'Ingrediente', render: (i) => escapeHtml(i.name) },
		{
			header: 'Estoque atual',
			render: (i) => `${formatNumber(i.stock)} ${i.unit}`,
			alignRight: true
		},
		{
			header: 'Mínimo',
			render: (i) => `${formatNumber(i.minStock)} ${i.unit}`,
			alignRight: true
		},
		{ header: 'Status', render: statusBadge }
	];
}

export function buildSummary(
	rows: GroupedIngredient[]
): TableSummary<GroupedIngredient> {
	const total = rows.reduce((sum, i) => sum + i.stock, 0);
	const low = rows.filter((i) => i.stock <= i.minStock).length;
	const critical = rows.filter((i) => i.stock <= i.minStock * 0.5).length;
	return {
		render: () => [
			'',
			`Total: ${formatNumber(total)} itens`,
			`Baixo: ${low} · Crítico: ${critical}`,
			''
		]
	};
}

function statusBadge(i: GroupedIngredient): string {
	if (i.stock <= i.minStock * 0.5) {
		return `<span class="badge badge-danger">Crítico</span>`;
	}
	if (i.stock <= i.minStock) {
		return `<span class="badge badge-caramel">Baixo</span>`;
	}
	return `<span class="badge badge-sage">OK</span>`;
}

function actionButtons(ingredient: GroupedIngredient): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-move=` +
		`"${ingredient.ids[0]}">Movimentar</button>`
	);
}

function renderHistory(ctx: AppContext): string {
	const moves = [...ctx.movements.getAll()].reverse().slice(0, 12);
	if (!moves.length) {
		return renderEmptyState(
			'Nenhuma movimentação',
			'Registre entradas e saídas de estoque.'
		);
	}
	const rows = moves.map(renderHistoryRow).join('');
	return `<div class="card" style="padding:8px 18px;">${rows}</div>`;
}

function renderHistoryRow(m: StockMovement): string {
	const date = formatDate(m.date.slice(0, 10));
	const badge = m.type === 'entrada' ? 'badge-sage' : 'badge-berry';
	const delta = m.type === 'entrada' ? '+' : '-';
	return (
		`<div class="calc-row"><span>${date} · ${escapeHtml(m.ingredientName)} ` +
		`· ${escapeHtml(m.note)}</span>
		<span class="badge ${badge}">${delta}${m.qty}</span></div>`
	);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	root.querySelectorAll<HTMLElement>('[data-move]').forEach((btn) =>
		btn.addEventListener('click', () =>
			openMovementForm(ctx, btn.dataset.move!)
		)
	);
}

function openMovementForm(ctx: AppContext, ingredientId: string): void {
	const ingredient = ctx.ingredients.getById(ingredientId);
	if (!ingredient) return;
	const title = `Movimentar: ${ingredient.name}`;
	const modal = openModal({ title, bodyHtml: formHtml(ingredient) });
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, ingredientId)
	);
}

function formHtml(ingredient: Ingredient): string {
	return `<form>
		<div class="field"><label class="field-label">Tipo</label>\n      ` +
		`<select class="input" name="type">` +
		`<option value="entrada">Entrada (compra)</option>` +
		`<option value="saida">Saída (uso/perda)</option></select></div>
		<div class="field"><label class="field-label">Quantidade (` +
		`${ingredient.unit})</label>
			<input class="input" type="number" step="0.01" min="0" ` +
		`name="qty" required></div>
		<div class="field"><label class="field-label">Observação</label>` +
		`<input class="input" name="note" placeholder="Ex: compra no ` +
			`fornecedor X">` +
		`</div>
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Registrar</button>` +
		`</div></form>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	ingredientId: string
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	await ctx.stock.registerMovement(
		ingredientId,
		values.type as StockMovementType,
		Number(values.qty),
		values.note
	);
	closeModal();
	showToast('Movimentação registrada');
}