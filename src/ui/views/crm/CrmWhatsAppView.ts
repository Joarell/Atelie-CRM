import type { AppContext } from '../../../state/AppContext';
import type { WahaSessionState } from '../../../repositories/WahaApiRepository';
import type { Conversation } from '../../../domain/crm';
import { escapeText, escapeAtrib } from '../../../domain/format';
import {
	classifyWahaLoadFailure,
	composeTargets,
	whatsappConversationFor
} from '../../../domain/whatsapp';
import type { WahaLoadFailure } from '../../../domain/whatsapp';
import { autoRerender } from '../../reactive';
import { startRealtimeRefresh } from '../../realtimeRefresh';
import { qs } from '../../dom';
import { showToast } from '../../Toast';
import { section, kpiCard, badge } from './crmUi';

let status: WahaSessionState | null | undefined;
let loadFailure: WahaLoadFailure | null = null;
let busy = false;
let refresh: (() => void) | null = null;
let lastSnapshot = '';

// Shared EventSource for real-time session status updates
let eventSource: EventSource | null = null;

let pairingPollStop: (() => void) | null = null;

export function renderCrmWhatsAppView(
	root: HTMLElement,
	ctx: AppContext
): () => void {
	lastSnapshot = '';
	status = undefined;
	stopPairingPoll();
	refresh = async () => {
		await loadAndMaybeRender(root, ctx);
		syncPairingPoll();
	};
	void refresh();
	const disposeSSE = startSSE(ctx);
	const dispose = autoRerender(rerenderFor(root, ctx), [
		ctx.conversations.subscribe.bind(ctx.conversations),
		ctx.messages.subscribe.bind(ctx.messages),
		ctx.auth.subscribe.bind(ctx.auth)
	]);
	return () => {
		disposeSSE();
		dispose();
		stopPairingPoll();
	};
}

// While a session waits to be paired the WAHA engine ROTATES the pairing QR
// (measured: two GET /auth/qr 20s apart, status still SCAN_QR_CODE, two
// different images) and emits NO event for it, so nothing redraws the stale
// code and the operator's scan just fails. DO NOT "clean this up": it is the
// one narrow exception to the rule at startSSE (realtime replaced general
// interval polling and that still stands for messages/conversations) — a
// pairing QR is the only state WAHA mutates silently. Bounded to the
// awaiting-a-scan statuses and stopped on WORKING/FAILED/STOPPED or teardown.
const PAIRING_POLL_MS = 5000;

function awaitingScan(): boolean {
	const s = status?.session?.status ?? status?.health?.session?.status;
	return s === 'SCAN_QR_CODE' || s === 'STARTING';
}

function syncPairingPoll(): void {
	if (awaitingScan()) startPairingPoll();
	else stopPairingPoll();
}

function startPairingPoll(): void {
	if (pairingPollStop) return;
	pairingPollStop = startRealtimeRefresh(async () => {
		await refresh?.();
	}, PAIRING_POLL_MS);
}

function stopPairingPoll(): void {
	if (!pairingPollStop) return;
	pairingPollStop();
	pairingPollStop = null;
}

function rerenderFor(root: HTMLElement, ctx: AppContext): () => void {
	return () => draw(root, ctx);
}

async function loadAndMaybeRender(
	root: HTMLElement,
	ctx: AppContext
): Promise<void> {
	let key = '';
	try {
		const next = await ctx.whatsapp.session();
		key = snapshotKey(next);
		if (key === lastSnapshot) return;
		lastSnapshot = key;
		status = next;
		loadFailure = null;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		loadFailure = classifyWahaLoadFailure(reason);
		status = null;
		lastSnapshot = '';
	}
	draw(root, ctx);
}

function snapshotKey(state: WahaSessionState | null): string {
	const h = state?.health;
	const s = state?.session;
	return [
		state?.configured,
		h?.reachable,
		h?.authenticated,
		h?.healthy,
		s?.status,
		s?.qr
	].join('|');
}

