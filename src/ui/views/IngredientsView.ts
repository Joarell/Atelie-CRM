import type { AppContext } from '../../state/AppContext';
import type { Ingredient } from '../../domain/types';
import {
	formatBRL,
	formatNumber,
	uid,
	escapeHtml,
	escapeAtrib
} from '../../domain/format';
import {
	renderCrudTable,
	type TableColumn,
	type TableSummary
} from '../CrudTable';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';
import { ingredientUnitCost } from '../../domain/pricing';
import {
	parseNfceInput,
	deduplicateProducts,
	productsToIngredients,
	type ParsedProduct
} from '../../domain/nfceImport';

export function renderIngredientsView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.ingredients.subscribe.bind(ctx.ingredients)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const table = crudTableHtml(ctx);
	root.innerHTML = sectionHtml() + table;
	wireEvents(root, ctx);
}

function sectionHtml(): string {
	return `
		<div class="section-head">
			<div><h2>Ingredientes</h2><p>Catálogo mestre de
		preços e embalagens</p></div>
			<div class="section-actions">
				<button class="btn btn-secondary" id="import-nfce">
					Importar da NFCe
				</button>
				<button class="btn btn-primary" id="new-ingredient">
					+ Novo ingrediente
				</button>
			</div>
		</div>`;
}

function crudTableHtml(ctx: AppContext): string {
	const rows = ctx.ingredients.getAll();
	return renderCrudTable({
		columns: columns(),
		rows,
		actions: actionButtons,
		emptyTitle: 'Nenhum ingrediente ainda',
		emptyHint: 'Cadastre o primeiro para começar a precificar.',
		summary: buildSummary(rows)
	});
}

export function columns(): TableColumn<Ingredient>[] {
	return [
		{ header: 'Nome', render: (i) => escapeHtml(i.name) },
		{
			header: 'Preço',
			render: (i) => formatBRL(i.packagePrice)
		},
		{
			header: 'Custo unitário',
			render: (i) => `${formatBRL(ingredientUnitCost(i))}/${i.unit}`
		},
		{
			header: 'Peso',
			render: (i) => `${formatNumber(i.packageSize)} ${i.unit}`
		},
		{
			header: 'Estoque',
			render: (i) => `${formatNumber(i.stock)} ${i.unit}`
		}
	];
}

export function buildSummary(rows: Ingredient[]): TableSummary<Ingredient> {
	const totalStock = rows.reduce((sum, i) => sum + i.stock, 0);
	const totalStockValue = rows.reduce(
		(sum, i) => sum + i.stock * ingredientUnitCost(i),
		0
	);
	return {
		render: () => [
			'', // Nome
			'', // Preço
			'', // Custo unitário
			'', // Peso
			`Total: ${formatNumber(totalStock)} un` +
				` • Valor: ${formatBRL(totalStockValue)}`
		]
	};
}

function actionButtons(ingredient: Ingredient): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-edit="${ingredient.id}">` +
		`Editar</button>
		<button class="btn btn-ghost btn-sm btn-danger" data-delete=` +
		`"${ingredient.id}">Excluir</button>`
	);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-ingredient', root).addEventListener('click', () => openForm(ctx));
	qs('#import-nfce', root).addEventListener('click', () =>
		openNfceImportModal(ctx)
	);
	root.querySelectorAll<HTMLElement>('[data-edit]').forEach((btn) =>
		btn.addEventListener('click', () =>
			openForm(ctx, ctx.ingredients.getById(btn.dataset.edit!))
		)
	);
	root.querySelectorAll<HTMLElement>('[data-delete]').forEach((btn) =>
		btn.addEventListener('click', () =>
			handleDelete(ctx, btn.dataset.delete!)
		)
	);
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este ingrediente?')) return;
	await ctx.ingredients.remove(id);
	showToast('Ingrediente excluído');
}

function openForm(ctx: AppContext, existing?: Ingredient): void {
	const title = existing ? 'Editar ingrediente' : 'Novo ingrediente';
	const modal = openModal({ title, bodyHtml: formHtml(existing) });
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing)
	);
}

function formHtml(existing?: Ingredient): string {
	const v = existing ?? {
		name: '',
		unit: 'g',
		packageSize: 0,
		packagePrice: 0,
		stock: 0,
		minStock: 0
	};
	return `<form>${textField('name', 'Nome', v.name)}
		<div class="field-row" style="grid-template-columns:1fr 1fr;">
			${selectUnit(v.unit)}${
				numberField('packageSize', 'Tamanho da embalagem', v.packageSize)
			}</div>
		<div class="field-row" style="grid-template-columns:1fr 1fr;">
			${
				numberField('packagePrice', 'Preço da embalagem (R$)', v.packagePrice)
			}${numberField('stock', 'Estoque atual', v.stock)}</div>
		${numberField('minStock', 'Estoque mínimo (alerta)', v.minStock)}
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Salvar</button>` +
		`</div></form>`;
}

function selectUnit(current: string): string {
	const options = ['g', 'ml', 'un']
		.map(
			(u) =>
				`<option value="${u}" ${u === current ? 'selected' : ''}>${u}</option>`
		)
		.join('');
	return `<div class="field"><label class="field-label">Unidade</label>` +
		`<select class="input" name="unit">${options}</select></div>`;
}

function textField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" name="${name}" value="${escapeAtrib(value)}"
		required></div>`;
}

