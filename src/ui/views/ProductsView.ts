import type { AppContext } from '../../state/AppContext';
import type {
	Product,
	ProductItem,
	ProductItemKind
} from '../../domain/types';
import {
	formatBRL,
	formatNumber,
	uid,
	escapeText,
	escapeAtrib
} from '../../domain/format';
import { renderEmptyState } from '../CrudTable';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';
import { icon } from '../icons';
import { ingredientUnitCost } from '../../domain/pricing';

export function renderProductsView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.products.subscribe.bind(ctx.products),
		ctx.components.subscribe.bind(ctx.components),
		ctx.ingredients.subscribe.bind(ctx.ingredients),
		ctx.settings.subscribe.bind(ctx.settings)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const products = ctx.products.getAll();
	const body = products.length
		? cardsHtml(products, ctx)
		: renderEmptyState(
				'Nenhum produto ainda',
				'Monte a primeira ficha de venda combinando ingredientes e componentes.'
			);
	root.innerHTML = `
		<div class="section-head">
			<div><h2>Produtos</h2><p>Tortas de vitrine e sua ` +
			`precificação completa</p></div>
			<button class="btn btn-primary" id="new-product">+ Novo produto</button>
		</div>
		${body}`;
	wireEvents(root, ctx);
}

function cardsHtml(products: Product[], ctx: AppContext): string {
	const cards = products.map((p) => renderCard(p, ctx)).join('');
	return `<div class="grid-cards">${cards}</div>`;
}

function renderCard(product: Product, ctx: AppContext): string {
	const pricing = ctx.pricing.productPricing(product);
	return `<div class="recipe-card">
		<div class="rc-head"><div class="rc-eyebrow">${
			escapeText(product.category || 'Produto')
		} · rende ${product.yieldUnits}</div>
			<div class="rc-title">${escapeText(product.name)}</div></div>
		<div class="rc-body">
			<div class="calc-row"><span class="soft">Custo total</span>` +
			`<span class="num">${formatBRL(pricing.totalCost)}</span></div>
			<div class="calc-row"><span class="soft">Preço sugerido</span>` +
			`<strong class="num">${formatBRL(pricing.suggestedPrice)}` +
			`</strong></div>
			<div class="calc-row"><span class="soft">Preço por unidade</span>` +
			`<span class="num">${formatBRL(pricing.unitPrice)}</span></div>
		</div>
		<div class="rc-foot"><span class="soft">Lucro</span>
			<span class="badge badge-sage">${formatBRL(pricing.profit)}` +
			` · ${formatNumber(pricing.profitPercent)}%</span></div>
		<div class="rc-actions">
			${cardActions(product)}</div></div>`;
}

