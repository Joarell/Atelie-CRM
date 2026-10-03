import type { AppContext } from '../../../state/AppContext';
import type { Tag } from '../../../domain/crm';
import { escapeText, escapeAtrib, uid } from '../../../domain/format';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, formValues } from '../../dom';
import { section, textField, selectField, modalFoot } from './crmUi';

const TAG_COLORS = [
	'caramel',
	'gold',
	'mint',
	'sky',
	'lilac',
	'ruber',
	'neutral'
];

export function renderCrmEtiquetasView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.tags.subscribe.bind(ctx.tags),
		ctx.contacts.subscribe.bind(ctx.contacts)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const rows = sortByName(ctx.tags.getAll());
	root.innerHTML = `
		${pageHead()}
		${tableHtml(ctx, rows)}`;
	wireEvents(root, ctx);
}

function sortByName(tags: Tag[]): Tag[] {
	return tags.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function pageHead(): string {
	const btn =
		'<button class="btn btn-primary" id="new-tag">' +
		'+ Nova etiqueta</button>';
	return section(
		'Etiquetas',
		'Vocabulário de tags usado no cadastro de contatos',
		btn
	);
}

function tableHtml(ctx: AppContext, rows: Tag[]): string {
	return renderCrudTable({
		columns: columns(ctx),
		rows,
		actions: (t) => actions(t, ctx),
		emptyTitle: 'Nenhuma etiqueta',
		emptyHint: 'Crie etiquetas para classificar os contatos.'
	});
}

function columns(ctx: AppContext): TableColumn<Tag>[] {
	return [
		{ header: 'Etiqueta', render: renderTag },
		{
			header: 'Contatos',
			render: (t) => countCell(ctx, t),
			alignRight: true
		},
		{ header: 'Situação', render: (t) => situacaoCell(t) }
	];
}

function countCell(ctx: AppContext, t: Tag): string {
	const count = ctx.contacts
		.getAll()
		.filter((c) => c.tags.includes(t.name)).length;
	return String(count);
}

function situacaoCell(t: Tag): string {
	return t.ativo
		? '<span class="badge">Ativa</span>'
		: '<span class="badge badge-caramel">Inativa</span>';
}

function renderTag(tag: Tag): string {
	return (
		`<span class="chip chip-${escapeAtrib(tag.color)}">` +
		`${escapeText(tag.name)}</span>`
	);
}

function tagToggle(tag: Tag, label: string): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-toggle="` +
		`${tag.id}` +
		`">${label}</button>`
	);
}

function editBtn(id: string): string {
	return (
		`<button class="btn btn-ghost btn-sm" data-edit="` +
		`${id}>Editar</button>`
	);
}

function deleteBtn(id: string): string {
	return (
		`<button class="btn btn-ghost btn-sm btn-danger" data-delete="` +
		`${id}>Excluir</button>`
	);
}

function actions(tag: Tag, ctx: AppContext): string {
	const label = tag.ativo ? 'Desativar' : 'Ativar';
	return (
		`${tagToggle(tag, label)}\n    ${editBtn(tag.id)}` +
		`\n    ${deleteBtn(tag.id)}`
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
	qs('#new-tag', root).addEventListener('click', () => openForm(ctx));
	root.querySelectorAll<HTMLElement>('[data-toggle]').forEach((btn) => {
		const id = btn.dataset.toggle!;
		btn.addEventListener('click', () => toggleTag(ctx, id));
	});
	bindData(root, 'edit', (id) => openForm(ctx, ctx.tags.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function toggleTag(ctx: AppContext, id: string): Promise<void> {
	const tag = ctx.tags.getById(id);
	if (!tag) return;
	await ctx.tags.update(id, { ativo: !tag.ativo });
	showToast(tag.ativo ? 'Etiqueta desativada' : 'Etiqueta ativada');
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir esta etiqueta?')) return;
	await ctx.tags.remove(id);
	showToast('Etiqueta excluída');
}

function openForm(ctx: AppContext, existing?: Tag): void {
	const modal = openModal({
		title: existing ? 'Editar etiqueta' : 'Nova etiqueta',
		bodyHtml: formHtml(existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function formHtml(existing?: Tag): string {
	const v = existing ?? { name: '', color: TAG_COLORS[0] };
	const colorOptions = TAG_COLORS.map((color) =>
		({ value: color, label: color }));
	return `<form>${textField('name', 'Nome', v.name)}
		${selectField('color', 'Cor', colorOptions, v.color)}
		${modalFoot()}</form>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: Tag
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const name = values.name.trim().toLowerCase().replace(/\s+/g, '-');
	if (!name) return;
	const data = { name, color: values.color || TAG_COLORS[0] };
	if (existing) {
		await ctx.tags.update(existing.id, data);
	} else {
		await ctx.tags.add({
			id: uid(),
			...data,
			ativo: true,
			createdAt: new Date().toISOString()
		});
	}
	closeModal();
	showToast('Etiqueta salva');
}