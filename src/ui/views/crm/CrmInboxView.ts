import type { AppContext } from '../../../state/AppContext';
import type {
	Conversation,
	Message,
	ConversationNote,
	QuickReply
} from '../../../domain/crm';
import type { Order, OrderStatus } from '../../../domain/types';
import {
	escapeText,
	escapeAtrib,
	formatBRL,
	formatDate,
	todayISO
} from '../../../domain/format';
import {
	bumpPick,
	dropPick,
	findCustomerByName,
	ORDER_STATUS_LABELS,
	orderItemsText,
	orderLinesTotal,
	ordersForCustomerName,
	picksSubtotal,
	picksToLines,
	setPickQty,
	type OrderPick
} from '../../../domain/orderHistory';
import { autoRerender } from '../../reactive';
import { qs, qsIf, qsa } from '../../dom';
import {
	restoreFields,
	snapshotFields
} from '../../formState';
import { showToast } from '../../Toast';
import { section, badge, clientClassBadge } from './crmUi';
import { inboxPeriodChartHtml } from './inboxPeriodChart';
import { inboxMonthChartHtml } from './inboxMonthChart';
import { clientAbcClass } from '../../../domain/abcCurve';
import type { ChartPeriod } from '../../../domain/inboxChartPeriod';

let activeId = '';
let showNotes = false;
// Note currently being edited inline (empty = none). Module-level so a
// redraw mid-edit keeps the open row, cleared on contact switch/close.
let editingNoteId = '';
let rerender = () => {};

// Scroll management for the chat thread. `scrollOwnerId` tracks which
// conversation owns the current DOM, so switching chats never inherits the
// previous thread's offset. Sends always pin the thread to the bottom;
// receives pin only while the reader is already at/near the bottom.
let scrollOwnerId = '';
let stickToBottom = false;
let seenNewestKey = '';

const SCROLL_STICK_THRESHOLD = 24;

// The "Pedidos por período" chart sits below the yearly one and keeps its
// menu selection in a module-level let so re-renders do not reset it.
let chartPeriod: ChartPeriod = 'mes';

// "Novo pedido" composer state lives in module-level lets so a re-render
// (panel re-draw) keeps the in-progress order intact.
let composing = false;
let picks: OrderPick[] = [];
let pickValue = '';
let composerDelivery = todayISO();
let composerNotes = '';

// Shared EventSource for real-time updates. Multiple inbox views
// share one connection so we don't open duplicate sockets.
let eventSource: EventSource | null = null;

// Test hook to capture the refresh function for tests that simulate
// real-time updates without an actual SSE connection.
let testRefreshInbox: (() => Promise<void>) | null = null;
export function getTestRefreshInbox(): (() => Promise<void>) | null {
	return testRefreshInbox;
}

type InboxItem = ReturnType<AppContext['crm']['inbox']>[number];

const SNOOZE_OPTIONS = [
	{ value: '30', label: '30 min' },
	{ value: '180', label: '3 h' },
	{ value: '1440', label: '1 dia' },
	{ value: '4320', label: '3 dias' },
	{ value: '10080', label: '1 semana' }
];

// Month selected in the "Pedidos do mês" menu; module-level so a re-render
// (period switch, contact switch, poll refresh) keeps the user's choice.
let chartMonth = todayISO().slice(0, 7);

export function renderCrmInboxView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	// Fresh mount: re-derive the active chat from the CURRENT inbox. Module
	// state from a previous mount would pin an old conversation and render
	// its stale thread forever.
	activeId = '';
	scrollOwnerId = '';
	showNotes = false;
	editingNoteId = '';
	rerender = () => draw(root, ctx);
	draw(root, ctx);
	const disposeSSE = startSSE(ctx);
	return () => {
		disposeSSE();
	};
}

function draw(root: HTMLElement, ctx: AppContext): void {
	// The SSE stream repaints the whole inbox whenever the server pushes a
	// message, so the swap has to be invisible: capture every field (value,
	// focus, caret) and put it back on the far side.
	const fields = snapshotFields(root);
	const items = ctx.crm.inbox();
	const dormant = ctx.crm.dormantInbox();
	if (items.length && !items.some((i) => i.conversation.id === activeId)) {
		activeId = items[0].conversation.id;
	}
	const current = items.find((i) => i.conversation.id === activeId);
	const anchor = threadAnchor(root, ctx);
	root.innerHTML = pageHtml(ctx, items, dormant, current);
	scrollOwnerId = activeId;
	restoreFields(root, fields);
	wireEvents(root, ctx);
	applyThreadScroll(root, anchor.prevTop, anchor.pin);
	stickToBottom = false;
}

