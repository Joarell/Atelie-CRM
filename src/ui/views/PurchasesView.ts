import type { AppContext } from '../../state/AppContext';
import type { Purchase, PurchaseItem } from '../../domain/types';
import type { Ingredient } from '../../domain/types';
import { formatBRL, escapeText, escapeAtrib } from '../../domain/format';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, qsIf, formValues } from '../dom';
import { renderEmptyState } from '../CrudTable';

// One row of the purchase form, as the DOM holds it while the modal is open.
interface FormItem {
	ingredientId: string;
	qty: number;
	packageSize: number;
	packagePrice: number;
}

export function renderPurchasesView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.purchases.subscribe.bind(ctx.purchases),
		ctx.ingredients.subscribe.bind(ctx.ingredients)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const purchases = ctx.purchases.getAll();
	const body = purchases.length
		? listHtml(purchases, ctx)
		: renderEmptyState(
				'Nenhuma compra ainda',
				'Registre a primeira compra de ingredientes para apurar o CMV.'
			);
	root.innerHTML = sectionHeadHtml() + monthFilterHtml() + body;
	wireEvents(root, ctx);
}

function sectionHeadHtml(): string {
	return `<div class="section-head">
		<div>
			<h2>Compras</h2>
			<p>Registro de compras de ingredientes para apuração do CMV</p>
		</div>
		<button class="btn btn-primary" id="new-purchase">+ Nova compra</button>
	</div>`;
}

function monthFilterHtml(): string {
	const month = currentMonth();
	return `<div class="field-row" style="grid-template-columns:auto 1fr;">
		<label class="field-label" style="margin-right:8px;">Mês</label>
		<input type="month" class="input" id="purchase-month"
			value="${month}">
	</div>`;
}

function listHtml(purchases: any[], ctx: AppContext): string {
	const month = currentMonth();
	const filtered = purchases
		.filter((p) => p.date.slice(0, 7) === month)
		.sort((a, b) => a.date.localeCompare(b.date));
	const rows = filtered.map((p) => purchaseRowHtml(p, ctx)).join('');
	return `<div class="purchases-list">${rows}</div>`;
}

function purchaseRowHtml(purchase: any, ctx: AppContext): string {
	const total = purchase.items.reduce((sum: number, item: any) => {
		return sum + (item.qty / item.packageSize) * item.packagePrice;
	}, 0);
	const itemsHtml = purchase.items.map(itemHtml).join('');
	return `<div class="purchase-row">
		${purchaseMainHtml(purchase)}
		${purchaseActionsHtml(total, purchase.id)}
		<div class="purchase-items">${itemsHtml}</div></div>`;
}

function purchaseMainHtml(purchase: any): string {
	return `<div class="purchase-main">
		<strong>${escapeText(purchase.supplier)}</strong>
		<span class="soft">${purchase.date} · ${purchase.items.length} item(ns)</span>
	</div>`;
}

function purchaseActionsHtml(total: number, id: string): string {
	return `<div class="purchase-actions">
		<span class="num">${formatBRL(total)}</span>
		<button class="btn btn-ghost btn-sm btn-danger"
			data-delete="${id}">Excluir</button>
	</div>`;
}

function itemHtml(item: any): string {
	const val = (item.qty / item.packageSize) * item.packagePrice;
	const name = escapeText(item.ingredientName);
	const qty = `${item.qty} ${item.unit || ''} (R$ ${formatBRL(val)})`;
	return `<span class="soft">${name}: ${qty}</span>`;
}

function currentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-purchase', root).addEventListener('click', () => openForm(ctx));
	qs('#purchase-month', root).addEventListener('change', () => {
		// Month change triggers re-render via autoRerender subscription
	});
	root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
		btn.addEventListener('click', () => handleDelete(ctx, btn.dataset.delete!))
	);
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir esta compra?')) return;
	await ctx.purchasesService.remove(id);
	showToast('Compra excluída');
}

