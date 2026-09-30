import type { AppContext } from '../../../state/AppContext';
import {
	formatPriceCents,
	upcomingEvents as upcomingEventsOf
} from '../../../domain/crmMath';
import { todayISO, escapeHtml } from '../../../domain/format';
import { autoRerender } from '../../reactive';
import { section, kpiCard } from './crmUi';

type PainelItem = ReturnType<AppContext['crm']['inbox']>[number];
type PainelEvent = ReturnType<typeof upcomingEventsOf>[number];

export function renderCrmPainelView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	return autoRerender(() => draw(root, ctx), [
		ctx.conversations.subscribe.bind(ctx.conversations),
		ctx.messages.subscribe.bind(ctx.messages),
		ctx.deals.subscribe.bind(ctx.deals),
		ctx.tasks.subscribe.bind(ctx.tasks),
		ctx.events.subscribe.bind(ctx.events),
		ctx.catalog.subscribe.bind(ctx.catalog),
		ctx.contacts.subscribe.bind(ctx.contacts),
		ctx.auth.subscribe.bind(ctx.auth)
	]);
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const head = section('Painel', 'Visão geral do time de vendas', '');
	const kpisRow =
		'\n    <div class="grid-cards" style="margin-bottom:22px;">' +
		`${kpis(ctx)}</div>`;
	const cardsOpen =
		'\n    <div class="grid-cards" style="grid-template-columns:1.3fr 1fr;">';
	const inboxCard =
		'\n      <div class="card" style="padding:16px 18px;">' +
		`${recentConversations(ctx)}</div>`;
	const upcomingCard =
		'\n      <div class="card" style="padding:16px 18px;">' +
		`${upcoming(ctx)}</div>`;
	root.innerHTML =
		`${loginHint(ctx)}${head}${kpisRow}${cardsOpen}${inboxCard}` +
		`${upcomingCard}` +
		'\n    </div>';
}

function loginHint(ctx: AppContext): string {
	if (ctx.auth.isAuthenticated()) return '';
	return (
		'<a class="login-hint" href="#/equipe">' +
		'Você não está logado. Entre na aba Equipe para ' +
		'enviar mensagens pelas conversas.</a>'
	);
}

function kpis(ctx: AppContext): string {
	const openDeals = ctx.deals.getAll().filter((d) => d.status === 'open');
	const openTotal = openDeals.reduce((sum, d) => sum + d.valueCents, 0);
	const openKpi = String(ctx.crm.openInboxCount());
	const tasksKpi = String(ctx.crm.todayTasks().length);
	const funilValue = `${openDeals.length} negócios`;
	const funilSub = formatPriceCents(openTotal);
	const activeKpi = String(
		ctx.catalog.getAll().filter((p) => p.ativo).length
	);
	return [
		kpiCard('Conversas abertas', openKpi, 'aguardando atendimento'),
		kpiCard('Funil em aberto', funilValue, funilSub),
		kpiCard('Tarefas de hoje', tasksKpi, 'para executar'),
		kpiCard('Catálogo', activeKpi, 'produtos ativos')
	].join('');
}

function recentConversations(ctx: AppContext): string {
	const items = ctx.crm.inbox().slice(0, 6);
	const body = items.length === 0
		? emptyInbox()
		: items.map((item) => convRow(item)).join('');
	return `<h3 style="margin-top:0;">Conversas recentes</h3>\n    ${body}`;
}

function emptyInbox(): string {
	return (
		'<div class="empty-state"><div class="big">Caixa vazia</div>' +
		'<p>Abra uma conversa pelo cadastro de contatos.</p></div>'
	);
}

function convRow(item: PainelItem): string {
	const name = escapeHtml(item.contact?.name ?? 'Contato');
	const text = escapeHtml(item.lastMessage?.text ?? '');
	const time = shortTime(item.conversation.lastMessageAt);
	return (
		`<a class="calc-row" href="#/inbox">
			<span><strong>${name}</strong><br>` +
		`<span class="soft">${text}</span></span>` +
		`\n      <span class="num soft">${time}</span></a>`
	);
}

function upcoming(ctx: AppContext): string {
	const events = upcomingEventsOf(ctx.events.getAll(), todayISO());
	const body = events.length === 0
		? emptyAgenda()
		: events.map((e) => eventRow(ctx, e)).join('');
	return `<h3 style="margin-top:0;">Próximos compromissos</h3>\n    ${body}`;
}

function emptyAgenda(): string {
	return (
		'<div class="empty-state"><div class="big">Agenda livre</div>' +
		'<p>Nenhum compromisso nos próximos dias.</p></div>'
	);
}

function eventRow(
	ctx: AppContext,
	e: PainelEvent
): string {
	const title = escapeHtml(e.title);
	const name = escapeHtml(ctx.contacts.getById(e.contactId)?.name ?? '');
	const time = dayTime(e.startsAt);
	return (
		`<div class="calc-row">` +
		`\n      <span>${title} · ${name}</span>` +
		`\n      <span class="num soft">${time}</span></div>`
	);
}

function shortTime(iso: string): string {
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '';
	const day = date.toLocaleDateString('pt-BR', {
		day: '2-digit',
		month: '2-digit'
	});
	const time = date.toLocaleTimeString('pt-BR', {
		hour: '2-digit',
		minute: '2-digit'
	});
	return `${day} ${time}`;
}

function dayTime(iso: string): string {
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '';
	return date.toLocaleString('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}