interface ThreadAnchor {
	prevTop: number;
	pin: boolean;
}

// Same chat keeps the reader's place; a new message pins the thread to the
// bottom — always on send, on receive only at/near the bottom. Read while the
// old nodes are still mounted; `newestAppeared` must run on every redraw or
// the next message reads as already-seen.
function threadAnchor(root: HTMLElement, ctx: AppContext): ThreadAnchor {
	const sameChat = scrollOwnerId === activeId;
	const prevTop = sameChat ? threadScrollTop(root) : 0;
	const wasAtBottom = sameChat && threadAtBottom(root);
	const gotMessage = newestAppeared(ctx) && sameChat;
	return { prevTop, pin: stickToBottom || (gotMessage && wasAtBottom) };
}

function threadScrollTop(root: HTMLElement): number {
	const el = root.querySelector<HTMLElement>('.inbox-messages');
	return el ? el.scrollTop : 0;
}

function threadAtBottom(root: HTMLElement): boolean {
	const el = root.querySelector<HTMLElement>('.inbox-messages');
	if (!el || el.scrollHeight <= 0) return false;
	const max = el.scrollHeight - el.clientHeight;
	return el.scrollTop >= max - SCROLL_STICK_THRESHOLD;
}

function newestMessageKey(ctx: AppContext): string {
	if (!activeId) return '';
	const thread = ctx.crm.thread(activeId);
	const last = thread[thread.length - 1];
	return last ? last.id : '';
}

function newestAppeared(ctx: AppContext): boolean {
	const newest = newestMessageKey(ctx);
	const appeared = newest !== '' && newest !== seenNewestKey;
	seenNewestKey = newest;
	return appeared;
}

function applyThreadScroll(
	root: HTMLElement, prevTop: number, pin: boolean
): void {
	const el = root.querySelector<HTMLElement>('.inbox-messages');
	if (!el) return;
	if (prevTop > 0) el.scrollTop = prevTop;
	if (pin) el.scrollTop = el.scrollHeight - el.clientHeight;
}

function createRefreshInbox(ctx: AppContext): () => Promise<void> {
	return async () => {
		await Promise.all([
			ctx.conversations.load(),
			ctx.messages.load(),
			ctx.contacts.load(),
			ctx.orders.load()
		]);
		rerender();
	};
}

function attachEventListeners(
	eventSource: EventSource,
	refresh: () => Promise<void>
): void {
	eventSource.addEventListener('messages', () => {
		void refresh();
	});
	eventSource.addEventListener('conversations', () => {
		void refresh();
	});
	eventSource.addEventListener('conversations_updated', () => {
		void refresh();
	});
	eventSource.onerror = () => {
		// Browser will attempt to reconnect automatically.
	};
}

// The session cookie is HttpOnly, so EventSource authenticates the stream the
// same way any other request does — no token in the URL (which would leak into
// access logs, Referer headers and browser history).
function sseEventUrl(): string {
	return `/api/crm/events?since=${Date.now()}`;
}

// Start an SSE connection to /api/crm/events and update the caches when
// real-time events arrive. The server pushes messages, conversations, and
// updated-conversations as they happen. This replaces the previous polling
// mechanism with a push-based listener.
function startSSE(ctx: AppContext): () => void {
	// Close existing connection if any (important for tests that create
	// multiple views)
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}

	eventSource = new EventSource(sseEventUrl());

	const refreshInbox = createRefreshInbox(ctx);
	testRefreshInbox = refreshInbox;
	attachEventListeners(eventSource, refreshInbox);

	return () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	};
}

function pageHtml(
	ctx: AppContext,
	items: InboxItem[],
	dormant: InboxItem[],
	current?: InboxItem
): string {
	const list = listHtml(items, dormant, current?.conversation);
	const thread = threadHtml(ctx, current);
	const classification = clientClassBadge(clientAbcClass(
		current?.contact
			? ordersForCustomerName(ctx.orders.getAll(), current.contact.name)
			: []
	));
	return `
		<div class="inbox-menu">
		<div class="inbox-charts">
		${inboxPeriodChartSection(ctx, current, chartPeriod)}
		${inboxMonthChartSection(ctx)}
		</div>
		${section('Caixa de entrada', 'Conversas e mensagens', '', classification)}
		<div class="inbox">
			<aside class="inbox-list">${list}</aside>
			<section class="inbox-thread">${thread}</section>
			${ordersPanelHtml(ctx, current)}
		</div>
		</div>`;
}