function openForm(ctx: AppContext, existing?: any): void {
	const items: any[] = existing
		? existing.items.map((i: any) => ({ ...i }))
		: [];
	const draft = existing ?? emptyDraft();
	const modal = openModal({
		title: existing ? 'Editar compra' : 'Nova compra',
		bodyHtml: formShell(draft)
	});
	redrawItems(modal, ctx, items, draft);
	wireFormEvents(modal, ctx, items, draft, existing);
}

function emptyDraft(): any {
	return {
		supplier: '',
		invoice: '',
		date: currentMonth(),
		items: [],
		notes: ''
	};
}

function formShell(v: any): string {
	return `<form id="purchase-form">
		<div class="field-row" style="grid-template-columns:2fr 1fr 1fr;">
			${textField('supplier', 'Fornecedor', v.supplier)}
			${textField('invoice', 'Nota fiscal', v.invoice)}
			${dateField('date', 'Data', v.date)}
		</div>
		<label class="field-label">Itens da compra</label>
		<div class="line-item-head">
			<span>Ingrediente</span><span>Qtd.</span>
			<span>Tamanho pacote</span><span>Preço pacote</span>
			<span></span>
		</div>
		<div id="items-container"></div>
		<button type="button" class="btn btn-sm" id="add-item">+ Adicionar
		item</button>
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Salvar compra</button>
		</div></form>`;
}

function redrawItems(
	modal: HTMLElement,
	ctx: AppContext,
	items: any[],
	draft: any
): void {
	const container = qs('#items-container', modal);
	const html = items.map((item, i) => itemRowHtml(item, i, ctx)).join('');
	container.innerHTML = html;
	wireItemEvents(modal, ctx, items, draft);
}

function itemRowHtml(item: any, index: number, ctx: AppContext): string {
	const opts = ctx.ingredients
		.getAll()
		.map((ing: Ingredient) => optionHtml(item, ing))
		.join('');
	return `<div class="line-item" data-row="${index}">
		<select class="input" data-ingredient>${opts}</select>
		${numberField('data-qty', item.qty, 'Qtd.')}
		${numberField('data-packageSize', item.packageSize, 'Tam. pacote')}
		${numberField('data-packagePrice', item.packagePrice, 'Preço pacote')}
		<button type="button" class="remove-row" data-remove-row
			aria-label="Remover">✕</button></div>`;
}

function optionHtml(item: any, ing: Ingredient): string {
	const selected = item.ingredientId === ing.id ? 'selected' : '';
	const label = escapeText(ing.name);
	return `<option value="${ing.id}" ${selected}>${label}</option>`;
}

function numberField(attr: string, value: unknown, hint: string): string {
	return `<input class="input" type="number" step="0.01" min="0.01"
		${attr} value="${value || ''}" placeholder="${hint}">`;
}

function wireFormEvents(
	modal: HTMLElement,
	ctx: AppContext,
	items: any[],
	draft: any,
	existing?: any
): void {
	qs('#add-item', modal).addEventListener('click', () => {
		items.push({ ingredientId: '', qty: 0, packageSize: 0, packagePrice: 0 });
		redrawItems(modal, ctx, items, draft);
	});
	qs('#purchase-form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing)
	);
}

function wireItemEvents(
	modal: HTMLElement,
	ctx: AppContext,
	items: any[],
	draft: any
): void {
	modal.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
		const index = Number(row.dataset.row);
		wireValue(row, '[data-ingredient]', 'change', (value) =>
			updateItem(items, index, { ingredientId: value })
		);
		wireValue(row, '[data-qty]', 'input', (value) =>
			updateItem(items, index, { qty: Number(value) })
		);
		wireValue(row, '[data-packageSize]', 'input', (value) =>
			updateItem(items, index, { packageSize: Number(value) })
		);
		wireValue(row, '[data-packagePrice]', 'input', (value) =>
			updateItem(items, index, { packagePrice: Number(value) })
		);
		qs('[data-remove-row]', row).addEventListener('click', () => {
			items.splice(index, 1);
			redrawItems(modal, ctx, items, draft);
		});
	});
}