function cardActions(product: Product): string {
	return `<button class="btn btn-ghost btn-sm" data-edit="${
		product.id
	}">Editar</button>
			<button class="btn btn-ghost btn-sm btn-danger" data-delete="${
				product.id
			}">Excluir</button>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-product', root).addEventListener('click', () => openForm(ctx));
	root.querySelectorAll<HTMLElement>('[data-edit]').forEach((btn) =>
		btn.addEventListener('click', () =>
			openForm(ctx, ctx.products.getById(btn.dataset.edit!))
		)
	);
	root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
		btn.addEventListener('click', () => handleDelete(ctx, btn.dataset.delete!))
	);
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este produto?')) return;
	await ctx.products.remove(id);
	showToast('Produto excluído');
}

// --- Form ---

function openForm(ctx: AppContext, existing?: Product): void {
	const rows: ProductItem[] = existing
		? existing.items.map((i) => ({ ...i }))
		: [];
	const draft: Product = existing ?? emptyProduct(ctx);
	const modal = openModal({
		title: existing ? 'Editar produto' : 'Novo produto',
		bodyHtml: formShell(draft)
	});
	redrawRows(modal, ctx, rows, draft);
	wireFormEvents(modal, ctx, rows, draft, existing);
}

// New products start from the current Settings defaults, but every one of
// these numbers is just a starting point — the form below lets you change
// all of them per product before (or after) saving.
function emptyProduct(ctx: AppContext): Product {
	const s = ctx.settings.get();
	return {
		id: '', name: '', category: '',
		yieldUnits: 10, prepTime: 30,
		labor: {
			salary: s.salary, daysPerMonth: s.daysPerMonth,
			hoursPerDay: s.hoursPerDay
		},
		fixedExpenses: {
			rent: s.rent, energy: s.energy,
			water: s.water, internet: s.internet,
			office: s.office, mei: s.mei
		},
		variablePercent: s.variablePercent,
		markupPercent: s.defaultMarkupPercent,
		items: []
	};
}

function formShell(v: Product): string {
	return `<form id="product-form">
		${basicFieldsHtml(v)}
		${laborFieldsHtml(v.labor)}
		${fixedExpenseFieldsHtml(v.fixedExpenses)}
		${marginFieldsHtml(v)}
		<label class="field-label">Itens da receita</label>
		<div class="line-item-head"><span>Item</span><span>Qtd.</span>` +
		`<span>Custo</span><span></span></div>
		<div id="rows-container"></div>
		<button type="button" class="btn btn-sm" id="add-row">` +
		`+ Adicionar item</button>
		<div id="calc-box"></div>
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Salvar produto` +
		`</button></div></form>`;
}

function basicFieldsHtml(v: Product): string {
	return `<div class="field-row" style="grid-template-columns:2fr 1fr;">${
		textField('name', 'Nome do produto', v.name)
	}${textField('category', 'Categoria', v.category)}</div>
		<div class="field-row" style="grid-template-columns:1fr 1fr;">
			${numberField('yieldUnits', 'Rendimento (fatias)', v.yieldUnits)}${
				numberField('prepTime', 'Preparo (min)', v.prepTime)
			}</div>`;
}

function laborFieldsHtml(labor: Product['labor']): string {
	return `<label class="field-label" style="margin-top:4px;">` +
		`Mão de obra deste produto</label>
		<div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
			${numberField('salary', 'Salário mensal (R$)', labor.salary)}
			${numberField('daysPerMonth', 'Dias trabalhados/mês', labor.daysPerMonth)}
			${numberField('hoursPerDay', 'Horas/dia', labor.hoursPerDay)}</div>`;
}

function fixedExpenseFieldsHtml(fixed: Product['fixedExpenses']): string {
	return `<label class="field-label">Despesas fixas mensais ` +
		`deste produto</label>
		<div class="field-row" style="grid-template-columns:1fr 1fr 1fr;">
			${numberField('rent', 'Aluguel', fixed.rent)}${
				numberField('energy', 'Energia', fixed.energy)
			}${numberField('water', 'Água', fixed.water)}</div>
		<div class="field-row" style="grid-template-columns:1fr 1fr;">
			${numberField('internet', 'Internet', fixed.internet)}${
				numberField('office', 'Escritório', fixed.office)
			}</div>
		${numberField('mei', 'MEI / contador', fixed.mei)}`;
}

function marginFieldsHtml(v: Product): string {
	return `<label class="field-label">Margens</label>
		<div class="field-row" style="grid-template-columns:1fr 1fr;">
			${
				numberField(
					'variablePercent',
					'Despesa variável (%)',
					v.variablePercent
				)
			}${numberField('markupPercent', 'Markup (%)', v.markupPercent)}</div>`;
}

function redrawRows(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product
): void {
	const container = qs('#rows-container', modal);
	container.innerHTML = rows
		.map((row, index) => rowHtml(row, index, ctx))
		.join('');
	refreshCalcBox(modal, ctx, rows, draft);
	wireRowEvents(modal, ctx, rows, draft);
}

function rowHtml(row: ProductItem, index: number, ctx: AppContext): string {
	const cost = lineCost(row, ctx);
	return `<div class="line-item" data-row="${index}">
		${refSelect(row, ctx)}
		<input class="input" type="number" step="0.01" min="0" data-qty value="${
			row.qty
		}">
		<span class="num soft">${formatBRL(cost)}</span>
		<button type="button" class="remove-row" data-remove-row aria-label=` +
		`"Remover">✕</button></div>`;
}

function refSelect(row: ProductItem, ctx: AppContext): string {
	const kindToggle = `<select class="input" data-kind ` +
		`style="max-width:96px;display:inline-block;margin-right:4px;">
		<option value="ingredient" ${
			row.kind === 'ingredient' ? 'selected' : ''
		}>Ingr.</option>
		<option value="component" ${
			row.kind === 'component' ? 'selected' : ''
		}>Comp.</option></select>`;
	const options = referenceOptions(row, ctx);
	return `<div style="display:flex;gap:4px;">${kindToggle}` +
		`<select class="input" data-ref>${options}</select></div>`;
}

function referenceOptions(row: ProductItem, ctx: AppContext): string {
	const list =
		row.kind === 'component'
			? ctx.components.getAll()
			: ctx.ingredients.getAll();
	const opts = list.map(
		(item) =>
			`<option value="${item.id}" ` +
			`${item.id === row.refId ? 'selected' : ''}>` +
			`${escapeText(item.name)}</option>`
	);
	return `<option value="">Selecione…</option>${opts.join('')}`;
}

function lineCost(row: ProductItem, ctx: AppContext): number {
	if (row.kind === 'ingredient') {
		return ingredientUnitCost(ctx.ingredients.getById(row.refId)) * row.qty;
	}
	const component = ctx.components.getById(row.refId);
	return component ? ctx.pricing.componentCost(component) * row.qty : 0;
}

function wireRowEvents(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product
): void {
	modal.querySelectorAll<HTMLElement>('[data-row]').forEach((rowEl) =>
		wireRow(modal, ctx, rows, draft, rowEl)
	);
}

function wireRow(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	rowEl: HTMLElement
): void {
	const index = Number(rowEl.dataset.row);
	wireKindSelect(modal, ctx, rows, draft, index, rowEl);
	wireRefSelect(modal, ctx, rows, draft, index, rowEl);
	wireQtyInput(modal, ctx, rows, draft, index, rowEl);
	wireRemoveRow(modal, ctx, rows, draft, index, rowEl);
}

function wireKindSelect(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	index: number,
	rowEl: HTMLElement
): void {
	qs<HTMLSelectElement>('[data-kind]', rowEl).addEventListener('change', (e) =>
		updateRow(modal, ctx, rows, draft, index, {
			kind: (e.target as HTMLSelectElement).value as ProductItemKind,
			refId: ''
		})
	);
}

function wireRefSelect(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	index: number,
	rowEl: HTMLElement
): void {
	const refEl = qs<HTMLSelectElement>('[data-ref]', rowEl);
	refEl.addEventListener('change', (e) =>
		updateRow(modal, ctx, rows, draft, index, {
			refId: (e.target as HTMLSelectElement).value
		})
	);
}

function wireQtyInput(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	index: number,
	rowEl: HTMLElement
): void {
	const qtyEl = qs<HTMLInputElement>('[data-qty]', rowEl);
	qtyEl.addEventListener('input', (e) =>
		updateRow(modal, ctx, rows, draft, index, {
			qty: Number((e.target as HTMLInputElement).value)
		})
	);
}

function wireRemoveRow(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	index: number,
	rowEl: HTMLElement
): void {
	qs('[data-remove-row]', rowEl).addEventListener('click', () => {
		rows.splice(index, 1);
		redrawRows(modal, ctx, rows, draft);
	});
}

function updateRow(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	index: number,
	patch: Partial<ProductItem>
): void {
	rows[index] = { ...rows[index], ...patch };
	redrawRows(modal, ctx, rows, draft);
}

function refreshCalcBox(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product
): void {
	const values = formValues(qs<HTMLFormElement>('#product-form', modal));
	const liveDraft = mergeDraft(draft, values, rows);
	const direct = ctx.pricing.productDirectCost(liveDraft);
	const pricing = ctx.pricing.productPricing(liveDraft);
	qs('#calc-box', modal).innerHTML = calcBoxHtml(direct, pricing);
}

function mergeDraft(
	draft: Product,
	values: Record<string, string>,
	rows: ProductItem[]
): Product {
	return {
		...draft,
		name: values.name ?? draft.name,
		category: values.category ?? draft.category,
		prepTime: Number(values.prepTime || draft.prepTime),
		yieldUnits: Number(values.yieldUnits || draft.yieldUnits),
		labor: laborFromValues(values, draft.labor),
		fixedExpenses: fixedExpensesFromValues(values, draft.fixedExpenses),
		variablePercent: numberOr(values.variablePercent, draft.variablePercent),
		markupPercent: numberOr(values.markupPercent, draft.markupPercent),
		items: rows.filter((r) => r.refId && r.qty > 0)
	};
}

function numberOr(raw: string | undefined, fallback: number): number {
	return raw !== undefined && raw !== '' ? Number(raw) : fallback;
}

function laborFromValues(
	values: Record<string, string>,
	fallback: Product['labor']
): Product['labor'] {
	return {
		salary: numberOr(values.salary, fallback.salary),
		daysPerMonth: numberOr(values.daysPerMonth, fallback.daysPerMonth),
		hoursPerDay: numberOr(values.hoursPerDay, fallback.hoursPerDay)
	};
}

function fixedExpensesFromValues(
	values: Record<string, string>,
	fallback: Product['fixedExpenses']
): Product['fixedExpenses'] {
	return {
		rent: numberOr(values.rent, fallback.rent),
		energy: numberOr(values.energy, fallback.energy),
		water: numberOr(values.water, fallback.water),
		internet: numberOr(values.internet, fallback.internet),
		office: numberOr(values.office, fallback.office),
		mei: numberOr(values.mei, fallback.mei)
	};
}

function calcBoxHtml(
	direct: number,
	pricing: ReturnType<AppContext['pricing']['productPricing']>
): string {
	return `<div class="calc-box">
		<div class="calc-row"><span>Custo direto (receita)</span>` +
		`<span>${formatBRL(direct)}</span></div>
		<div class="calc-row"><span>Mão de obra</span>` +
		`<span>${formatBRL(pricing.laborCost)}</span></div>
		<div class="calc-row"><span>Despesas fixas</span>` +
		`<span>${formatBRL(pricing.fixedCost)}</span></div>
		<div class="calc-row"><span>Despesas variáveis</span>` +
		`<span>${formatBRL(pricing.variableCost)}</span></div>
		<div class="calc-row total"><span>Custo total</span>` +
		`<span>${formatBRL(pricing.totalCost)}</span></div>
		<div class="calc-row"><span>Markup (${
			formatNumber(pricing.markupPercent)
		}%)</span><span>${formatBRL(pricing.markupValue)}</span></div>
		<div class="calc-row total"><span>Preço de venda sugerido</span>` +
		`<span>${formatBRL(pricing.suggestedPrice)}</span></div>
		<div class="calc-row"><span>Preço por unidade</span>` +
		`<span>${formatBRL(pricing.unitPrice)}</span></div>
		<div class="calc-row"><span>Lucro</span><span>${
			formatBRL(pricing.profit)
		} (${formatNumber(pricing.profitPercent)}%)</span></div></div>`;
}

function wireFormEvents(
	modal: HTMLElement,
	ctx: AppContext,
	rows: ProductItem[],
	draft: Product,
	existing?: Product
): void {
	qs('#add-row', modal).addEventListener('click', () => {
		rows.push({ kind: 'ingredient', refId: '', qty: 0 });
		redrawRows(modal, ctx, rows, draft);
	});
	modal.querySelectorAll('input, select').forEach((el) =>
		el.addEventListener('input', () => refreshCalcBox(modal, ctx, rows, draft))
	);
	qs('#product-form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, rows, existing, draft)
	);
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	rows: ProductItem[],
	existing?: Product,
	draft?: Product
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const base = existing ?? draft ?? emptyProduct(ctx);
	const data = buildProductData(values, rows, base);
	if (existing) {
		await ctx.products.update(existing.id, data);
	} else {
		await ctx.products.add({ id: uid(), ...data });
	}
	closeModal();
	showToast('Produto salvo');
}

function buildProductData(
	values: Record<string, string>,
	rows: ProductItem[],
	base: Product
): Omit<Product, 'id'> {
	const merged = mergeDraft(base, values, rows);
	const { id, ...data } = merged;
	return data;
}

function textField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" name="${name}" value="${
			escapeAtrib(value)
		}" required></div>`;
}

function numberField(
	name: string,
	label: string,
	value: number,
	required = true
): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" type="number" step="0.01" min="0" name="${name}" ` +
		`value="${escapeAtrib(String(value))}" ${required ? 'required' : ''}></div>`;
}