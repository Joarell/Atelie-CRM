import type { AppContext } from '../../../state/AppContext';
import type { Contact, CrmActivity } from '../../../domain/crm';
import { ACTIVITY } from '../../../domain/crm';
import { escapeHtml, escapeAtrib, uid } from '../../../domain/format';
import {
	openDealsForContact,
	findPotentialDuplicates,
	activityLabel,
	formatPriceCents
} from '../../../domain/crmMath';
import { renderCrudTable, type TableColumn } from '../../CrudTable';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, qsIf, formValues } from '../../dom';
import { section, textField, modalFoot } from './crmUi';

let showDuplicates = false;

type ContactInput = {
	name: string;
	phone: string;
	email: string;
	notes: string;
	tags: string[];
};

export function renderCrmContatosView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.contacts.subscribe.bind(ctx.contacts),
		ctx.deals.subscribe.bind(ctx.deals),
		ctx.conversations.subscribe.bind(ctx.conversations),
		ctx.tags.subscribe.bind(ctx.tags)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const all = ctx.contacts.getAll();
	const rows = all.slice().sort(sortByName);
	const groups = findPotentialDuplicates(all);
	const dupeChip = dupeChipBtn(groups.length);
	root.innerHTML = `
		${headSection(dupeChip)}
		${showDuplicates ? duplicateSection(ctx, groups) : ''}
		${crudTable(ctx, rows)}`;
	wireEvents(root, ctx);
}

function headSection(dupeChip: string): string {
	const actions =
		'<button class="btn btn-primary" id="new-contact">' +
		`+ Novo contato</button> ${dupeChip}`;
	const hint = 'Agenda de contatos e negócios em aberto';
	return section('Contatos', hint, actions);
}

function sortByName(a: Contact, b: Contact): number {
	return a.name.localeCompare(b.name);
}

function dupeChipBtn(count: number): string {
	if (count === 0) return '';
	const active = showDuplicates ? ' active' : '';
	const title = ' title="Contatos com telefone/e-mail repetido"';
	return (
		`<button class="btn btn-ghost btn-sm${active}" id="toggle-dupes"` +
		title +
		`>Duplicados (${count})</button>`
	);
}

function crudTable(ctx: AppContext, rows: Contact[]): string {
	return renderCrudTable({
		columns: columns(ctx),
		rows,
		actions: (c) => actions(c, ctx),
		emptyTitle: 'Nenhum contato ainda',
		emptyHint: 'Cadastre contatos para conversar e abrir negócios.'
	});
}

function columns(ctx: AppContext): TableColumn<Contact>[] {
	return [
		{ header: 'Nome', render: (c) => escapeHtml(c.name) },
		{ header: 'Telefone', render: (c) => escapeHtml(c.phone) },
		{ header: 'E-mail', render: (c) => escapeHtml(c.email) },
		{ header: 'Tags', render: renderTags },
		{
			header: 'Em aberto',
			render: (c) => formatPriceCents(openTotal(ctx, c.id)),
			alignRight: true
		}
	];
}

function renderTags(contact: Contact): string {
	const html = contact.tags
		.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
		.join('');
	return html || '—';
}

function openTotal(ctx: AppContext, contactId: string): number {
	const deals = openDealsForContact(ctx.deals.getAll(), contactId);
	return deals.reduce((sum, d) => sum + d.valueCents, 0);
}

function actions(contact: Contact, ctx: AppContext): string {
	const hasConversation = ctx.conversations
		.getAll()
		.some((c) => c.contactId === contact.id);
	const chat = hasConversation
		? ''
		: btnHtml('chat', contact.id, 'Conversar');
	const timeline = contact.tags.length
		? btnHtml('timeline', contact.id, 'Histórico')
		: '';
	const edit = btnHtml('edit', contact.id, 'Editar');
	const del = btnHtml('delete', contact.id, 'Excluir', ' btn-danger');
	return `${chat}
		${timeline}
		${edit}
		${del}`;
}