function wireValue(
	row: HTMLElement,
	selector: string,
	type: string,
	update: (value: string) => void
): void {
	qs<HTMLInputElement>(selector, row).addEventListener(type, (e) =>
		update((e.target as HTMLInputElement).value)
	);
}

function updateItem(items: any[], index: number, patch: any): void {
	items[index] = { ...items[index], ...patch };
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: any
): Promise<void> {
	event.preventDefault();
	const form = event.target as HTMLFormElement;
	const values = formValues(form);
	const rows = readFormItems(form);
	const problem = dateProblem(values) ?? itemProblem(rows, ctx);
	if (problem) {
		showToast(problem);
		return;
	}
	await savePurchase(ctx, existing, buildDraft(values, rows, ctx));
	closeModal();
	showToast('Compra salva');
}

// Reads the rows straight from the DOM: the closure array misses whatever the
// user typed after the last `input` event was redrawn.
function readFormItems(form: HTMLFormElement): FormItem[] {
	const rows: FormItem[] = [];
	form.querySelectorAll<HTMLElement>('[data-row]').forEach((row) =>
		rows.push(readFormItem(row))
	);
	return rows;
}

function readFormItem(row: HTMLElement): FormItem {
	return {
		ingredientId: fieldValue(row, '[data-ingredient]'),
		qty: numberValue(row, '[data-qty]'),
		packageSize: numberValue(row, '[data-packageSize]'),
		packagePrice: numberValue(row, '[data-packagePrice]')
	};
}

// `qsIf` because the workerd lib shadows `Element`: `querySelector<T>` cannot
// take a lib.dom `HTMLSelectElement` here (see the note in dom.ts).
function fieldValue(row: HTMLElement, selector: string): string {
	return qsIf<HTMLInputElement | HTMLSelectElement>(selector, row)?.value ?? '';
}

function numberValue(row: HTMLElement, selector: string): number {
	const parsed = Number(fieldValue(row, selector));
	return Number.isFinite(parsed) ? parsed : 0;
}

// Same wording family as `PurchasesService.validateDraft`, so the toast the
// user sees before sending matches the error the service would raise.
function dateProblem(values: Record<string, string>): string | null {
	const today = new Date().toISOString().slice(0, 10);
	return values.date > today ? 'A data da compra não pode ser futura' : null;
}

function itemProblem(items: FormItem[], ctx: AppContext): string | null {
	if (items.length === 0) return 'Adicione pelo menos um item válido';
	for (const item of items) {
		const name = ingredientName(item, ctx);
		if (!name) return 'Selecione o ingrediente do item';
		if (item.qty <= 0) return `Quantidade inválida para ${name}`;
		if (item.packagePrice <= 0) return `Preço inválido para ${name}`;
		if (item.packageSize <= 0) {
			return `Tamanho de pacote inválido para ${name}`;
		}
	}
	return null;
}

function buildDraft(
	values: Record<string, string>,
	items: FormItem[],
	ctx: AppContext
): Omit<Purchase, 'id'> {
	return {
		supplier: values.supplier,
		invoice: values.invoice,
		date: values.date,
		items: items.map((item) => namedItem(item, ctx)),
		notes: values.notes || ''
	};
}

function namedItem(item: FormItem, ctx: AppContext): PurchaseItem {
	return { ...item, ingredientName: ingredientName(item, ctx) };
}

function ingredientName(item: FormItem, ctx: AppContext): string {
	return ctx.ingredients.getById(item.ingredientId)?.name ?? '';
}

async function savePurchase(
	ctx: AppContext,
	existing: any,
	draft: Omit<Purchase, 'id'>
): Promise<void> {
	if (existing) await ctx.purchasesService.remove(existing.id);
	await ctx.purchasesService.register(draft);
}

function textField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" name="${name}" value="${escapeAtrib(value)}"
			required></div>`;
}

function dateField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" type="date" name="${name}" value="${value}"
			required></div>`;
}
