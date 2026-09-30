import type { AppContext } from '../../../state/AppContext';
import type { CalendarEvent } from '../../../domain/crm';
import { escapeHtml, uid, todayISO } from '../../../domain/format';
import { upcomingEvents } from '../../../domain/crmMath';
import { openModal, closeModal } from '../../Modal';
import { showToast } from '../../Toast';
import { autoRerender } from '../../reactive';
import { qs, formValues } from '../../dom';
import {
	section,
	textField,
	datetimeField,
	selectField,
	modalFoot,
	rowButton
} from './crmUi';

const REMINDER_OPTIONS = [
	{ value: '0', label: 'Sem lembrete' },
	{ value: '15', label: '15 min antes' },
	{ value: '30', label: '30 min antes' },
	{ value: '60', label: '1 h antes' },
	{ value: '1440', label: '1 dia antes' }
];

const EVENT_TYPES = ['reuniao', 'degustacao', 'entrega', 'outro'];

export function renderCrmAgendaView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.events.subscribe.bind(ctx.events),
		ctx.contacts.subscribe.bind(ctx.contacts),
		ctx.appointmentTypes.subscribe.bind(ctx.appointmentTypes)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const events = upcomingEvents(ctx.events.getAll(), todayISO());
	root.innerHTML = `
		${pageHead()}
		<div class="agenda">${groupedHtml(ctx, events)}</div>`;
	wireEvents(root, ctx);
}

function pageHead(): string {
	const btn =
		'<button class="btn btn-primary" id="new-event">' +
		'+ Novo evento</button>';
	return section('Agenda', 'Compromissos e degustações dos próximos dias', btn);
}

function agendaEmpty(): string {
	return (
		'<div class="empty-state"><div class="big">Agenda vazia</div>' +
		'<p>Nenhum compromisso agendado.</p></div>'
	);
}

function groupedHtml(ctx: AppContext, events: CalendarEvent[]): string {
	if (events.length === 0) return agendaEmpty();
	const byDay = new Map<string, CalendarEvent[]>();
	events.forEach((event) => {
		const day = event.startsAt.slice(0, 10);
		byDay.set(day, [...(byDay.get(day) ?? []), event]);
	});
	return [...byDay.entries()].map(([day, list]) => `
		<div class="agenda-day">
			<div class="agenda-day-label">${dayLabel(day)}</div>
			${list.map((event) => eventRow(ctx, event)).join('')}
		</div>`).join('');
}

function findType(ctx: AppContext, event: CalendarEvent) {
	return ctx.crm
		.appointmentTypes(true)
		.find((t) => t.name === event.eventType || t.id === event.eventType);
}

function eventRow(ctx: AppContext, event: CalendarEvent): string {
	const contact = ctx.contacts.getById(event.contactId);
	const type = findType(ctx, event);
	const color = escapeHtml(type?.color ?? '');
	const dot = color
		? `<span class="color-dot" style="background:${color}"></span>`
		: '';
	const reminder = event.remindBeforeMin
		? `<span class="badge">⏰ ${reminderText(event.remindBeforeMin)}</span>`
		: '';
	const contactName = contact ? escapeHtml(contact.name) : '—';
	const typeName = escapeHtml(event.eventType);
	return `<div class="agenda-row">
		<div class="agenda-time">${timeRange(event)}</div>
		<div class="agenda-body">
			<div class="agenda-title">${dot}${escapeHtml(event.title)}</div>
			<div class="agenda-sub">${contactName} · ${typeName} ${reminder}</div>
		</div>
		${eventActions(event)}
	</div>`;
}

