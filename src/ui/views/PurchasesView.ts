import type { AppContext } from '../../state/AppContext';
import { formatBRL, escapeText, escapeAtrib } from '../../domain/format';
import { openModal, closeModal } from '../Modal';
import { showToast } from '../Toast';
import { autoRerender } from '../reactive';
import { qs, formValues } from '../dom';
import { renderEmptyState } from '../CrudTable';

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
		<div><h2>Compras</h2><p>Registro de compras de ingredientes para apuração do CMV</p></div>
		<button class="btn btn-primary" id="new-purchase">+ Nova compra</button>
	</div>`;
}

function monthFilterHtml(): string {
	return `<div class="field-row" style="grid-template-columns:auto 1fr;">
		<label class="field-label" style="margin-right:8px;">Mês</label>
		<input type="month" class="input" id="purchase-month" value="${currentMonth()}">
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
		<button class="btn btn-ghost btn-sm btn-danger" data-delete="${id}">Excluir</button>
	</div>`;
}

function itemHtml(item: any): string {
	const val = (item.qty / item.packageSize) * item.packagePrice;
	return `<span class="soft">${escapeText(item.ingredientName)}: ${item.qty} ${item.unit || ''} (R$ ${formatBRL(val)})</span>`;
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
	const items: any[] = existing ? existing.items.map((i: any) => ({ ...i })) : [];
	const draft = existing ?? { supplier: '', invoice: '', date: currentMonth(), items: [], notes: '' };
	const modal = openModal({
		title: existing ? 'Editar compra' : 'Nova compra',
		bodyHtml: formShell(draft)
	});
	redrawItems(modal, ctx, items, draft);
	wireFormEvents(modal, ctx, items, draft, existing);
}

function formShell(v: any): string {
	return `<form id="purchase-form">
		<div class="field-row" style="grid-template-columns:2fr 1fr 1fr;">
			${textField('supplier', 'Fornecedor', v.supplier)}
			${textField('invoice', 'Nota fiscal', v.invoice)}
			${dateField('date', 'Data', v.date)}
		</div>
		<label class="field-label">Itens da compra</label>
		<div class="line-item-head"><span>Ingrediente</span><span>Qtd.</span><span>Tamanho pacote</span><span>Preço pacote</span><span></span></div>
		<div id="items-container"></div>
		<button type="button" class="btn btn-sm" id="add-item">+ Adicionar item</button>
		<div class="modal-foot" style="padding:16px 0 0;border:none;">
			<button type="button" class="btn" data-close-modal>Cancelar</button>
			<button type="submit" class="btn btn-primary">Salvar compra</button>
		</div></form>`;
}

function redrawItems(modal: HTMLElement, ctx: AppContext, items: any[], draft: any): void {
	const container = qs('#items-container', modal);
	container.innerHTML = items.map((item, index) => itemRowHtml(item, index, ctx)).join('');
	wireItemEvents(modal, ctx, items, draft);
}

function itemRowHtml(item: any, index: number, ctx: AppContext): string {
	const ingredients = ctx.ingredients.getAll();
	const opts = ingredients.map(
		(ing) => `<option value="${ing.id}" ${item.ingredientId === ing.id ? 'selected' : ''}>${escapeText(ing.name)}</option>`
	).join('');
	return `<div class="line-item" data-row="${index}">
		<select class="input" data-ingredient>${opts}</select>
		<input class="input" type="number" step="0.01" min="0.01" data-qty value="${item.qty || ''}" placeholder="Qtd.">
		<input class="input" type="number" step="0.01" min="0.01" data-packageSize value="${item.packageSize || ''}" placeholder="Tam. pacote">
		<input class="input" type="number" step="0.01" min="0.01" data-packagePrice value="${item.packagePrice || ''}" placeholder="Preço pacote">
		<button type="button" class="remove-row" data-remove-row aria-label="Remover">✕</button></div>`;
}

function wireFormEvents(modal: HTMLElement, ctx: AppContext, items: any[], draft: any, existing?: any): void {
	qs('#add-item', modal).addEventListener('click', () => {
		items.push({ ingredientId: '', qty: 0, packageSize: 0, packagePrice: 0 });
		redrawItems(modal, ctx, items, draft);
	});
	qs('#purchase-form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, items, existing, draft)
	);
}

function wireItemEvents(modal: HTMLElement, ctx: AppContext, items: any[], draft: any): void {
	modal.querySelectorAll<HTMLElement>('[data-row]').forEach((rowEl) => {
		const index = Number(rowEl.dataset.row);
		qs<HTMLSelectElement>('[data-ingredient]', rowEl).addEventListener('change', (e) =>
			updateItem(items, index, { ingredientId: (e.target as HTMLSelectElement).value })
		);
		qs<HTMLInputElement>('[data-qty]', rowEl).addEventListener('input', (e) =>
			updateItem(items, index, { qty: Number((e.target as HTMLInputElement).value) })
		);
		qs<HTMLInputElement>('[data-packageSize]', rowEl).addEventListener('input', (e) =>
			updateItem(items, index, { packageSize: Number((e.target as HTMLInputElement).value) })
		);
		qs<HTMLInputElement>('[data-packagePrice]', rowEl).addEventListener('input', (e) =>
			updateItem(items, index, { packagePrice: Number((e.target as HTMLInputElement).value) })
		);
		qs('[data-remove-row]', rowEl).addEventListener('click', () => {
			items.splice(index, 1);
			redrawItems(modal, ctx, items, draft);
		});
	});
}

function updateItem(items: any[], index: number, patch: any): void {
	items[index] = { ...items[index], ...patch };
}

async function handleSubmit(event: Event, ctx: AppContext, items: any[], existing?: any, draft?: any): Promise<void> {
	event.preventDefault();
	const form = event.target as HTMLFormElement;
	const values = formValues(form);
	
	// Read item values directly from DOM (more reliable than closure items array)
	const itemRows = form.querySelectorAll('[data-row]');
	const draftItems: any[] = [];
	for (const row of itemRows) {
		const ingredientSelect = row.querySelector('[data-ingredient]') as HTMLSelectElement;
		const qtyInput = row.querySelector('[data-qty]') as HTMLInputElement;
		const packageSizeInput = row.querySelector('[data-packageSize]') as HTMLInputElement;
		const packagePriceInput = row.querySelector('[data-packagePrice]') as HTMLInputElement;
		
		const ingredientId = ingredientSelect?.value;
		const qty = Number(qtyInput?.value);
		const packageSize = Number(packageSizeInput?.value);
		const packagePrice = Number(packagePriceInput?.value);
		
		if (ingredientId && qty > 0 && packageSize > 0 && packagePrice > 0) {
			draftItems.push({
				ingredientId,
				ingredientName: ctx.ingredients.getById(ingredientId)?.name || '',
				qty,
				packageSize,
				packagePrice
			});
		}
	}
	
	// Validate date not in future
	const today = new Date().toISOString().slice(0, 10);
	if (values.date > today) {
		showToast('A data da compra não pode ser futura');
		return;
	}
	
	if (draftItems.length === 0) {
		showToast('Adicione pelo menos um item válido');
		return;
	}
	
	const purchaseDraft = {
		supplier: values.supplier,
		invoice: values.invoice,
		date: values.date,
		items: draftItems,
		notes: values.notes || ''
	};
	
	await savePurchase(ctx, existing, purchaseDraft);
	closeModal();
	showToast('Compra salva');
}

async function savePurchase(ctx: AppContext, existing: any, draft: any): Promise<void> {
	if (existing) await ctx.purchasesService.remove(existing.id);
	await ctx.purchasesService.register(draft);
}

function textField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" name="${name}" value="${escapeAtrib(value)}" required></div>`;
}

function dateField(name: string, label: string, value: string): string {
	return `<div class="field"><label class="field-label">${label}</label>
		<input class="input" type="date" name="${name}" value="${value}" required></div>`;
}