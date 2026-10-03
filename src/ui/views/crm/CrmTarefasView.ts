import type { AppContext } from '../../../state/AppContext';
import type { Task } from '../../../domain/crm';
import { escapeText, uid, todayISO } from '../../../domain/format';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, formValues } from '../../dom';
import {
	section,
	textField,
	dateField,
	selectField,
	modalFoot
} from './crmUi';

export function renderCrmTarefasView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.tasks.subscribe.bind(ctx.tasks),
		ctx.contacts.subscribe.bind(ctx.contacts),
		ctx.users.subscribe.bind(ctx.users)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const rows = sortByDue(ctx.tasks.getAll());
	root.innerHTML = `
		${pageHead()}
		${tableHtml(ctx, rows)}`;
	wireEvents(root, ctx);
}

function sortByDue(tasks: Task[]): Task[] {
	return tasks.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

function pageHead(): string {
	const btn =
		'<button class="btn btn-primary" id="new-task">' +
		'+ Nova tarefa</button>';
	return section('Tarefas', 'Acompanhamento de pendências da equipe', btn);
}

function tableHtml(ctx: AppContext, rows: Task[]): string {
	return renderCrudTable({
		columns: columns(ctx),
		rows,
		actions: (t) => actions(t, ctx),
		emptyTitle: 'Nenhuma tarefa ainda',
		emptyHint: 'Crie tarefas para lembrar seguimentos e entregas.'
	});
}

function columns(ctx: AppContext): TableColumn<Task>[] {
	return [
		{ header: '', render: (t) => doneInput(t) },
		{ header: 'Tarefa', render: (t) => titleCell(t) },
		{ header: 'Prazo', render: (t) => dueCell(t) },
		{ header: 'Contato', render: (t) => contactCell(ctx, t) },
		{ header: 'Responsável', render: (t) => assigneeCell(ctx, t) }
	];
}

function doneInput(t: Task): string {
	return (
		`<input type="checkbox" class="task-toggle" ` +
		`data-task="${t.id}" ${t.done ? 'checked' : ''}>`
	);
}

function titleCell(t: Task): string {
	return (
		`<span class="${t.done ? 'strike' : ''}">` +
		`${escapeText(t.title)}</span>`
	);
}

function dueCell(t: Task): string {
	const overdue = isOverdue(t)
		? ' <span class="badge badge-caramel">atrasado</span>'
		: '';
	return `${formatDay(t.dueAt)}${overdue}`;
}

function contactCell(ctx: AppContext, t: Task): string {
	const name = ctx.contacts.getById(t.contactId)?.name ?? '—';
	return escapeText(name);
}

function assigneeCell(ctx: AppContext, t: Task): string {
	const name = ctx.users.getById(t.assigneeUserId)?.name ?? '—';
	return escapeText(name);
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

function actions(task: Task, ctx: AppContext): string {
	return `${editBtn(task.id)}\n    ${deleteBtn(task.id)}`;
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

function bindToggle(root: HTMLElement, ctx: AppContext): void {
	root.querySelectorAll<HTMLInputElement>('[data-task]').forEach((box) => {
		box.addEventListener('change', () => toggleDone(ctx, box));
	});
}

async function toggleDone(
	ctx: AppContext,
	box: HTMLInputElement
): Promise<void> {
	await ctx.tasks.update(box.dataset.task!, { done: box.checked });
	showToast(box.checked ? 'Tarefa concluída' : 'Tarefa reaberta');
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-task', root).addEventListener('click', () => openForm(ctx));
	bindToggle(root, ctx);
	bindData(root, 'edit', (id) => openForm(ctx, ctx.tasks.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir esta tarefa?')) return;
	await ctx.tasks.remove(id);
	showToast('Tarefa excluída');
}

function openForm(ctx: AppContext, existing?: Task): void {
	const modal = openModal({
		title: existing ? 'Editar tarefa' : 'Nova tarefa',
		bodyHtml: formHtml(ctx, existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function optionList<T extends { id: string; name: string }>(
	items: T[],
	first: string
): Array<{ value: string; label: string }> {
	return [
		{ value: '', label: first },
		...items.map((c) => ({ value: c.id, label: c.name }))
	];
}

function formHtml(ctx: AppContext, existing?: Task): string {
	const users = optionList(ctx.users.getAll(), '— ninguém —');
	const contacts = optionList(ctx.contacts.getAll(), '— nenhum —');
	const due = (existing?.dueAt ?? '').slice(0, 10);
	const assignee = existing?.assigneeUserId ?? '';
	return `<form>${textField('title', 'Tarefa', existing?.title ?? '')}
		<div class="field-row">
			${dateField('dueAt', 'Prazo', due)}
			${selectField('assigneeUserId', 'Responsável', users, assignee)}
		</div>
		${selectField('contactId', 'Contato', contacts, existing?.contactId ?? '')}
		${modalFoot()}</form>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: Task
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const dueAt = values.dueAt
		? `${values.dueAt}T23:59:59.000Z`
		: todayISO();
	const data = {
		title: values.title,
		dueAt,
		assigneeUserId: values.assigneeUserId,
		contactId: values.contactId
	};
	if (existing) {
		await ctx.tasks.update(existing.id, data);
	} else {
		await ctx.tasks.add({
			id: uid(),
			...data,
			done: false,
			createdAt: new Date().toISOString()
		});
	}
	closeModal();
	showToast('Tarefa salva');
}

function formatDay(iso: string): string {
	const [y, m, d] = (iso ?? '').slice(0, 10).split('-');
	return y ? `${d}/${m}/${y}` : '—';
}

function isOverdue(task: Task): boolean {
	return !task.done && task.dueAt < todayISO();
}