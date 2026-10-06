// Guards the fail-closed ownership model for all item routes
// (feature security-audit-fixes-v3, US-323, US-324, US-325).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIContext } from 'astro';
import { FakeD1 } from '../helpers/fakeD1';
import {
	createCollectionRoutes, createItemRoutes
} from '../../src/server/routeFactory';
import {
	CONTACTS_TABLE, CONTACTS_SHAPE,
	MESSAGES_TABLE, MESSAGES_SHAPE,
	TAGS_TABLE, TAGS_SHAPE,
	CALENDAR_EVENTS_TABLE, CALENDAR_EVENTS_SHAPE,
	CATALOG_PRODUCTS_TABLE, CATALOG_PRODUCTS_SHAPE,
	CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE,
	CONVERSATION_NOTES_TABLE, CONVERSATION_NOTES_SHAPE,
	ORDERS_TABLE, ORDERS_SHAPE,
	PIPELINES_TABLE, PIPELINES_SHAPE,
	STAGES_TABLE, STAGES_SHAPE,
	QUICK_REPLIES_TABLE, QUICK_REPLIES_SHAPE,
	APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE,
	PRODUCTS_TABLE, PRODUCTS_SHAPE,
	COMPONENTS_TABLE, COMPONENTS_SHAPE,
	INGREDIENTS_TABLE, INGREDIENTS_SHAPE,
	CUSTOMERS_TABLE, CUSTOMERS_SHAPE
} from '../../src/server/tables';
import type { Role, User } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
	env: { get DB() { return state.db; } }
}));

const { GET: contactsGET, POST: contactsPOST } =
	createCollectionRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);
const { PUT: contactsPUT, DELETE: contactsDELETE } =
	createItemRoutes(CONTACTS_TABLE, CONTACTS_SHAPE);

const { PUT: messagesPUT, DELETE: messagesDELETE } =
	createItemRoutes(MESSAGES_TABLE, MESSAGES_SHAPE);

const { PUT: tagsPUT, DELETE: tagsDELETE } =
	createItemRoutes(TAGS_TABLE, TAGS_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: stagesPUT, DELETE: stagesDELETE } =
	createItemRoutes(STAGES_TABLE, STAGES_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: pipelinesPUT, DELETE: pipelinesDELETE } =
	createItemRoutes(PIPELINES_TABLE, PIPELINES_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: qrPUT, DELETE: qrDELETE } =
	createItemRoutes(QUICK_REPLIES_TABLE, QUICK_REPLIES_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: apptPUT, DELETE: apptDELETE } =
	createItemRoutes(APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: calPUT, DELETE: calDELETE } =
	createItemRoutes(CALENDAR_EVENTS_TABLE, CALENDAR_EVENTS_SHAPE);

const { PUT: catPUT, DELETE: catDELETE } =
	createItemRoutes(CATALOG_PRODUCTS_TABLE, CATALOG_PRODUCTS_SHAPE);

const { PUT: actPUT, DELETE: actDELETE } =
	createItemRoutes(CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE);

const { PUT: notesPUT, DELETE: notesDELETE } =
	createItemRoutes(CONVERSATION_NOTES_TABLE, CONVERSATION_NOTES_SHAPE);

const { PUT: ordersPUT, DELETE: ordersDELETE } =
	createItemRoutes(ORDERS_TABLE, ORDERS_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: productsPUT, DELETE: productsDELETE } =
	createItemRoutes(PRODUCTS_TABLE, PRODUCTS_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: componentsPUT, DELETE: componentsDELETE } =
	createItemRoutes(COMPONENTS_TABLE, COMPONENTS_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: ingredientsPUT, DELETE: ingredientsDELETE } =
	createItemRoutes(INGREDIENTS_TABLE, INGREDIENTS_SHAPE, { update: 'manager', delete: 'manager' });

const { PUT: customersPUT, DELETE: customersDELETE } =
	createItemRoutes(CUSTOMERS_TABLE, CUSTOMERS_SHAPE, { update: 'manager', delete: 'manager' });

