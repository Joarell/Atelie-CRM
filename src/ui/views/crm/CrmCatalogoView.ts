import type { AppContext } from '../../../state/AppContext';
import type { CatalogProduct } from '../../../domain/crm';
import { escapeHtml, uid } from '../../../domain/format';
import { formatPriceCents } from '../../../domain/crmMath';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, formValues } from '../../dom';
import { section, textField, numberField, modalFoot } from './crmUi';

export function renderCrmCatalogoView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.catalog.subscribe.bind(ctx.catalog)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	root.innerHTML = `
		${pageHead()}
		${tableHtml(ctx)}`;
	wireEvents(root, ctx);
}

function pageHead(): string {
	const btn =
		'<button class="btn btn-primary" id="new-product">' +
		'+ Novo produto</button>';
	return section('Catálogo', 'Produtos e preços usados nas conversas', btn);
}

function tableHtml(ctx: AppContext): string {
	return renderCrudTable({
		columns: columns(),
		rows: ctx.catalog.getAll(),
		actions: actionButtons,
		emptyTitle: 'Catálogo vazio',
		emptyHint: 'Cadastre os produtos que você vende pelo WhatsApp.'
	});
}

function columns(): TableColumn<CatalogProduct>[] {
	return [
		{ header: 'Produto', render: (p) => productCell(p) },
		{
			header: 'Preço',
			render: (p) => formatPriceCents(p.priceCents),
			alignRight: true
		},
		{ header: 'Status', render: (p) => statusCell(p) }
	];
}

function productCell(p: CatalogProduct): string {
	const name = escapeHtml(p.name);
	const about = p.description
		? `<div class="soft small">${escapeHtml(p.description)}</div>`
		: '';
	return `<div><strong>${name}</strong>${about}</div>`;
}

function statusCell(p: CatalogProduct): string {
	return p.ativo
		? '<span class="badge">Ativo</span>'
		: '<span class="soft">Inativo</span>';
}

function actionButtons(product: CatalogProduct): string {
	const label = product.ativo ? 'Desativar' : 'Ativar';
	const open = toggleBtn(product, label);
	return `${open}\n    ${editBtn(product)}\n    ${deleteBtn(product)}`;
}

function toggleBtn(product: CatalogProduct, label: string): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-toggle="` +
		`${product.id}` +
		`">${label}</button>`
	);
}

function editBtn(product: CatalogProduct): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-edit="` +
		`${product.id}">Editar</button>`
	);
}

function deleteBtn(product: CatalogProduct): string {
	return (
		`<button class="btn btn-ghost btn-sm btn-danger" data-delete="` +
		`${product.id}">Excluir</button>`
	);
}

function bindData(
	root: HTMLElement,
	key: string,
	onClick: (id: string) => void
): void {
	const dataKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((btn) => {
		btn.addEventListener('click', () => onClick(btn.dataset[dataKey]!));
	});
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-product', root).addEventListener('click', () => openForm(ctx));
	root.querySelectorAll<HTMLElement>('[data-toggle]').forEach((btn) => {
		const id = btn.dataset.toggle!;
		btn.addEventListener('click', () => toggleProduct(ctx, id));
	});
	bindData(root, 'edit', (id) => openForm(ctx, ctx.catalog.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function toggleProduct(ctx: AppContext, id: string): Promise<void> {
	const product = ctx.catalog.getById(id);
	if (!product) return;
	await ctx.catalog.update(product.id, { ativo: !product.ativo });
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este produto?')) return;
	await ctx.catalog.remove(id);
	showToast('Produto excluído');
}

function openForm(ctx: AppContext, existing?: CatalogProduct): void {
	const modal = openModal({
		title: existing ? 'Editar produto' : 'Novo produto',
		bodyHtml: formHtml(existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function formHtml(existing?: CatalogProduct): string {
	const now = new Date().toISOString();
	const defaults = {
		name: '',
		description: '',
		priceCents: 0,
		ativo: true,
		createdAt: now,
		updatedAt: now
	};
	const v = existing ?? defaults;
	const price = (v.priceCents / 100).toFixed(2);
	return `<form>${textField('name', 'Nome', v.name)}
		${textareaHtml(v.description)}
		${numberField('price', 'Preço (R$)', '0.01', price)}
		${modalFoot()}</form>`;
}

function textareaHtml(description: string): string {
	return (
		`<div class="field"><label class="field-label">Descrição</label>` +
		`<textarea class="input" name="description" rows="3">` +
		`${escapeHtml(description)}</textarea></div>`
	);
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: CatalogProduct
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const now = new Date().toISOString();
	const data = {
		name: values.name,
		description: values.description,
		priceCents: Math.round(Number(values.price) * 100),
		currency: existing?.currency ?? 'BRL'
	};
	if (existing) {
		await ctx.catalog.update(existing.id, { ...data, updatedAt: now });
	} else {
		await ctx.catalog.add({
			id: uid(),
			...data,
			ativo: true,
			createdAt: now,
			updatedAt: now
		});
	}
	closeModal();
	showToast('Produto salvo');
}