function inboxPeriodChartSection(
	ctx: AppContext, current: InboxItem | undefined, period: ChartPeriod
): string {
	const orders = current?.contact
		? ordersForCustomerName(ctx.orders.getAll(), current.contact.name)
		: [];
	return inboxPeriodChartHtml(orders, period);
}

function inboxMonthChartSection(ctx: AppContext): string {
	return inboxMonthChartHtml(ctx.orders.getAll(), chartMonth);
}

function listHtml(
	items: InboxItem[],
	dormant: InboxItem[],
	current?: Conversation
): string {
	if (items.length === 0 && dormant.length === 0) return emptyList();
	const openRows = items.length
		? items.map((item) => itemRow(item, current)).join('')
		: emptyOpen();
	const frozen = dormant.length ? dormantBlock(dormant) : '';
	return `<div class="inbox-list-head">Conversas abertas</div>
		${openRows}${frozen}`;
}

function emptyOpen(): string {
	const text =
		'<div class="empty-state"><div class="big">Nada em aberto</div>' +
		'<p>Nenhuma conversa aguardando atendimento.</p></div>';
	return text;
}

// The dormant queue: snoozed conversations park here (opposite of Adormecer)
// and are brought back with one click on the row's "↻ Retomar".
function dormantBlock(dormant: InboxItem[]): string {
	const rows = dormant.map((item) => dormantRow(item)).join('');
	return `<div class="inbox-list-head inbox-list-head--dormant">
		Adormecidas</div>${rows}`;
}

function dormantRow(item: InboxItem): string {
	const name = item.contact?.name ?? 'Contato desconhecido';
	const until = snoozeUntilText(item.conversation.snoozedUntil);
	return (
		`<button class="inbox-item inbox-dormant" data-restore="` +
		`${item.conversation.id}">
			<div class="inbox-item-top"><strong>${escapeText(name)}</strong>
				<span class="inbox-time">↻ Retomar</span></div>
			<div class="inbox-item-preview">Adormecida até ${until}</div>
		</button>`
	);
}