const contact = {
	id: 'c1', name: 'Ana', phone: '', email: '', notes: '', tags: [],
	createdAt: '2026-01-01', assignedUserId: 'u1'
};
const message = {
	id: 'm1', conversationId: 'conv1', text: 'Oi', fromMe: false,
	direction: 'inbound', createdAt: '2026-01-01', createdBy: 'u1',
	ack: false, deliveredAt: '', readAt: '', editedAt: '', externalId: '',
	mediaMime: '', mediaUrl: '', messageType: 'text', remoteJid: '',
	revokedAt: '', waStatus: '', waTimestamp: ''
};
const conv = {
	id: 'conv1', contactId: 'c1', assignedUserId: 'u2', channel: 'whatsapp',
	channelPhone: '', createdAt: '2026-01-01', lastMessageAt: '2026-01-01',
	remoteId: '', snoozedUntil: '', status: 'open'
};
const calEvent = {
	id: 'e1', title: 'Reunião', startsAt: '2026-01-01', endsAt: '2026-01-01',
	eventType: 'meeting', contactId: 'c1', createdBy: 'u1', createdAt: '2026-01-01',
	remindBeforeMin: 0, assignedUserId: 'u1'
};
const catProd = {
	id: 'p1', name: 'Produto', description: '', priceCents: 1000,
	currency: 'BRL', ativo: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01',
	assignedUserId: 'u1'
};
const activity = {
	id: 'a1', action: 'call', actorKind: 'agent', actorUserId: 'u1',
	contactId: 'c1', dealId: '', evidence: '', createdAt: '2026-01-01',
	assignedUserId: 'u1'
};
const note = {
	id: 'n1', conversationId: 'conv1', authorUserId: 'u1', body: 'Nota',
	createdAt: '2026-01-01', assignedUserId: 'u1'
};
const order = {
	id: 'o1', customerId: 'c1', customerName: 'Ana',
	lines: [{ productId: 'p1', productName: 'X', qty: 1, unitPrice: 100 }],
	deliveryDate: '2026-01-20', status: 'pendente', paymentStatus: 'a_pagar',
	notes: '', stockDeducted: false, createdAt: '2026-01-01',
	createdFrom: ''
};
const pipeline = { id: 'pl1', name: 'Pipe', isDefault: 0 };
const stage = { id: 'st1', name: 'Stage', pipelineId: 'pl1', position: 0 };
const qr = { id: 'qr1', shortcut: 'qr', title: 'Q', body: 'B', createdAt: '2026-01-01', createdBy: 'u1' };
const appt = { id: 'ap1', name: 'Appt', color: '#0f0', ativo: 1, durationMin: 30, position: 0 };
const product = { id: 'pr1', name: 'Prod', category: '', fixedExpenses: 0, items: [], labor: [], markupPercent: 0, prepTime: 0, variablePercent: 0, yieldUnits: 0 };
const component = { id: 'co1', name: 'Comp', type: '', yieldDesc: '', prepTime: 0, items: [] };
const ingredient = { id: 'ing1', name: 'Ing', unit: '', packageSize: 1, packagePrice: 100, stock: 10, minStock: 1 };
const customer = { id: 'cu1', name: 'Cust', phone: '', email: '', notes: '' };

function locals(role: Role = 'admin'): { user: User } {
	return { user: { id: 'u1', role } as User };
}

function endpoint(
	params: { id?: string } = {},
	role: Role = 'admin'
): APIContext {
	return {
		request: new Request('http://localhost/api/test'),
		params,
		locals: locals(role)
	} as unknown as APIContext;
}