function eventActions(event: CalendarEvent): string {
	return (
		`${rowButton('Editar', 'edit-event', event.id)}` +
		rowButton('Excluir', 'delete-event', event.id, true)
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
	qs('#new-event', root).addEventListener('click', () => openForm(ctx));
	bindData(root, 'edit-event', (id) => openForm(ctx, ctx.events.getById(id)));
	bindData(root, 'delete-event', (id) => handleDelete(ctx, id));
}

async function handleDelete(ctx: AppContext, id: string): Promise<void> {
	if (!confirm('Excluir este evento?')) return;
	await ctx.events.remove(id);
	showToast('Evento excluído');
}

function openForm(ctx: AppContext, existing?: CalendarEvent): void {
	const modal = openModal({
		title: existing ? 'Editar evento' : 'Novo evento',
		bodyHtml: formHtml(ctx, existing)
	});
	qs('form', modal).addEventListener('submit', (event) =>
		handleSubmit(event, ctx, existing));
}

function typeOptionsOf(
	ctx: AppContext
): Array<{ value: string; label: string }> {
	const types = ctx.crm.appointmentTypes();
	if (types.length) {
		return types.map((t) => ({ value: t.name, label: t.name }));
	}
	return EVENT_TYPES.map((t) => ({ value: t, label: t }));
}

function formHtml(ctx: AppContext, existing?: CalendarEvent): string {
	const contacts = [
		{ value: '', label: '— nenhum —' },
		...ctx.contacts.getAll().map((c) => ({ value: c.id, label: c.name }))
	];
	const types = typeOptionsOf(ctx);
	const remindSel = String(existing?.remindBeforeMin ?? 0);
	const contactSel = existing?.contactId ?? '';
	return `<form>${textField('title', 'Título', existing?.title ?? '')}
		<div class="field-row">
			${datetimeField('startsAt', 'Início', localValue(existing?.startsAt))}
			${datetimeField('endsAt', 'Fim', localValue(existing?.endsAt))}
		</div>
		<div class="field-row">
			${selectField('contactId', 'Contato', contacts, contactSel)}
			${selectField('eventType', 'Tipo', types, existing?.eventType ?? 'outro')}
		</div>
		${selectField('remindBeforeMin', 'Lembrete', REMINDER_OPTIONS, remindSel)}
		${modalFoot()}</form>`;
}

async function handleSubmit(
	event: Event,
	ctx: AppContext,
	existing?: CalendarEvent
): Promise<void> {
	event.preventDefault();
	const values = formValues(event.target as HTMLFormElement);
	const startsAt = utc(values.startsAt);
	const data = {
		title: values.title,
		contactId: values.contactId,
		startsAt,
		endsAt: values.endsAt ? utc(values.endsAt) : startsAt,
		eventType: values.eventType,
		remindBeforeMin: Number(values.remindBeforeMin) || 0
	};
	if (existing) {
		await ctx.events.update(existing.id, data as Partial<CalendarEvent>);
	} else {
		await ctx.events.add({
			id: uid(),
			...data,
			createdBy: ctx.auth.currentUser()?.id ?? '',
			createdAt: new Date().toISOString()
		});
	}
	closeModal();
	showToast('Evento salvo');
}

function reminderText(minutes: number): string {
	const wholeDays = minutes >= 1440 && minutes % 1440 === 0;
	const wholeHours = minutes >= 60 && minutes % 60 === 0;
	if (wholeDays) return `${minutes / 1440} dia(s) antes`;
	if (wholeHours) return `${minutes / 60} h antes`;
	return `${minutes} min antes`;
}

function localValue(iso: string | undefined): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	const y = date.getFullYear();
	const m = pad(date.getMonth() + 1);
	const d = pad(date.getDate());
	const t = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	return `${y}-${m}-${d}T${t}`;
}

function utc(local: string): string {
	return new Date(local).toISOString();
}

function timeRange(event: CalendarEvent): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	const start = new Date(event.startsAt);
	const end = new Date(event.endsAt);
	if (isNaN(start.getTime())) return '—';
	const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
	const endStr = isNaN(end.getTime())
		? ''
		: `–${pad(end.getHours())}:${pad(end.getMinutes())}`;
	return `${startStr}${endStr}`;
}

function dayLabel(isoDate: string): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return date.toLocaleDateString('pt-BR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}