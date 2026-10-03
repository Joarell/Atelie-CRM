// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderSidebar } from '../../src/ui/Sidebar';
import type { AppContext } from '../../src/state/AppContext';

function makeCtx(): AppContext {
	return {
		auth: { me: () => Promise.resolve({ id: 'u1', name: 'Admin', role: 'admin', mustChangePassword: false }), currentUser: () => ({ id: 'u1', name: 'Admin', role: 'admin' }), token: () => 'test-token', subscribe: (cb: () => void) => { cb(); return () => {}; } },
		users: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		contacts: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		pipelines: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		stages: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		deals: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		tasks: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		quickReplies: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		events: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		conversations: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		messages: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		catalog: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		activities: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		notes: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		tags: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		appointmentTypes: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		ingredients: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		components: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		products: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		customers: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		orders: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		movements: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		purchases: { getAll: () => [], getById: (id: string) => undefined, subscribe: (cb: () => void) => { cb(); return () => {}; } },
		settings: { get: () => ({}), subscribe: (cb: () => void) => { cb(); return () => {}; } },
		pricing: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		stock: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		order: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		customer: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		crm: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		whatsapp: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		cmv: { subscribe: (cb: () => void) => { cb(); return () => {}; } },
		purchasesService: { subscribe: (cb: () => void) => { cb(); return () => {}; } }
	} as unknown as AppContext;
}

describe('Sidebar — item CMV no menu Ateliê', () => {
it('@spec:AC-421 — menu Ateliê tem item CMV', () => {
		const ctx = makeCtx();
		const html = renderSidebar('/atelie/painel', ctx);
		expect(html).toContain('data-nav-toggle="Ateliê"');
		expect(html).toContain('href="#/atelie/cmv"');
		expect(html).toContain('CMV');
	});
});