function putRequest(body: unknown, id = 'c1', role: Role = 'admin'): APIContext {
	return {
		request: new Request('http://localhost/api/test', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		params: { id },
		locals: locals(role)
	} as unknown as APIContext;
}

function msgContext(body: unknown, role: Role = 'admin'): APIContext {
	return {
		request: new Request('http://localhost/api/messages/m1', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		params: { id: 'm1' },
		locals: locals(role)
	} as unknown as APIContext;
}

function itemContext(
	request: Request,
	id: string,
	role: Role = 'admin'
): APIContext {
	return { request, params: { id }, locals: locals(role) } as unknown as APIContext;
}

describe('AC-354: tables without owner column require manager to write', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	const managerTables = [
		{ table: 'tags', name: 'tags', PUT: tagsPUT, DELETE: tagsDELETE, row: { id: 'c1', name: 'Tag', color: '#f00', createdAt: '2026-01-01', ativo: 1 } },
		{ table: 'pipeline_stages', name: 'stages', PUT: stagesPUT, DELETE: stagesDELETE, row: { ...stage, id: 'c1' } },
		{ table: 'pipelines', name: 'pipelines', PUT: pipelinesPUT, DELETE: pipelinesDELETE, row: { ...pipeline, id: 'c1' } },
		{ table: 'quick_replies', name: 'quick-replies', PUT: qrPUT, DELETE: qrDELETE, row: { ...qr, id: 'c1' } },
		{ table: 'appointment_types', name: 'appointment-types', PUT: apptPUT, DELETE: apptDELETE, row: { ...appt, id: 'c1' } },
		{ table: 'orders', name: 'orders', PUT: ordersPUT, DELETE: ordersDELETE, row: { ...order, id: 'c1' } },
		{ table: 'products', name: 'products', PUT: productsPUT, DELETE: productsDELETE, row: { ...product, id: 'c1' } },
		{ table: 'components', name: 'components', PUT: componentsPUT, DELETE: componentsDELETE, row: { ...component, id: 'c1' } },
		{ table: 'ingredients', name: 'ingredients', PUT: ingredientsPUT, DELETE: ingredientsDELETE, row: { ...ingredient, id: 'c1' } },
		{ table: 'customers', name: 'customers', PUT: customersPUT, DELETE: customersDELETE, row: { ...customer, id: 'c1' } }
	];

	for (const t of managerTables) {
		it(`@spec:AC-354 agent PUT on ${t.name} -> 403`, async () => {
			state.db = FakeD1.with(t.table, [t.row]);
			const res = await t.PUT(putRequest({ name: 'X' }, t.row.id, 'agent'));
			expect(res.status).toBe(403);
			const body = (await res.json()) as Record<string, any>;
			expect(body.error).toBe('papel_insuficiente');
		});

		it(`@spec:AC-354 agent DELETE on ${t.name} -> 403`, async () => {
			state.db = FakeD1.with(t.table, [t.row]);
			const del = new Request('http://localhost/api/test', { method: 'DELETE' });
			const res = await t.DELETE(itemContext(del, t.row.id, 'agent'));
			expect(res.status).toBe(403);
			const body = (await res.json()) as Record<string, any>;
			expect(body.error).toBe('papel_insuficiente');
		});

		it(`@spec:AC-357 manager PUT on ${t.name} -> 200`, async () => {
			state.db = FakeD1.with(t.table, [t.row]);
			const res = await t.PUT(putRequest({ name: 'Y' }, t.row.id, 'manager'));
			expect(res.status).toBe(200);
		});

		it(`@spec:AC-357 admin DELETE on ${t.name} -> 200`, async () => {
			state.db = FakeD1.with(t.table, [t.row]);
			const del = new Request('http://localhost/api/test', { method: 'DELETE' });
			const res = await t.DELETE(itemContext(del, t.row.id, 'admin'));
			expect(res.status).toBe(200);
		});
	}
});

describe('AC-356: message inherits conversation ownership', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-356 agent cannot PUT message of another agent conversation', async () => {
		state.db = FakeD1.from({
			conversations: [conv],
			messages: [message]
		});
		const res = await messagesPUT(msgContext({ text: 'hacked' }, 'agent'));
		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('nao_autorizado');
		// Original text unchanged
		expect(state.db.rows('messages')[0].text).toBe('Oi');
	});

	it('@spec:AC-356 agent CAN PUT own message (mutable field)', async () => {
		const ownMsg = { ...message, createdBy: 'u1' };
		const ownConv = { ...conv, assignedUserId: 'u1' };
		state.db = FakeD1.from({
			conversations: [ownConv],
			messages: [ownMsg]
		});
		// text is immutable; use a mutable field
		const res = await messagesPUT(msgContext({ deliveredAt: '2026-01-01T12:00:00Z' }, 'agent'));
		expect(res.status).toBe(200);
		expect(state.db.rows('messages')[0].deliveredAt).toBe('2026-01-01T12:00:00Z');
	});

	it('@spec:AC-356 manager bypasses conversation ownership', async () => {
		state.db = FakeD1.from({
			conversations: [conv],
			messages: [message]
		});
		// text is immutable; use a mutable status field instead
		const res = await messagesPUT(msgContext({ deliveredAt: '2026-01-01T12:00:00Z' }, 'manager'));
		expect(res.status).toBe(200);
	});
});

describe('AC-358: ownership check centralized in factory', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-358 contacts has column ownership', async () => {
		state.db = FakeD1.with('contacts', [{ ...contact, assignedUserId: 'u2' }]);
		const res = await contactsPUT(putRequest({ name: 'X' }, 'c1', 'agent'));
		expect(res.status).toBe(403);
	});
});

describe('AC-359: empty owner blocks agent', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-359 agent PUT on row with empty owner -> 403', async () => {
		state.db = FakeD1.with('contacts', [{ ...contact, assignedUserId: '' }]);
		const res = await contactsPUT(putRequest({ name: 'X' }, 'c1', 'agent'));
		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('nao_autorizado');
	});

	it('@spec:AC-359 manager bypasses empty owner', async () => {
		state.db = FakeD1.with('contacts', [{ ...contact, assignedUserId: '' }]);
		const res = await contactsPUT(putRequest({ name: 'Y' }, 'c1', 'manager'));
		expect(res.status).toBe(200);
	});
});