function snoozeUntilText(iso: string): string {
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '';
	return date.toLocaleString('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// Right-hand order panel: either a LIFO queue of the open chat contact's
// orders (matched by the denormalised customerName, newest on top) — shared
// with the "Pedidos" ERP product screen — or the "Novo pedido" composer,
// which replaces the history while it is being filled in. It is the third
// grid column, so it shares the 300px width of the conversations list.
// The "PEDIDOS" header holds its action on the opposite side of the same
// row; the action toggles from "+ Novo pedido" to "+ Adicionar" once the
// composer opens (and back when it closes).
function ordersPanelHtml(ctx: AppContext, current?: InboxItem): string {
	const head = '<div class="inbox-list-head"><span>Pedidos</span>' +
		`${orderAction()}</div>`;
	const body = composing
		? composerHtml(ctx, current)
		: current
			? ordersListHtml(ctx, current)
			: ordersEmpty('Selecione uma conversa para ver os pedidos.');
	return `<section class="inbox-orders">${head}${body}</section>`;
}

function orderAction(): string {
	return composing
		? '<button type="button" class="btn btn-primary btn-sm" id="add-pick">' +
			'+ Adicionar</button>'
		: newOrderButton();
}

function newOrderButton(): string {
	return '<button type="button" class="btn btn-primary btn-sm ' +
		'inbox-new-order" id="new-order">+ Novo pedido</button>';
}

function ordersListHtml(ctx: AppContext, current: InboxItem): string {
	if (!current.contact) return ordersEmpty('Sem contato vinculado.');
	const name = current.contact.name;
	const orders = ordersForCustomerName(ctx.orders.getAll(), name);
	if (orders.length === 0) {
		return ordersEmpty('Nenhum pedido para este contato.');
	}
	return orders.map((order) => orderCardHtml(order)).join('');
}

function ordersEmpty(hint: string): string {
	return `<div class="empty-state"><div class="big">Sem pedidos</div>
		<p>${hint}</p></div>`;
}

// ---------------------------------------------------------------------------
// "Novo pedido" composer — replaces the history while active. The picked
// products stack is LIFO (newest pick renders on top); the subtotal sits at
// the absolute bottom of the section, floating above the stack rows.
// ---------------------------------------------------------------------------

function composerHtml(ctx: AppContext, current?: InboxItem): string {
	if (!current?.contact) {
		return ordersEmpty('Selecione uma conversa com contato para abrir um ' +
			'pedido.');
	}
	if (ctx.products.getAll().length === 0) {
		return ordersEmpty('Cadastre produtos no menu Produtos para montar ' +
			'um pedido.');
	}
	return `<div class="order-composer">
		${composerPickerHtml(ctx)}
		${composerStackHtml()}
		<label class="field-label" for="composer-delivery">Entrega</label>
		<input class="input input-sm" type="date" id="composer-delivery"
			value="${composerDelivery}">
		<label class="field-label" for="composer-notes">Observações</label>
		<textarea class="input input-sm" id="composer-notes" rows="2"
			placeholder="Anotações do pedido">${escapeText(composerNotes)}</textarea>
		${composerActionsHtml()}
	</div>`;
}

function composerPickerHtml(ctx: AppContext): string {
	return `<div class="composer-picker">
		<select class="input input-sm" id="product-pick">
			${productOptions(ctx)}
		</select>
	</div>`;
}

function composerStackHtml(): string {
	return `<div class="composer-stack-wrap">
		<div class="composer-stack">${pickRows()}</div>
		<div class="composer-subtotal">
			<span>Subtotal</span>
			<strong id="composer-total">${composerTotal()}</strong>
		</div>
	</div>`;
}

function composerActionsHtml(): string {
	return `<div class="composer-actions">
		<button type="button" class="btn btn-sm" id="cancel-order">
			Cancelar</button>
		<button type="button" class="btn btn-primary btn-sm"
			id="finish-order">Finalizar pedido</button>
	</div>`;
}

function productOptions(ctx: AppContext): string {
	return ctx.products
		.getAll()
		.map((p) => {
			const value = ctx.pricing.productPricing(p).suggestedPrice;
			const selected = p.id === pickValue ? ' selected' : '';
			return `<option value="${p.id}"${selected}>${escapeText(p.name)}` +
				` — ${formatBRL(value)}</option>`;
		})
		.join('');
}

function pickRows(): string {
	if (picks.length === 0) {
		return '<div class="composer-hint">Nenhum produto adicionado.</div>';
	}
	return picks.map((pick, index) => pickRow(pick, index)).join('');
}

function pickRow(pick: OrderPick, index: number): string {
	const rowTotal = formatBRL(pick.unitPrice * pick.qty);
	return `<div class="composer-pick">
			<span class="composer-pick-name">${escapeText(pick.productName)}</span>
			<div class="composer-qty">
				<button type="button" class="composer-qty-btn" data-qty-down=
					"${index}" aria-label="Diminuir">−</button>
				<span class="composer-qty-value">${pick.qty}×</span>
				<button type="button" class="composer-qty-btn" data-qty-up=
					"${index}" aria-label="Aumentar">+</button>
			</div>
			<strong class="composer-pick-value">${rowTotal}</strong>
			<button type="button" class="composer-pick-remove" data-remove-pick=
				"${index}" aria-label="Remover">✕</button>
		</div>`;
}

function composerTotal(): string {
	return formatBRL(picksSubtotal(picks));
}

function bumpQty(root: HTMLElement, index: number, delta: number): void {
	const pick = picks[index];
	if (!pick) return;
	picks = setPickQty(picks, index, pick.qty + delta);
	rerender();
}

function startComposer(ctx: AppContext): void {
	const current = currentItem(ctx);
	if (!current?.contact) {
		return showToast('Selecione uma conversa com contato');
	}
	if (ctx.products.getAll().length === 0) {
		return showToast('Cadastre produtos no menu Produtos primeiro');
	}
	composing = true;
	picks = [];
	pickValue = ctx.products.getAll()[0].id;
	composerDelivery = todayISO();
	composerNotes = '';
	rerender();
}

function addPick(ctx: AppContext, root: HTMLElement): void {
	const select = qs<HTMLSelectElement>('#product-pick', root);
	const product = ctx.products.getById(select.value);
	if (!product) return showToast('Selecione um produto');
	const pricing = ctx.pricing.productPricing(product);
	picks = bumpPick(picks, {
		productId: product.id,
		productName: product.name,
		unitPrice: pricing.suggestedPrice,
		qty: 1
	});
	pickValue = product.id;
	rerender();
}

function removePickSlot(root: HTMLElement, index: number): void {
	if (index < 0 || index >= picks.length) return;
	picks = dropPick(picks, index);
	rerender();
}

function cancelComposer(): void {
	composing = false;
	picks = [];
	rerender();
}

async function finishComposer(ctx: AppContext): Promise<void> {
	const current = currentItem(ctx);
	if (!current?.contact) {
		return showToast('Selecione uma conversa com contato');
	}
	if (picks.length === 0) return showToast('Adicione ao menos um produto');
	const customer = findCustomerByName(
		ctx.customers.getAll(), current.contact.name
	) ?? { id: current.contact.id, name: current.contact.name };
	await ctx.order.create({
		customerId: customer.id,
		customerName: customer.name,
		lines: picksToLines(picks),
		deliveryDate: composerDelivery,
		notes: composerNotes,
		createdFrom: 'inbox'
	});
	composing = false;
	picks = [];
	await ctx.orders.load();
	showToast('Pedido criado');
	rerender();
}

function currentItem(ctx: AppContext): InboxItem | undefined {
	return ctx.crm.inbox().find((i) => i.conversation.id === activeId);
}

function orderCardHtml(order: Order): string {
	const status = escapeText(ORDER_STATUS_LABELS[order.status]);
	const tone = orderStatusTone(order.status);
	const created = formatDate(order.createdAt.slice(0, 10));
	const items = escapeText(orderItemsText(order.lines));
	const delivery = formatDate(order.deliveryDate);
	const total = formatBRL(orderLinesTotal(order.lines));
	return `
			<div class="order-card">
				<div class="order-card-top">
					<span class="badge ${tone}">${status}</span>
					<span class="inbox-time">${created}</span>
				</div>
				<div class="order-card-lines">${items}</div>
				<div class="order-card-foot"><span>Entrega ${delivery}</span>
					<strong>${total}</strong></div>
			</div>`;
}

function orderStatusTone(status: OrderStatus): string {
	if (status === 'entregue') return 'badge-sage';
	if (status === 'cancelado') return 'badge-berry';
	if (status === 'pendente') return 'badge-caramel';
	return '';
}

function emptyList(): string {
	const text =
		'<div class="empty-state"><div class="big">Caixa vazia</div>' +
		'<p>Abre uma conversa pelo cadastro de contatos.</p></div>';
	return text;
}

function itemRow(item: InboxItem, current?: Conversation): string {
	const name = item.contact?.name ?? 'Contato desconhecido';
	const preview = item.lastMessage?.text ?? '';
	const lastAt = item.lastMessage?.createdAt;
	const time = shortTime(lastAt ? lastAt : item.conversation.createdAt);
	const nameHtml = escapeText(name);
	const previewHtml = escapeText(preview);
	const active = current?.id === item.conversation.id ? ' active' : '';
	const title =
		`<div class="inbox-item-top"><strong>${nameHtml}</strong>` +
		`<span class="inbox-time">${time}</span></div>`;
	return (
		`<button class="inbox-item${active}" data-open="` +
		`${item.conversation.id}">
				${title}
				<div class="inbox-item-preview">${previewHtml}</div></button>`
	);
}

function threadHtml(ctx: AppContext, current?: InboxItem): string {
	if (!current) return noThread();
	// Chronological thread: the oldest message renders first, the newest/
	// most recent client message always lands at the BOTTOM of the chat.
	const messages = ctx.crm.thread(current.conversation.id);
	const replies = ctx.quickReplies.getAll();
	return (
		threadHeadHtml(ctx, current) +
		threadMessagesHtml(messages) +
		threadComposeHtml(replies)
	);
}

function noThread(): string {
	return (
		'<div class="empty-state"><div class="big">Selecione uma ' +
		'conversa</div></div>'
	);
}

function threadHeadHtml(ctx: AppContext, current: InboxItem): string {
	const channel = badge(current.conversation.channel);
	const phoneVal = current.conversation.channelPhone;
	const phone = phoneVal
		? `<span class="inbox-phone">${escapeText(phoneVal)}</span>`
		: '';
	const notes = showNotes ? notesPanel(ctx, current.conversation.id) : '';
	return `
		<div class="inbox-thread-head">
			<div class="inbox-contact">
				<strong>${escapeText(current.contact?.name ?? 'Contato')}</strong>
				${channel}
				${phone}
			</div>
			<div class="inbox-tools">
				${snoozeSelect()}
				${snoozeBtn()}
				${notesBtn()}
				${closeBtn()}
			</div>
		</div>
		${notes}`;
}

function snoozeSelect(): string {
	const opts = SNOOZE_OPTIONS.map((o) => snoozeOption(o)).join('');
	return `<select class="input input-sm" id="snooze-for">${opts}</select>`;
}

function snoozeOption(o: { value: string; label: string }): string {
	return `<option value="${o.value}">${o.label}</option>`;
}

function snoozeBtn(): string {
	return (
		'<button class="btn btn-ghost btn-sm" id="snooze-btn"' +
		' title="Tirar a conversa da caixa por um tempo">Adormecer</button>'
	);
}

function notesBtn(): string {
	const active = showNotes ? ' active' : '';
	return (
		`<button class="btn btn-ghost btn-sm${active}" id="toggle-notes">` +
		'Notas</button>'
	);
}

function closeBtn(): string {
	return (
		'<button class="btn btn-ghost btn-sm" id="close-conv">' +
		'Fechar</button>'
	);
}

function threadMessagesHtml(messages: Message[]): string {
	return `\n    <div class="inbox-messages">${messageRows(messages)}</div>`;
}

function messageRows(messages: Message[]): string {
	if (messages.length === 0) return noMessages();
	return messages.map((m) => messageRow(m)).join('');
}

function noMessages(): string {
	return (
		'<div class="empty-state"><div class="big">Sem mensagens</div>' +
		'<p>Envie a primeira mensagem abaixo.</p></div>'
	);
}

function messageRow(m: Message): string {
	const side = m.direction === 'inbound' ? 'in' : 'out';
	const tick = tickOf(m);
	return (
		`<div class="bubble ${side}"><div class="bubble-text">` +
		`${escapeText(m.text)}</div>
			<div class="bubble-time">${shortTime(m.createdAt)}${tick}</div></div>`
	);
}

function tickOf(m: Message): string {
	if (m.direction !== 'outbound' || !m.waStatus) return '';
	return (
		`<span class="bubble-tick" title="${escapeAtrib(m.waStatus)}">` +
		`${tickGlyph(m.waStatus)}</span>`
	);
}

function tickGlyph(status: string): string {
	if (status === 'delivered') return '✓✓';
	if (status === 'read') return '✓✓✷';
	if (status === 'failed') return '✗';
	return '✓';
}

function threadComposeHtml(replies: QuickReply[]): string {
	const chips = replies
		.slice(0, 6)
		.map((r) => replyChip(r))
		.join('');
	const area =
		'<textarea class="input" id="composer-text" rows="2" ' +
		'placeholder="Escreva uma mensagem…" required></textarea>';
	return `
		<div class="inbox-compose">
			<div class="inbox-replies">${chips}</div>
			<form id="composer">
				${area}
				<button type="submit" class="btn btn-primary">Enviar</button>
			</form>
		</div>`;
}

function replyChip(r: QuickReply): string {
	return (
		`<button class="chip-btn" data-reply="${escapeAtrib(r.body)}">` +
		`/${escapeText(r.shortcut)}</button>`
	);
}

function notesPanel(ctx: AppContext, conversationId: string): string {
	const inner = notesList(ctx, conversationId);
	const input =
		'<input class="input" id="note-text" ' +
		'placeholder="Anotação para este contato…" required>';
	return `<div class="inbox-notes">
		${inner}
		<form id="note-form" class="note-form">
			${input}
			<button type="submit" class="btn btn-primary">Salvar</button>
		</form>
	</div>`;
}

function notesList(ctx: AppContext, conversationId: string): string {
	const notes = ctx.crm.notesForConversation(conversationId);
	if (notes.length === 0) {
		return '<div class="notes-empty">Sem anotações ainda.</div>';
	}
	const rows = notes.map((n) => noteRow(n)).join('');
	return `<div class="notes-list">${rows}</div>`;
}

function noteRow(n: ConversationNote): string {
	if (n.id === editingNoteId) return noteEditRow(n);
	const body = escapeText(n.body);
	return `
			<div class="note-row"><div class="note-body">${body}</div>
			<div class="note-meta">${shortTime(n.createdAt)}</div>
			<div class="note-actions">
				<button type="button" class="btn btn-ghost btn-sm"
					data-note-edit="${n.id}">Editar</button>
				<button type="button" class="btn btn-ghost btn-sm"
					data-note-del="${n.id}">Excluir</button>
			</div></div>`;
}

function noteEditRow(n: ConversationNote): string {
	const body = escapeText(n.body);
	return `
			<div class="note-row">
				<form id="note-edit-form" class="note-edit-form">
					<textarea class="input input-sm" id="note-edit-text"
						rows="2">${body}</textarea>
					<div class="note-actions">
						<button type="submit" class="btn btn-primary btn-sm">Salvar</button>
						<button type="button" class="btn btn-ghost btn-sm"
							data-note-cancel>Cancelar</button>
					</div>
				</form>
			</div>`;
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	bindOpen(root);
	bindDormant(root, ctx);
	bindReply(root);
	bindSnooze(root, ctx);
	bindNotes(root);
	bindNoteForm(root, ctx);
	bindNoteActions(root, ctx);
	bindClose(root, ctx);
	bindComposer(root, ctx);
	bindNewOrder(root, ctx);
	bindOrderComposer(root, ctx);
	bindPeriodMenu(root);
	bindMonthMenu(root);
}

function bindPeriodMenu(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>('[data-period]').forEach((btn) =>
		btn.addEventListener('click', () => {
			chartPeriod = btn.dataset.period as ChartPeriod;
			rerender();
		}));
}

// Bound to the select, never to `root`: the root outlives every redraw, so a
// root-level listener would stack up and fire once per accumulated draw.
function bindMonthMenu(root: HTMLElement): void {
	qsa<HTMLSelectElement>('.month-select', root).forEach((select) =>
		select.addEventListener('change', () => {
			chartMonth = select.value;
			rerender();
		}));
}

function bindOpen(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>('[data-open]').forEach((btn) =>
		btn.addEventListener('click', () => select(btn.dataset.open!)));
}

function bindDormant(root: HTMLElement, ctx: AppContext): void {
	root.querySelectorAll<HTMLElement>('[data-restore]').forEach((row) =>
		bindRestoreRow(row, ctx));
}

function bindRestoreRow(row: HTMLElement, ctx: AppContext): void {
	row.addEventListener('click', () => {
		const id = row.dataset.restore;
		if (id) void restoreConversation(ctx, id);
	});
}

async function restoreConversation(
	ctx: AppContext, conversationId: string
): Promise<void> {
	await ctx.crm.resumeConversation(conversationId);
	select(conversationId);
	showToast('Conversa retomada');
}

function bindReply(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>('[data-reply]').forEach((chip) =>
		chip.addEventListener('click', () => {
			const textarea = qs<HTMLTextAreaElement>('#composer-text', root);
			textarea.value = chip.dataset.reply ?? '';
			textarea.focus();
		}));
}

function bindSnooze(root: HTMLElement, ctx: AppContext): void {
	qsIf('#snooze-btn', root)?.addEventListener('click', async () => {
		if (!activeId) return;
		const snoozeSelect = qs<HTMLSelectElement>('#snooze-for', root);
		const minutes = Number(snoozeSelect.value || 0);
		const until = new Date(Date.now() + minutes * 60000).toISOString();
		await ctx.crm.snoozeConversation(activeId, until);
		activeId = '';
		showToast('Conversa adormecida');
		rerender();
	});
}

function bindNotes(root: HTMLElement): void {
	qsIf('#toggle-notes', root)?.addEventListener('click', () => {
		showNotes = !showNotes;
		rerender();
	});
}

function bindNoteForm(root: HTMLElement, ctx: AppContext): void {
	qsIf('#note-form', root)?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const body = qs<HTMLInputElement>('#note-text', root).value.trim();
		if (!body || !activeId) return;
		await ctx.crm.addNote(activeId, body, ctx.auth.currentUser()?.id ?? '');
		clearField(root, '#note-text', body);
		rerender();
	});
}

