// --------------------------------------------------------------------
// Inline icon set - "Ateliê Line", an original geometric line-icon set
// drawn for this product. Every glyph shares the same drawing contract:
//   24x24 viewBox, optical center at (12,12), 1.6px stroke, round caps
//   and joins, fill none, color via currentColor (no hard-coded hex).
// Kept as vanilla SVG strings so the framework-free shell needs no icon
// package (tests/dependencies bans React icon libraries). Elements are
// full SVG child nodes so primitives (rect/circle/path) stay readable,
// and every path coordinate is space-separated (no glued signs) so any
// SVG parser can digest them.
// --------------------------------------------------------------------

export type IconName =
	| 'painel' | 'contatos' | 'inbox'
	| 'funil' | 'atividades' | 'tarefas'
	| 'agenda' | 'catalogo' | 'respostas'
	| 'etiquetas' | 'equipe' | 'chat'
	| 'home' | 'ingredientes' | 'componentes'
	| 'produtos' | 'estoque' | 'pedidos'
	| 'clientes' | 'config' | 'sun'
	| 'moon' | 'menu' | 'close'
	| 'logout' | 'plus' | 'minus'
	| 'chevron-down' | 'cmv';

export const PATHS: Record<IconName, ReadonlyArray<string>> = {
	// Vendas ─ CRM
	painel: [
		'<rect x="4.5" y="4.5" width="6" height="6" rx="2"/>',
		'<rect x="13.5" y="4.5" width="6" height="6" rx="2"/>',
		'<rect x="4.5" y="13.5" width="6" height="6" rx="2"/>',
		'<rect x="13.5" y="13.5" width="6" height="6" rx="2"/>',
	],
	contatos: [
		'<circle cx="12" cy="7.6" r="3.5"/>',
		'<path d="M5.1 19.3 c0 -3.6 3.15 -6.1 6.9 -6.1 s6.9 2.5 6.9 6.1"/>',
	],
	inbox: [
		'<path d="M4.3 8.4 h3.2 l1.6 1.8 h5.8 l1.6 -1.8 h3.2 v6' +
			' a2 2 0 0 1 -2 2 H6.3 a2 2 0 0 1 -2 -2 z"/>',
	],
	funil: [
		'<path d="M4.4 5.5 h15.2 l-5.9 6.6 v6.3 l-3.4 1.9 v-8.2' +
			' l-5.9 -6.6 z"/>',
	],
	atividades: [
		'<circle cx="12" cy="12" r="8"/>',
		'<path d="M12 7.7 v4.5 l2.9 1.8"/>',
	],
	tarefas: [
		'<rect x="5" y="5" width="14" height="15.4" rx="3"/>',
		'<path d="M8.9 3.3 h6.2"/>',
		'<path d="M9.3 12.7 l1.8 1.8 3.9 -4.1"/>',
	],
	agenda: [
		'<rect x="4.2" y="5.2" width="15.6" height="14.4" rx="2.6"/>',
		'<path d="M8.3 3.5 v2.9 M15.7 3.5 v2.9"/>',
		'<path d="M4.2 9.7 h15.6"/>',
		'<rect x="10.7" y="12.6" width="2.6" height="2.6" rx="0.9"/>',
	],
	catalogo: [
		'<rect x="3.8" y="6.1" width="16.4" height="13.6" rx="2.8"/>',
		'<path d="M12 9.5 v7 M8.5 13 h7"/>',
	],
	respostas: [
		'<path d="M13.3 3.5 L7 12.8 h4.3 l-0.9 7.7 6.3 -9.5 h-4.3 z"/>',
	],
	etiquetas: [
		'<path d="M12 4.4 l6 6 -6 6 -6 -6 z"/>',
		'<circle cx="9.3" cy="8.6" r="1.3"/>',
	],
	equipe: [
		'<circle cx="7.3" cy="8.7" r="2.9"/>',
		'<path d="M4 19.4 a3.4 3.4 0 0 1 6.6 0"/>',
		'<circle cx="16.3" cy="6.9" r="3.3"/>',
		'<path d="M12.5 19.2 a4 4 0 0 1 7.4 0"/>',
	],
	chat: [
		'<rect x="4.3" y="4.6" width="15.4" height="12.6" rx="4.4"/>',
		'<path d="M7.6 17.2 l-1.8 3 3.9 -1.6 z"/>',
	],
	// Ateliê ─ ERP
	home: [
		'<path d="M12 4.3 L4.6 10.9 v6.5 a1.5 1.5 0 0 0 1.5 1.5 h3.5' +
			' v-4.8 h4.8 v4.8 h3.5 a1.5 1.5 0 0 0 1.5 -1.5 v-6.5 z"/>',
	],
	ingredientes: [
		'<path d="M9.2 4.4 h5.6"/>',
		'<path d="M10.6 4.4 v3.4 L6 17 a2.1 2.1 0 0 0 1.9 3 h8.2' +
			' a2.1 2.1 0 0 0 1.9 -3 L13.4 7.8 V4.4 z"/>',
		'<path d="M7.6 15.4 h8.8"/>',
	],
	componentes: [
		'<rect x="4.6" y="12.1" width="6.9" height="7.3" rx="1.7"/>',
		'<rect x="11.5" y="12.1" width="6.9" height="7.3" rx="1.7"/>',
		'<rect x="7.4" y="4.6" width="8.2" height="7.3" rx="1.7"/>',
	],
	produtos: [
		'<path d="M6.6 8.3 h10.8 l0.8 9.9 a1.5 1.5 0 0 1 -1.5 1.6' +
			' H7.3 a1.5 1.5 0 0 1 -1.5 -1.6 z"/>',
		'<path d="M9.2 8.3 v-0.8 a2.8 2.8 0 0 1 5.6 0 v0.8"/>',
	],
	estoque: [
		'<rect x="4.2" y="10.4" width="15.6" height="7.2" rx="1.7"/>',
		'<rect x="4.2" y="5.9" width="15.6" height="4.5" rx="1.7"/>',
		'<path d="M9.4 8.15 h5.2"/>',
	],
	pedidos: [
		'<path d="M3.4 4.9 h1.9 l2 9.6 h10.4 l2 -6.4 H7.7 z"/>',
		'<circle cx="8.2" cy="18.6" r="1.4"/>',
		'<circle cx="16.4" cy="18.6" r="1.4"/>',
	],
	clientes: [
		'<rect x="4.3" y="4.6" width="15.4" height="14.9" rx="3.2"/>',
		'<circle cx="12" cy="10.1" r="2.7"/>',
		'<path d="M8 16.3 a4.1 4.1 0 0 1 8 0"/>',
	],
	config: [
		'<path d="M4.4 7.2 h9.1"/>',
		'<circle cx="16.3" cy="7.2" r="1.9"/>',
		'<path d="M4.4 12 h3.6"/>',
		'<circle cx="11" cy="12" r="1.9"/>',
		'<path d="M4.4 16.8 h6.8"/>',
		'<circle cx="14.2" cy="16.8" r="1.9"/>',
	],
	// Shell e utilitários
	sun: [
		'<circle cx="12" cy="12" r="3.9"/>',
		'<path d="M12 3.2 v1.9 M12 18.9 v1.9 M3.2 12 h1.9 M18.9 12' +
			' h1.9 M5.7 5.7 l1.3 1.3 M17 17 l1.3 1.3 M18.3 5.7 L17 7' +
			' M7 17 l-1.3 1.3"/>',
	],
	moon: [
		'<path d="M20.2 13.6 A8.6 8.6 0 1 1 10.4 3.8 a6.7 6.7 0 0 0' +
			' 9.8 9.8 z"/>',
	],
	menu: [
		'<path d="M4.4 6.75 h15.2 M4.4 12 h15.2 M4.4 17.25 h15.2"/>',
	],
	close: [
		'<path d="M6.4 6.4 l11.2 11.2 M17.6 6.4 L6.4 17.6"/>',
	],
	logout: [
		'<rect x="4.4" y="5.2" width="9.4" height="13.6" rx="1.8"/>',
		'<path d="M10.4 9.4 l2.6 2.6 -2.6 2.6"/>',
		'<path d="M13 12 h5.6"/>',
	],
	plus: [
		'<path d="M12 4.7 v14.6 M4.7 12 h14.6"/>',
	],
	minus: [
		'<path d="M4.7 12 h14.6"/>',
	],
	'chevron-down': [
		'<path d="M6.4 9.4 l5.6 5.6 5.6 -5.6"/>',
	],
	cmv: [
		'<path d="M12 4.7 v14.6 M4.7 12 h14.6 M12 8 a4 4 0 1 1 0 8 4 4 0 0 1 0 -8"/>',
	],
};

export function icon(name: IconName, cls?: string): string {
	const classes = cls ? 'icon ' + cls : 'icon';
	const body = PATHS[name].join('');
	return [
		`<svg class="${classes}" data-icon="${name}"`,
		'viewBox="0 0 24 24" fill="none"',
		'stroke="currentColor" stroke-width="1.6"',
		'stroke-linecap="round" stroke-linejoin="round"',
		`aria-hidden="true">${body}</svg>`,
	].join(' ');
}