function btnHtml(
	dataset: string,
	value: string,
	label: string,
	extra = ''
): string {
	return (
		`<button class="btn btn-ghost btn-sm${extra}" data-${dataset}="` +
		`${value}">${label}</button>`
	);
}

function bindData(
	root: HTMLElement,
	key: string,
	onClick: (value: string) => void
): void {
	root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((btn) => {
		btn.addEventListener('click', () => onClick(btn.dataset[key]!));
	});
}

function duplicateSection(ctx: AppContext, groups: Contact[][]): string {
	if (groups.length === 0) return noDuplicatesBlock();
	return dupBlock(groups);
}

function noDuplicatesBlock(): string {
	return (
		'<div class="risk-box"><strong>Nenhum duplicado.</strong>' +
		'<span>Contatos com o mesmo telefone/e-mail ' +
		'aparecem aqui para mesclar.</span></div>'
	);
}

function dupBlock(groups: Contact[][]): string {
	const items = groups.map((group) => dupItem(group)).join('');
	return `<div class="risk-box"><strong>Possíveis contatos duplicados</strong>
		<div class="risk-list">${items}</div></div>`;
}

function dupItem(group: Contact[]): string {
	const title = group.map((c) => escapeHtml(c.name)).join(' · ');
	const chips = group.map((c) => dupChip(c)).join('');
	const mergeBtn =
		'<button class="btn btn-ghost btn-sm" data-merge="' +
		`${group[0].id}|${group[1].id}" ` +
		'title="Agrupa tudo no primeiro contato">Mesclar</button>';
	return `
			<div class="risk-item">
				<div class="risk-title">${title}</div>
				<div class="risk-sub">${chips}</div>
				${mergeBtn}
			</div>`;
}

