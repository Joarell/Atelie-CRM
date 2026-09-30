import type { AppContext } from '../../../state/AppContext';
import type { QuickReply } from '../../../domain/crm';
import { escapeHtml, uid } from '../../../domain/format';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, formValues } from '../../dom';
import { section, textField, modalFoot } from './crmUi';

export function renderCrmRespostasView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.quickReplies.subscribe.bind(ctx.quickReplies)
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
		'<button class="btn btn-primary" id="new-reply">' +
		'+ Nova resposta</button>';
	return section(
		'Respostas rápidas',
		'Atalhos prontos para usar nas conversas',
		btn
	);
}

function tableHtml(ctx: AppContext): string {
	return renderCrudTable({
		columns: columns(),
		rows: ctx.quickReplies.getAll(),
		actions: actionButtons,
		emptyTitle: 'Nenhuma resposta ainda',
		emptyHint: 'Crie atalhos para agilizar o atendimento.'
	});
}

function columns(): TableColumn<QuickReply>[] {
	return [
		{ header: 'Título', render: (r) => escapeHtml(r.title) },
		{ header: 'Atalho', render: shortcutCell },
		{ header: 'Mensagem', render: bodyCell }
	];
}

function shortcutCell(r: QuickReply): string {
	return `<code class="shortcut">/${escapeHtml(r.shortcut)}</code>`;
}

function bodyCell(r: QuickReply): string {
	return `<span class="soft">${escapeHtml(r.body)}</span>`;
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

function actionButtons(reply: QuickReply): string {
	return `${editBtn(reply.id)}\n    ${deleteBtn(reply.id)}`;
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
	qs('#new-reply', root).addEventListener('click', () => openForm(ctx));
	bindData(root, 'edit', (id) => openForm(ctx, ctx.quickReplies.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir esta resposta?')) return;
	await ctx.quickReplies.remove(id);
	showToast('Resposta excluída');
}

function openForm(ctx: AppContext, existing?: QuickReply): void {
	const modal = openModal({
		title: existing ? 'Editar resposta' : 'Nova resposta',
		bodyHtml: formHtml(existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function messageField(body: string): string {
	return (
		`<div class="field"><label class="field-label">Mensagem</label>` +
		`<textarea class="input" name="body" rows="4" required>` +
		`${escapeHtml(body)}</textarea></div>`
	);
}

function formHtml(existing?: QuickReply): string {
	const defaults = {
		title: '',
		body: '',
		shortcut: '',
		createdBy: '',
		createdAt: ''
	};
	const v = existing ?? defaults;
	return `<form>${textField('title', 'Título', v.title)}
		${messageField(v.body)}
		${textField('shortcut', 'Atalho (sem a barra)', v.shortcut)}
		${modalFoot()}</form>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: QuickReply
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const shortcut = values.shortcut.replace(/^\//, '');
	const data = {
		title: values.title,
		body: values.body,
		shortcut
	};
	if (existing) {
		await ctx.quickReplies.update(existing.id, data);
	} else {
		await ctx.quickReplies.add({
			id: uid(),
			...data,
			createdBy: ctx.auth.currentUser()?.id ?? '',
			createdAt: new Date().toISOString()
		});
	}
	closeModal();
	showToast('Resposta salva');
}