function bindNoteActions(root: HTMLElement, ctx: AppContext): void {
	root.querySelectorAll<HTMLElement>('[data-note-edit]').forEach((btn) =>
		btn.addEventListener('click', () => {
			editingNoteId = btn.dataset.noteEdit ?? '';
			rerender();
		}));
	root.querySelectorAll<HTMLElement>('[data-note-del]').forEach((btn) =>
		btn.addEventListener('click', () => void deleteNote(btn, ctx)));
	qsIf('[data-note-cancel]', root)?.addEventListener('click', () => {
		editingNoteId = '';
		rerender();
	});
	qsIf('#note-edit-form', root)?.addEventListener('submit', (event) =>
		void saveNoteEdit(event, root, ctx));
}

async function saveNoteEdit(
	event: Event, root: HTMLElement, ctx: AppContext
): Promise<void> {
	event.preventDefault();
	const body = qs<HTMLTextAreaElement>('#note-edit-text', root).value.trim();
	if (!body || !editingNoteId) return;
	const id = editingNoteId;
	editingNoteId = '';
	await ctx.crm.updateNote(id, body, ctx.auth.currentUser()?.id ?? '');
	showToast('Anotação editada');
	rerender();
}

async function deleteNote(btn: HTMLElement, ctx: AppContext): Promise<void> {
	const id = btn.dataset.noteDel;
	if (!id || !confirm('Excluir esta anotação?')) return;
	await ctx.crm.deleteNote(id, ctx.auth.currentUser()?.id ?? '');
	if (editingNoteId === id) editingNoteId = '';
	showToast('Anotação excluída');
	rerender();
}