function dupChip(contact: Contact): string {
	const name = escapeHtml(contact.name);
	const phone = escapeHtml(contact.phone || contact.email);
	const details = `${name} · ${phone}`;
	return `<span class="chip">${details}</span>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	qs('#new-contact', root).addEventListener('click', () => openForm(ctx));
	qsIf('#toggle-dupes', root)?.addEventListener('click', () => {
		showDuplicates = !showDuplicates;
		draw(root, ctx);
	});
	bindData(root, 'merge', (pair) => handleMerge(ctx, pair));
	bindData(root, 'chat', (id) => startChat(ctx, id));
	bindData(root, 'timeline', (id) => openTimeline(ctx, id));
	bindData(root, 'edit', (id) => openForm(ctx, ctx.contacts.getById(id)));
	bindData(root, 'delete', (id) => handleDelete(ctx, id));
}

async function startChat(ctx: AppContext, contactId: string): Promise<void> {
	const contact = ctx.contacts.getById(contactId);
	if (!contact) return;
	await ctx.crm.startConversation(contact.id, 'whatsapp', contact.phone);
	window.location.hash = '/inbox';
	showToast('Conversa aberta');
}

async function handleMerge(ctx: AppContext, pair: string): Promise<void> {
	const [keep, remove] = pair.split('|');
	const ok = confirm(
		'Mesclar os dois contatos no primeiro? ' +
			'Negócios, tarefas e conversas serão agrupados.'
	);
	if (!ok) return;
	await ctx.crm.mergeContacts(keep, remove);
	showToast('Contatos mesclados');
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este contato?')) return;
	await ctx.contacts.remove(id);
	showToast('Contato excluído');
}

function openForm(ctx: AppContext, existing?: Contact): void {
	const modal = openModal({
		title: existing ? 'Editar contato' : 'Novo contato',
		bodyHtml: formHtml(ctx, existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function formHtml(ctx: AppContext, existing?: Contact): string {
	const v = existing ?? blankContact();
	return (
		`<form>${textField('name', 'Nome', v.name)}
		<div class="field-row">${rowHtml(v)}</div>
		${notesField(v.notes)}
		${tagsField(ctx, v)}
		${modalFoot()}</form>`
	);
}

function rowHtml(v: ContactInput): string {
	return (
		`${textField('phone', 'Telefone', v.phone)}` +
		textField('email', 'E-mail', v.email, false)
	);
}

function notesField(notes: string): string {
	const box =
		'<div class="field"><label class="field-label">Notas</label>' +
		'<textarea class="input" name="notes" rows="3">' +
		`${escapeHtml(notes)}</textarea></div>`;
	return box;
}

function tagsField(ctx: AppContext, v: ContactInput): string {
	const value = escapeAtrib(v.tags.join(', '));
	const vocabulary = ctx.tags.getAll().map((t) => t.name).join(', ');
	const opts = ctx.tags
		.getAll()
		.map((t) => `<option value="${escapeAtrib(t.name)}"></option>`)
		.join('');
	const hint = vocabulary
		? `<div class="hint">Vocabulário: ${escapeHtml(vocabulary)}</div>`
		: '';
	const open =
		'<div class="field"><label class="field-label">' +
		'Tags (separadas por vírgula)</label>';
	return (
		open +
		`
			<input class="input" name="tags" list="tag-vocabulary" value="${value}">
			<datalist id="tag-vocabulary">${opts}</datalist>
			${hint}</div>`
	);
}

function blankContact(): ContactInput {
	return { name: '', phone: '', email: '', notes: '', tags: [] as string[] };
}

function openTimeline(ctx: AppContext, contactId: string): void {
	const contact = ctx.contacts.getById(contactId);
	const activities = ctx.activities
		.getAll()
		.filter((a) => a.contactId === contactId)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, 20);
	const name = contact?.name ?? 'este contato';
	const bodyHtml = activities.length
		? timelineRows(activities)
		: timelineEmpty(name);
	openModal({ title: `Histórico de ${contact?.name ?? 'contato'}`, bodyHtml });
}

function timelineRows(activities: CrmActivity[]): string {
	const rows = activities.map((a) => timelineRow(a)).join('');
	return `<div class="timeline">${rows}</div>`;
}

function timelineRow(activity: CrmActivity): string {
	const meta = new Date(activity.createdAt).toLocaleString('pt-BR');
	return `
			<div class="timeline-row">
				<div class="timeline-meta">${meta}</div>
				<div class="timeline-text">${activityText(activity)}</div>
			</div>`;
}

function activityText(activity: CrmActivity): string {
	const ev = activity.evidence
		? ` — ${escapeHtml(activity.evidence)}`
		: '';
	return `${escapeHtml(activityLabel(activity.action))}${ev}`;
}

function timelineEmpty(name: string): string {
	const safe = escapeHtml(name);
	return (
		'<div class="empty-state"><div class="big">Sem histórico</div>' +
		`<p>Ações sobre ${safe} aparecerão aqui.</p></div>`
	);
}

async function recordUpdate(
	ctx: AppContext,
	existing: Contact,
	data: ContactInput,
	userId: string
): Promise<void> {
	await ctx.contacts.update(existing.id, data);
	await ctx.crm.recordActivity({
		contactId: existing.id,
		dealId: '',
		action: ACTIVITY.CONTACT_UPDATED,
		evidence: data.name,
		actorUserId: userId
	});
}

async function recordCreate(
	ctx: AppContext,
	data: ContactInput,
	userId: string
): Promise<void> {
	const saved = await ctx.contacts.add({
		id: uid(),
		...data,
		assignedUserId: userId,
		createdAt: new Date().toISOString()
	});
	await ctx.crm.recordActivity({
		contactId: saved.id,
		dealId: '',
		action: ACTIVITY.CONTACT_CREATED,
		evidence: data.name,
		actorUserId: userId
	});
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: Contact
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const data = {
		name: values.name,
		phone: values.phone,
		email: values.email,
		notes: values.notes,
		tags: values.tags.split(',').map((t) => t.trim()).filter(Boolean)
	};
	const userId = ctx.auth.currentUser()?.id ?? '';
	if (existing) {
		await recordUpdate(ctx, existing, data, userId);
	} else {
		await recordCreate(ctx, data, userId);
	}
	closeModal();
	showToast('Contato salvo');
}