function isWorking(state: WahaSessionState | null | undefined): boolean {
	return state?.health?.healthy === true;
}

function attachWhatsAppEventListeners(eventSource: EventSource): void {
	eventSource.addEventListener('messages', () => {
		void refresh?.();
	});
	eventSource.addEventListener('conversations', () => {
		void refresh?.();
	});
	eventSource.addEventListener('conversations_updated', () => {
		void refresh?.();
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

// Start an SSE connection to /api/crm/events and update the session status
// when real-time events arrive. This replaces the previous polling interval
// for session status checks.
function startSSE(ctx: AppContext): () => void {
	// Close existing connection if any (important for tests that create
	// multiple views)
	if (eventSource) {
		eventSource.close();
		eventSource = null;
	}

	eventSource = new EventSource(sseEventUrl());

	attachWhatsAppEventListeners(eventSource);

	return () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	};
}

function draw(root: HTMLElement, ctx: AppContext): void {
	const draft = draftText(root);
	const state = status;
	const statusArea = statusCards(state);
	// `state && …` yields the falsy state itself, so interpolating it wrote the
	// literal "null" (failed load) or "undefined" (first paint) into the page.
	// There is no ingress to report before a snapshot exists — render nothing.
	const banner = state ? ingressWarning(state) : '';
	const compose = ctx.auth.isAuthenticated() ? composeCard(ctx) : loginHint();
	root.innerHTML = `
		${pageHead()}
		<div class="grid-cards">${statusArea}</div>
		${banner}
		${sessionCard(state)}
		${compose}`;
	restoreDraft(root, draft);
	wireEvents(root, ctx);
}

// WORKING is not enough for a message to reach the app: the engine must hold
// the app's webhook too. When it is absent (or the env has no WHATSAPP_HOOK_URL
// to register at all) every message, including from a brand-new contact, is
// silently dropped by the engine — surfaced here instead of a healthy card.
// Registration alone is still not enough: a receiver that refuses every
// delivery (no usable secret while a signature is required) drops them just as
// silently, so that refusal outranks the "registered" all-clear.
function ingressWarning(state: WahaSessionState): string {
	const hook = state.webhook;
	if (state.health?.reachable !== true) return '';
	if (state.health?.authenticated !== true) return '';
	if (hook.refusal) return refusedBanner();
	if (hook.registered) return '';
	return hook.configured ? unregisteredBanner() : missingHookUrlBanner();
}

function banner(headline: string, detail: string): string {
	return (
		`<div class="warn-banner" style="margin-top:16px;">` +
		`<strong>${headline}</strong> · ${detail}</div>`
	);
}

function unregisteredBanner(): string {
	return banner(
		'Webhook não registrado no motor',
		'A sessão roda, mas o engine não tem a inscrição do app: nenhuma' +
			' mensagem nova chega ao CRM (nem de contatos novos). Re-registre' +
			' com PUT /api/whatsapp/webhook-config ou reabra a sessão.'
	);
}

function missingHookUrlBanner(): string {
	return banner(
		'Webhook não configurado',
		'Falta WHATSAPP_HOOK_URL no ambiente: a sessão inicia, mas nenhuma' +
			' mensagem chega. Defina o URL do receiver (dev: ' +
			'host.containers.internal:4322) e reabra a sessão.'
	);
}

function refusedBanner(): string {
	return banner(
		'Webhook recusado pelo app',
		'A inscrição está no motor, mas o app recusa toda entrega com 503' +
			' (secret_required): nenhuma mensagem chega e nada é arquivado.' +
			' Defina WAHA_HMAC_SECRET com o mesmo valor no app e no motor' +
			' (mínimo 32 caracteres) e reabra a sessão.'
	);
}

function draftText(root: HTMLElement): string {
	const area = root.querySelector<HTMLTextAreaElement>('#waha-text');
	return area ? area.value : '';
}

function restoreDraft(root: HTMLElement, draft: string): void {
	const area = root.querySelector<HTMLTextAreaElement>('#waha-text');
	if (area && draft) area.value = draft;
}

function loginHint(): string {
	return (
		'<a class="login-hint" style="margin-top:16px;" href="#/equipe">' +
		'Você não está logado. O QR de pareamento já aparece aqui; entre na aba ' +
		'Equipe para também enviar mensagens pelas conversas.</a>'
	);
}

function pageHead(): string {
	const busyAttr = busy ? ' disabled' : '';
	const btn =
		`<button class="btn btn-ghost btn-sm${busyAttr}" id="waha-refresh"` +
		` title="Atualizar">↻ Atualizar</button>`;
	return section(
		'WhatsApp',
		'Conexão do motor WAHA, leitura do QR e envio de mensagens.',
		btn
	);
}

function statusCards(state: WahaSessionState | null | undefined): string {
	if (state === undefined) {
		return consultingCard();
	}
	if (state === null) {
		return refusalCard();
	}
	if (!state.configured) {
		return notConfiguredCard();
	}
	return liveCards(state);
}

// A role refusal is neither a dead motor nor an expired login: re-logging in
// and rotating a password cannot fix it, so it must not borrow that advice.
// Each cause names its own fix, or the operator chases the wrong one.
function refusalCard(): string {
	if (loadFailure === 'unauthenticated') return loginRequiredCard();
	if (loadFailure === 'forbidden') return roleDeniedCard();
	return unreachableCard();
}

function consultingCard(): string {
	const text =
		'<div class="card kpi" style="grid-column:1/-1;">' +
		'<div class="label">Consultando</div><div class="value">…</div></div>';
	return text;
}

function unreachableCard(): string {
	return (
		`<div class="card empty-state" style="grid-column:1/-1;">
			<div class="big">WAHA inacessível</div>
			<p>Não foi possível consultar o motor. Confira a conexão e tente ` +
		'↻ Atualizar.</p></div>'
	);
}

// Rendered when the caller's ROLE may not manage WhatsApp. Distinct from
// `loginRequiredCard` on purpose: the session is valid, so the "log in again"
// / "rotate the password" advice there can never work here.
function roleDeniedCard(): string {
	return (
		`<div class="card empty-state" style="grid-column:1/-1;">
			<div class="big">Acesso restrito</div>
			<p>Seu papel no painel não permite gerenciar o WhatsApp. ` +
		'Peça a um administrador para parear o número.</p></div>'
	);
}

// Rendered when the snapshot could not be READ, not when the motor is down:
// the API refused the caller (expired login, or a seeded password still owing
// its first rotation) while the engine itself stayed healthy the whole time.
function loginRequiredCard(): string {
	return (
		`<div class="card empty-state" style="grid-column:1/-1;">
			<div class="big">Login pendente</div>
			<p>O app recusou a leitura do WhatsApp porque a sessão do painel ` +
		'não está válida. Faça login novamente — ou troque a senha do ' +
		'primeiro acesso — e clique ↻ Atualizar.</p></div>'
	);
}

function notConfiguredCard(): string {	return (
		`<div class="card empty-state" style="grid-column:1/-1;">
			<div class="big">WAHA não configurado</div>
			<p>Defina WAHA_API_BASE_URL e WAHA_API_KEY no Worker ` +
		'para ligar o WhatsApp ao CRM.</p></div>'
	);
}

function liveCards(state: WahaSessionState): string {
	const health = state.health;
	const reachable = health?.reachable ?? false;
	const authenticated = health?.authenticated ?? false;
	const healthy = health?.healthy ?? false;
	const sessionStatus =
		state.session?.status ?? health?.session?.status ?? '';
	const lastCheck = state.session
		? 'última checagem do motor'
		: '';
	const reachHint = state.session ? '' : 'sem resposta do contêiner';
	const authHint = authenticated ? '' : 'X-Api-Key recusada';
	const connHint = healthy ? 'sessão WORKING' : sessionStatus || '';
	const cards = [
		kpiCard('Alcançável', reachable ? 'Sim' : 'Não', reachHint),
		kpiCard('Credenciais', authenticated ? 'OK' : 'Pendente', authHint),
		kpiCard('Conexão', healthy ? 'Conectado' : 'Desconectado', connHint),
		kpiCard('Sessão', sessionStatus || 'DESCONHECIDA', lastCheck)
	];
	return cards.join('');
}

function sessionCard(state: WahaSessionState | null | undefined): string {
	if (!state || !state.configured) return '';
	const session = state.session;
	const working =
		session?.status === 'WORKING' ||
		state.health?.session?.status === 'WORKING';
	const qr = session?.qr && session.qr.length ? session.qr : null;
	const name = escapeText(session?.name ?? 'default');
	const statusLabel = working
		? 'WORKING'
		: escapeText(session?.status ?? 'parada');
	const ch = badge(statusLabel);
	const qrArea = qrAreaFor(qr, working ? 'WORKING' : session?.status);
	return `<div class="card" style="padding:16px 18px;margin-top:16px;">
		<div class="field" style="margin-bottom:12px;">
			<label class="field-label">Sessão ${name} · ${ch}</label>
			${qrArea}
		</div>
		<div class="compose-row">
			${startButton(working ? ' disabled' : '')}
			${stopButton(working ? '' : ' disabled')}
		</div>
	</div>`;
}

function startButton(disabled: string): string {
	return (
		`<button class="btn btn-primary" id="waha-start"${disabled}>` +
		'Iniciar sessão</button>'
	);
}

function stopButton(disabled: string): string {
	return (
		`<button class="btn btn-ghost btn-danger" id="waha-stop"` +
		`${disabled}>Parar sessão</button>`
	);
}

function qrAreaFor(qr: string | null, status: string | undefined): string {
	return qr ? qrHtml(qr) : pairingHint(status);
}

function pairingHint(status: string | undefined): string {
	return `<p style="margin:0;">${pairingText(status)}</p>`;
}

// The hint is derived from the SAME `working` flag that disables "Iniciar
// sessão". It used to read the raw snapshot status and had no WORKING branch,
// so an already-paired session fell through to "press Iniciar sessão" — an
// instruction to click a button that is disabled, for a QR that can never
// arrive because the pairing already succeeded.
function pairingText(status: string | undefined): string {
	if (status === 'WORKING') {
		return 'Sessão pareada e conectada — este pareamento não usa QR.';
	}
	if (status === 'STARTING') {
		return 'Aguardando o QR de pareamento…';
	}
	if (status === 'SCAN_QR_CODE') {
		return 'O QR ainda não chegou — atualize em instantes.';
	}
	if (status === 'FAILED') {
		return 'A sessão falhou ao parear. Reinicie a sessão para tentar de novo.';
	}
	return 'Aperte "Iniciar sessão" para o QR de pareamento aparecer aqui.';
}

function qrHtml(qr: string): string {
	// `src` e' contexto de atributo: aspas nao podem passar. escapeAtrib
	// (textContent->innerHTML) escapa & < > mas NAO " nem ', entao o helper
	// errado aqui permitia fechar o atributo e injetar markup.
	const safe = escapeAtrib(qr);
	const tag = qr.startsWith('data:')
		? `<img src="${safe}" alt="QR do WhatsApp" class="waha-qr">`
		: `<code class="waha-qr-text">${safe.slice(0, 1200)}</code>`;
	return `<div style="margin:8px 0;">${tag}</div>`;
}

function composeCard(ctx: AppContext): string {
	const options = composeTargets(
		ctx.contacts.getAll(),
		ctx.conversations.getAll()
	);
	const select = options.length
		? conversationSelect(options)
		: noConversationHint();
	const areaDisabled = options.length ? '' : 'disabled ';
	const btnDisabled = options.length ? '' : ' disabled';
	const area = compositionArea(areaDisabled);
	const sendBtn = sendButton(btnDisabled);
	return `<div class="card" style="padding:16px 18px;margin-top:16px;">
		<h3 style="margin:0 0 12px;">Enviar mensagem</h3>
		<form id="waha-composer">
			${conversaField(select)}
			<div class="compose-row">
				${area}
				${sendBtn}
			</div>
		</form></div>`;
}

function conversaField(select: string): string {
	return (
		`<div class="field"><label class="field-label">` +
		`Conversa</label>${select}</div>`
	);
}

function conversationSelect(
	options: Array<{ value: string; label: string }>
): string {
	const opts = options.map((o) => optHtml(o)).join('');
	return `<select class="input" id="waha-conversation">${opts}</select>`;
}

function optHtml(o: { value: string; label: string }): string {
	return (
		`<option value="${escapeAtrib(o.value)}">` +
		`${escapeText(o.label)}</option>`
	);
}

function noConversationHint(): string {
	const text =
		'<p style="margin:0;">Nenhum contato com telefone WhatsApp ainda — ' +
		'cadastre um na aba Contatos.</p>';
	return text;
}

function compositionArea(disabled: string): string {
	return (
		'<textarea class="input" id="waha-text" rows="2" ' +
		'placeholder="Mensagem para enviar pelo WhatsApp…" ' +
		`required ${disabled}></textarea>`
	);
}

function sendButton(disabled: string): string {
	return (
		`<button type="submit" class="btn btn-primary compose-send"` +
		`${disabled}>Enviar</button>`
	);
}

function wireEvents(root: HTMLElement, ctx: AppContext): void {
	root.querySelector('#waha-refresh')
		?.addEventListener('click', () => refresh?.());
	root.querySelector('#waha-start')
		?.addEventListener('click', () => handleStart(ctx));
	root.querySelector('#waha-stop')
		?.addEventListener('click', () => handleStop(ctx));
	root.querySelector('#waha-composer')
		?.addEventListener('submit', (event) =>
			void handleCompose(event, ctx, root));
}

async function runBusy(
	task: () => Promise<void>,
	failMsg: string,
	withRefresh: boolean
): Promise<void> {
	busy = true;
	try {
		await task();
	} catch (error) {
		showToast(error instanceof Error ? error.message : failMsg);
	} finally {
		busy = false;
		if (withRefresh) refresh?.();
	}
}

async function handleStart(ctx: AppContext): Promise<void> {
	await runBusy(async () => {
		status = await ctx.whatsapp.start();
		showToast('Sessão iniciada');
	}, 'Falha ao iniciar', true);
}

async function handleStop(ctx: AppContext): Promise<void> {
	await runBusy(async () => {
		await ctx.whatsapp.stop();
		showToast('Sessão parada');
	}, 'Falha ao parar', true);
}

async function handleCompose(
	event: Event,
	ctx: AppContext,
	root: HTMLElement
): Promise<void> {
	event.preventDefault();
	const textarea = qs<HTMLTextAreaElement>('#waha-text', root);
	const select = qs<HTMLSelectElement>('#waha-conversation', root);
	const text = textarea.value.trim();
	if (!text || !select) return;
	await runBusy(async () => {
		const conversation = await ensureConversation(ctx, select.value);
		await ctx.whatsapp.sendText(conversation.id, text);
		showToast('Mensagem enviada');
		textarea.value = '';
	}, 'Falha no envio', false);
}

// The dropdown lists the whole contact book (any phone can be messaged), so a
// contact may have no conversation row yet. Create it lazily — the same call
// the Contatos view uses — then send through the existing row.
async function ensureConversation(
	ctx: AppContext,
	value: string
): Promise<Conversation> {
	const contact = ctx.contacts.getById(value);
	if (contact) {
		const existing = whatsappConversationFor(
			contact.id,
			ctx.conversations.getAll()
		);
		if (existing) return existing;
		return ctx.crm.startConversation(contact.id, 'whatsapp', contact.phone);
	}
	const conversation = ctx.conversations.getById(value);
	if (conversation) return conversation;
	throw new Error('conversation_not_found');
}