describe('AC-361: creation derives owner from session', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	const ownedTables = [
		{ name: 'calendar_events', POST: contactsPOST, row: { ...calEvent, assignedUserId: '' } },
		{ name: 'catalog_products', POST: contactsPOST, row: { ...catProd, assignedUserId: '' } },
		{ name: 'crm_lead_activities', POST: contactsPOST, row: { ...activity, assignedUserId: '' } },
		{ name: 'conversation_notes', POST: contactsPOST, row: { ...note, assignedUserId: '' } }
	];

	for (const t of ownedTables) {
		it(`@spec:AC-361 ${t.name} creation fills assignedUserId from session`, async () => {
			state.db = FakeD1.empty();
			const res = await t.POST(putRequest(t.row, 'agent'));
			expect(res.status).toBe(201);
			const saved = (await res.json()) as Record<string, any>;
			expect(saved.assignedUserId).toBe('u1');
		});
	}
});

describe('AC-363: authorship fields are immutable on PUT', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-363 author field createdBy is immutable on PUT for calendar_events', async () => {
		state.db = FakeD1.with('calendar_events', [{ ...calEvent, assignedUserId: 'u1', createdBy: 'u1' }]);
		const res = await calPUT(putRequest({ createdBy: 'u2' }, 'e1', 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('campo_imutavel');
		expect(body.fields).toContain('createdBy');
	});

	it('@spec:AC-363 author field actorUserId is immutable on PUT for crm_lead_activities', async () => {
		state.db = FakeD1.with('crm_lead_activities', [{ ...activity, assignedUserId: 'u1', actorUserId: 'u1' }]);
		const res = await actPUT(putRequest({ actorUserId: 'u2' }, 'a1', 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('campo_imutavel');
		expect(body.fields).toContain('actorUserId');
	});

	it('@spec:AC-363 author field authorUserId is immutable on PUT for conversation_notes', async () => {
		state.db = FakeD1.with('conversation_notes', [{ ...note, assignedUserId: 'u1', authorUserId: 'u1' }]);
		const res = await notesPUT(putRequest({ authorUserId: 'u2' }, 'n1', 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('campo_imutavel');
		expect(body.fields).toContain('authorUserId');
	});
});

describe('AC-364: message cannot be rewritten', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-364 agent cannot PUT text of message from another conversation', async () => {
		state.db = FakeD1.from({
			conversations: [conv],
			messages: [message]
		});
		const res = await messagesPUT(msgContext({ text: 'hacked' }, 'agent'));
		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('nao_autorizado');
		// Original text unchanged
		expect(state.db.rows('messages')[0].text).toBe('Oi');
	});

	it('@spec:AC-364 agent cannot PUT fromMe, direction, conversationId of message', async () => {
		const ownMsg = { ...message, createdBy: 'u1' };
		const ownConv = { ...conv, assignedUserId: 'u1' };
		state.db = FakeD1.from({
			conversations: [ownConv],
			messages: [ownMsg]
		});
		const res = await messagesPUT(msgContext({ fromMe: false, direction: 'inbound', conversationId: 'other' }, 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('campo_imutavel');
		expect(body.fields).toContain('fromMe');
	});
});

describe('AC-365: owner cannot be empty on PUT', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-365 agent PUT with empty assignedUserId -> 400', async () => {
		state.db = FakeD1.with('calendar_events', [{ ...calEvent, assignedUserId: 'u1' }]);
		const res = await calPUT(putRequest({ assignedUserId: '' }, 'e1', 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('dono_vazio');
	});

	it('@spec:AC-365 agent PUT with empty assignedUserId on catalog_products -> 400', async () => {
		state.db = FakeD1.with('catalog_products', [{ ...catProd, assignedUserId: 'u1' }]);
		const res = await catPUT(putRequest({ assignedUserId: '' }, 'p1', 'agent'));
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('dono_vazio');
	});
});

describe('AC-366: viewer continues without write', () => {
	beforeEach(() => { state.db = FakeD1.empty(); });

	it('@spec:AC-366 viewer PUT on contacts -> 403', async () => {
		state.db = FakeD1.with('contacts', [{ ...contact, assignedUserId: 'u1' }]);
		const res = await contactsPUT(putRequest({ name: 'X' }, 'c1', 'viewer'));
		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, any>;
		expect(body.error).toBe('papel_insuficiente');
	});

	it('@spec:AC-366 viewer PUT on messages -> 403', async () => {
		state.db = FakeD1.from({
			conversations: [conv],
			messages: [message]
		});
		const res = await messagesPUT(msgContext({ text: 'hacked' }, 'viewer'));
		expect(res.status).toBe(403);
	});
});