function bindClose(root: HTMLElement, ctx: AppContext): void {
	qsIf('#close-conv', root)?.addEventListener('click', async () => {
		if (!activeId) return;
		await ctx.crm.closeConversation(activeId);
		activeId = '';
		editingNoteId = '';
		showToast('Conversa encerrada');
		rerender();
	});
}

function bindComposer(root: HTMLElement, ctx: AppContext): void {
	qsIf('#composer', root)?.addEventListener('submit', (event) =>
		sendMessage(root, event, ctx));
}

function bindNewOrder(root: HTMLElement, ctx: AppContext): void {
	qsIf('#new-order', root)?.addEventListener('click', () =>
		startComposer(ctx));
}

function bindOrderComposer(root: HTMLElement, ctx: AppContext): void {
	qsIf('#add-pick', root)?.addEventListener('click', () => addPick(ctx, root));
	root.querySelectorAll<HTMLElement>('[data-remove-pick]').forEach((btn) =>
		btn.addEventListener('click', () =>
			removePickSlot(root, Number(btn.dataset.removePick))));
	root.querySelectorAll<HTMLElement>('[data-qty-up]').forEach((btn) =>
		btn.addEventListener('click', () =>
			bumpQty(root, Number(btn.dataset.qtyUp), 1)));
	root.querySelectorAll<HTMLElement>('[data-qty-down]').forEach((btn) =>
		btn.addEventListener('click', () =>
			bumpQty(root, Number(btn.dataset.qtyDown), -1)));
	qsIf('#composer-delivery', root)?.addEventListener('change', (event) => {
		composerDelivery = (event.target as HTMLInputElement).value;
	});
	qsIf('#composer-notes', root)?.addEventListener('input', (event) => {
		composerNotes = (event.target as HTMLTextAreaElement).value;
	});
	qsIf('#cancel-order', root)?.addEventListener('click', () =>
		cancelComposer());
	qsIf('#finish-order', root)?.addEventListener('click', () =>
		finishComposer(ctx));
}