function numberField(name: string, label: string, value: number): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" type="number" step="0.01" min="0" ` +
		`name="${escapeAtrib(name)}" value="${escapeAtrib(String(value))}" ` +
		`required></div>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: Ingredient
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const data = buildIngredient(values);
	if (existing) {
		await ctx.ingredients.update(existing.id, data);
	} else {
		await ctx.ingredients.add({ id: uid(), ...data });
	}
	closeModal();
	showToast('Ingrediente salvo');
}

function buildIngredient(
	values: Record<string, string>
): Omit<Ingredient, 'id'> {
	return {
		name: values.name,
		unit: values.unit as Ingredient['unit'],
		packageSize: Number(values.packageSize),
		packagePrice: Number(values.packagePrice),
		stock: Number(values.stock),
		minStock: Number(values.minStock)
	};
}

function openNfceImportModal(ctx: AppContext): void {
	const modal = openModal({
		title: 'Importar produtos da NFCe',
		bodyHtml: nfceImportFormHtml(),
		onMount: (el) => mountNfceImportModal(ctx, el)
	});
}

function nfceImportFormHtml(): string {
	return `
		<div class="nfce-import">
			<p class="soft" style="margin-bottom:12px;">
				Cole o CSV da nota fiscal ou a URL da NFCe (consulta pública SP).
			</p>
			<div class="field" style="margin-bottom:16px;">
				<label class="field-label" for="nfce-input">Dados da NFCe</label>
				<textarea class="input" id="nfce-input" rows="6"
					placeholder="Cole aqui o CSV ou a URL..."></textarea>
			</div>
			<div id="nfce-errors" class="soft"
				style="color:var(--color-error);min-height:20px;margin-bottom:12px;">
			</div>
			<div class="modal-foot">
				<button type="button" class="btn" data-close-modal>Cancelar</button>
				<button type="button" class="btn btn-primary" id="process-nfce">
					Processar
				</button>
			</div>
		</div>`;
}

function mountNfceImportModal(ctx: AppContext, el: HTMLElement): void {
	qs('#nfce-input', el).focus();
	qs('#process-nfce', el).addEventListener('click', () =>
		handleNfceProcess(ctx, el)
	);
	qs('[data-close-modal]', el).addEventListener('click', closeModal);
}

function handleNfceProcess(ctx: AppContext, modalEl: HTMLElement): void {
	const input = qs('#nfce-input', modalEl) as HTMLTextAreaElement;
	const errorsEl = qs('#nfce-errors', modalEl);
	const raw = input.value.trim();

	if (!raw) {
		errorsEl.textContent = 'Cole os dados da NFCe antes de processar.';
		return;
	}

	const result = parseNfceInput(raw);
	errorsEl.textContent = result.errors.join('; ');

	if (result.products.length === 0) return;

	const deduped = deduplicateProducts(result.products);
	closeModal();
	openNfceSelectionModal(ctx, deduped);
}

function openNfceSelectionModal(
	ctx: AppContext, products: ParsedProduct[]
): void {
	const modal = openModal({
		title: 'Selecionar produtos para importar',
		bodyHtml: nfceSelectionTableHtml(products),
		onMount: (el) => mountNfceSelectionModal(ctx, el, products)
	});
}

function mountNfceSelectionModal(
	ctx: AppContext,
	el: HTMLElement,
	products: ParsedProduct[]
): void {
	qs('#select-all', el).addEventListener('change', (e) => {
		const checked = (e.target as HTMLInputElement).checked;
		el.querySelectorAll<HTMLInputElement>('.product-checkbox')
			.forEach(cb => cb.checked = checked);
	});
	qs('#confirm-import', el).addEventListener('click', () =>
		handleConfirmImport(ctx, el, products)
	);
	qs('#cancel-import', el).addEventListener('click', closeModal);
}

function nfceSelectionTableHtml(products: ParsedProduct[]): string {
	const rows = products.map(productRowHtml).join('');
	return tableWrapperHtml(rows, products.length) + modalFootHtml();
}

function tableWrapperHtml(rows: string, count: number): string {
	return `
		<div class="nfce-selection" style="max-height:50vh;overflow:auto;">
			<table class="crud-table" style="width:100%;">
				<thead>
					<tr>
						<th style="width:40px;">
							<input type="checkbox" id="select-all" checked>
						</th>
						<th>Produto</th>
						<th>Quantidade</th>
						<th style="text-align:right;">Preço Total</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
			<p class="soft" style="margin-top:12px;">
				${count} produto(s) encontrado(s).
				Desmarque os que não deseja importar.
			</p>
		</div>`;
}

function modalFootHtml(): string {
	return `
		<div class="modal-foot">
			<button type="button" class="btn" id="cancel-import">Cancelar</button>
			<button type="button" class="btn btn-primary" id="confirm-import">
				Importar selecionados
			</button>
		</div>`;
}

function productRowHtml(p: ParsedProduct): string {
	const qtyHtml = p.weight > 0
		? `${p.weight} ${p.unit}`
		: `${p.quantity} ${p.unit}`;
	return `
		<tr>
			<td><input type="checkbox" class="product-checkbox"
				data-id="${p.id}" checked></td>
			<td>${escapeHtml(p.name)}</td>
			<td>${qtyHtml}</td>
			<td style="text-align:right;">${formatBRL(p.price)}</td>
		</tr>`;
}

async function handleConfirmImport(
	ctx: AppContext,
	modalEl: HTMLElement,
	products: ParsedProduct[]
): Promise<void> {
	const selected = getSelectedProducts(modalEl, products);
	if (selected.length === 0) {
		showToast('Nenhum produto selecionado');
		return;
	}

	const ingredients = productsToIngredients(selected);
	const counts = await processIngredients(ctx, ingredients);

	closeModal();
	showToast(formatImportMessage(counts.imported, counts.updated));
}

function getSelectedProducts(
	modalEl: HTMLElement,
	products: ParsedProduct[]
): ParsedProduct[] {
	const checkboxes = modalEl.querySelectorAll<HTMLInputElement>(
		'.product-checkbox:checked'
	);
	const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id!);
	return products.filter(p => selectedIds.includes(p.id));
}

export async function processIngredients(
	ctx: IngredientContext,
	ingredients: Omit<Ingredient, 'id'>[]
): Promise<{ imported: number; updated: number }> {
	let imported = 0;
	let updated = 0;

	for (const ing of ingredients) {
		const existing = findIngredientByName(ctx, ing.name);
		if (existing) {
			await updateExistingIngredient(ctx, existing, ing);
			updated++;
		} else {
			await ctx.ingredients.add({ id: uid(), ...ing });
			imported++;
		}
	}
	return { imported, updated };
}

export function formatImportMessage(imported: number, updated: number): string {
	if (imported > 0 && updated > 0) {
		return `${imported} ingrediente(s) importado(s), ${updated} atualizado(s)`;
	}
	if (imported > 0) return `${imported} ingrediente(s) importado(s)`;
	return `${updated} ingrediente(s) atualizado(s)`;
}

interface IngredientContext {
	ingredients: {
		getAll(): Ingredient[];
		update(
			id: string, patch: Partial<Ingredient>
		): Promise<Ingredient | undefined>;
		add(item: Ingredient): Promise<Ingredient>;
	};
}

export function findIngredientByName(
	ctx: IngredientContext, name: string
): Ingredient | undefined {
	const all = ctx.ingredients.getAll();
	const lowerName = name.toLowerCase();
	return all.find(i => i.name.toLowerCase() === lowerName);
}

export async function updateExistingIngredient(
	ctx: IngredientContext,
	existing: Ingredient,
	incoming: Omit<Ingredient, 'id'>
): Promise<void> {
	const newStock = existing.stock + (incoming.stock ?? 0);
	const newTotalPrice = existing.packagePrice + incoming.packagePrice;
	const newPackageSize = existing.packageSize + incoming.packageSize;

	await ctx.ingredients.update(existing.id, {
		packageSize: newPackageSize,
		packagePrice: newTotalPrice,
		stock: newStock,
		unit: incoming.unit,
		minStock: Math.min(existing.minStock, incoming.minStock)
	});
}