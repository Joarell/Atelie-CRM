import type { AppContext } from '../state/AppContext';
import { escapeText } from '../domain/format';
import { icon, type IconName } from './icons';

export interface NavEntry {
	path: string;
	label: string;
	icon: IconName; // Heroicons v2 outline glyph (src/ui/icons.ts)
}

export interface NavGroup {
	label: string;
	entries: NavEntry[];
}

// Minimal storage surface, so tests can pass a memory map instead of
// touching window.localStorage (same pattern as src/ui/theme.ts).
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export const NAV_STORAGE_KEY = 'deskcomm-nav-open';

export const CRM_GROUP: NavGroup = {
	label: 'Vendas',
	entries: [
		{ path: '/', label: 'Painel', icon: 'painel' },
		{ path: '/contatos', label: 'Contatos', icon: 'contatos' },
		{ path: '/inbox', label: 'Inbox', icon: 'inbox' },
		{ path: '/funil', label: 'Funil', icon: 'funil' },
		{ path: '/atividades', label: 'Atividades', icon: 'atividades' },
		{ path: '/tarefas', label: 'Tarefas', icon: 'tarefas' },
		{ path: '/agenda', label: 'Agenda', icon: 'agenda' },
		{ path: '/catalogo', label: 'Catálogo', icon: 'catalogo' },
		{ path: '/respostas', label: 'Respostas', icon: 'respostas' },
		{ path: '/etiquetas', label: 'Etiquetas', icon: 'etiquetas' },
		{ path: '/equipe', label: 'Equipe', icon: 'equipe' },
		{ path: '/whatsapp', label: 'WhatsApp', icon: 'chat' }
	]
};

export const ATELIE_GROUP: NavGroup = {
	label: 'Ateliê',
	entries: [
		{ path: '/atelie/painel', label: 'Painel', icon: 'home' },
		{
			path: '/atelie/ingredientes', label: 'Ingredientes',
			icon: 'ingredientes'
		},
		{ path: '/atelie/components', label: 'Componentes', icon: 'componentes' },
		{ path: '/atelie/produtos', label: 'Produtos', icon: 'produtos' },
		{ path: '/atelie/estoque', label: 'Estoque', icon: 'estoque' },
		{ path: '/atelie/pedidos', label: 'Pedidos', icon: 'pedidos' },
		{ path: '/atelie/clientes', label: 'Clientes', icon: 'clientes' },
		{ path: '/atelie/cmv', label: 'CMV', icon: 'cmv' },
		{ path: '/atelie/configuracoes', label: 'Configurações', icon: 'config' }
	]
};

export const NAV_GROUPS: NavGroup[] = [CRM_GROUP, ATELIE_GROUP];

// Flat list kept for title lookup; the sidebar itself renders grouped.
export const NAV_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap(
	(group) => group.entries
);

// Which group menus are currently open. `null` means "no saved choice":
// render everything expanded (first load / corrupt value / storage error).
export function readOpenGroups(storage: StorageLike): string[] | null {
	let raw: string | null;
	try {
		raw = storage.getItem(NAV_STORAGE_KEY);
	} catch {
		return null;
	}
	if (raw === null) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		return parsed.filter((item): item is string => typeof item === 'string');
	} catch {
		return null;
	}
}

// Toggles a group's membership in the open list, persists the result, and
// returns it. Persistence errors do not stop the in-session toggle.
export function toggleGroup(label: string, storage: StorageLike): string[] {
	const open = readOpenGroups(storage) ?? [];
	const next = open.includes(label)
		? open.filter((item) => item !== label)
		: [...open, label];
	try {
		storage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// state stays toggled for this session
	}
	return next;
}

export function renderSidebar(
	activePath: string,
	ctx?: AppContext,
	storage?: StorageLike
): string {
	const open = storage ? readOpenGroups(storage) : null;
	const groups = NAV_GROUPS.map((group) =>
		renderNavGroup(group, activePath, open)
	).join('');
	return `
		<div class="sidebar-brand">
			<div class="mark">DeskcommCRM</div>
			<div class="sub">Vendas · Equipe · Ateliê</div>
		</div>
		${groups}
		<div class="sidebar-foot">${footHtml(ctx)}</div>`;
}

// Delegated click binding for the group toggles. `onChange` receives the
// new open-group list so the caller can re-render the sidebar from storage.
export function bindNavToggles(
	root: Element,
	storage: StorageLike,
	onChange: (openGroups: string[]) => void = () => {}
): void {
	root.addEventListener('click', (event) => {
		const target = (event.target as HTMLElement | null)
			?.closest?.('[data-nav-toggle]');
		if (!target) return;
		const label = target.getAttribute('data-nav-toggle');
		if (label) onChange(toggleGroup(label, storage));
	});
}

function renderNavGroup(
	group: NavGroup,
	activePath: string,
	open: string[] | null
): string {
	const isOpen = open === null || open.includes(group.label);
	const listId = 'nav-list-' + groupSlug(group.label);
	const toggle = navToggleHtml(group.label, isOpen, listId);
	const items = group.entries
		.map((entry) => renderNavItem(entry, activePath))
		.join('');
	return '\n    <div class="nav-group">' + toggle +
		`<ul class="nav-list" id="${listId}">` + items + '</ul></div>';
}

function navToggleHtml(
	label: string,
	isOpen: boolean,
	listId: string
): string {
	const expanded = isOpen ? 'true' : 'false';
	return '<button class="nav-group-toggle" type="button"' +
		' data-nav-toggle="' + label + '" aria-expanded="' + expanded + '"' +
		' aria-controls="' + listId + '"><span>' + label + '</span>' +
		'<span class="nav-chevron" aria-hidden="true">' +
		icon('chevron-down') + '</span></button>';
}

function groupSlug(label: string): string {
	const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	return slug || 'grupo';
}

function footHtml(ctx?: AppContext): string {
	if (!ctx) return `<span class="sync-dot off"></span>Dados em Cloudflare D1`;
	const user = ctx.auth.currentUser();
	if (!user) {
		return `<a class="nav-foot-link" href="#/login"` +
			` data-foot-login>Entrar</a>`;
	}
	const initial = escapeText((user.name[0] ?? '?').toUpperCase());
	const name = escapeText(user.name);
	const email = escapeText(user.email);
	return (
		'<div class="foot-user"><span class="foot-avatar">' + initial +
		'</span>\n    <div class="foot-user-meta"><strong>' + name +
		'</strong><span class="soft">' + email + '</span></div>\n    ' +
		'<button class="btn btn-ghost btn-icon" data-foot-logout ' +
		'title="Sair" aria-label="Sair">' + icon('logout') + '</button></div>'
	);
}

function renderNavItem(entry: NavEntry, activePath: string): string {
	const activeClass = entry.path === activePath ? ' active' : '';
	return `<li><a class="nav-item${activeClass}" href="#${entry.path}">
		<span aria-hidden="true">${icon(entry.icon)}</span>${entry.label}</a></li>`;
}