function select(id: string): void {
	activeId = id;
	showNotes = false;
	editingNoteId = '';
	composing = false;
	picks = [];
	rerender();
}

// Both submit paths `await` the network, and a redraw may swap the node in
// the meantime — clearing the captured one is then a no-op and the redraw
// snapshots the stale text right back in. Clear the LIVE field, and only
// while it still holds what was submitted, so text typed mid-flight stays.
function clearField(root: HTMLElement, selector: string, sent: string): void {
	const field = qsIf<HTMLInputElement | HTMLTextAreaElement>(selector, root);
	if (field && field.value.trim() === sent) field.value = '';
}

async function sendMessage(
	root: HTMLElement, event: Event, ctx: AppContext
): Promise<void> {
	event.preventDefault();
	const text = qs<HTMLTextAreaElement>('#composer-text', root).value.trim();
	if (!text || !activeId) return;
	const channel = ctx.conversations.getById(activeId)?.channel ?? '';
	if (channel === 'whatsapp') {
		try {
			await ctx.whatsapp.sendText(activeId, text);
		} catch (error) {
			showToast(error instanceof Error ? error.message : 'Falha no envio');
			return;
		}
	} else {
		await ctx.crm.sendMessage(activeId, text, ctx.auth.currentUser()?.id ?? '');
	}
	clearField(root, '#composer-text', text);
	stickToBottom = true;
	rerender();
}

function shortTime(iso: string): string {
	const date = new Date(iso);
	if (isNaN(date.getTime())) return '';
	return date.toLocaleTimeString('pt-BR', {
		hour: '2-digit',
		minute: '2-digit'
	});
}