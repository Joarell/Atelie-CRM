import type { APIRoute } from 'astro';
import type { Database } from '../../../server/db';
import { getDb } from '../../../server/context';
import { userFromToken, publicUser } from '../../../server/auth';
import { listEntities } from '../../../server/crud';
import { json } from '../../../server/http';
import {
	CONTACTS_TABLE, CONVERSATIONS_TABLE, MESSAGES_TABLE, DEALS_TABLE,
	TASKS_TABLE, CUSTOMERS_TABLE, ORDERS_TABLE, CONSENT_TABLE
} from '../../../server/tables';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';
import type {
	Contact, Conversation, Message, Deal, Task, ConsentRecord, User
} from '../../../domain/crm';
import type { Customer, Order } from '../../../domain/types';

interface LgpdData {
	contacts: Contact[];
	conversations: Conversation[];
	messages: Message[];
	deals: Deal[];
	tasks: Task[];
	customers: Customer[];
	orders: Order[];
	consents: ConsentRecord[];
}

interface UserRows {
	contacts: Contact[];
	conversations: Conversation[];
	deals: Deal[];
	tasks: Task[];
	consents: ConsentRecord[];
}

async function loadLgpdData(db: Database): Promise<LgpdData> {
	return {
		contacts: await listEntities<Contact>(db, CONTACTS_TABLE, {}),
		conversations: await listEntities<Conversation>(
			db, CONVERSATIONS_TABLE, {}
		),
		messages: await listEntities<Message>(db, MESSAGES_TABLE, {}),
		deals: await listEntities<Deal>(db, DEALS_TABLE, {}),
		tasks: await listEntities<Task>(db, TASKS_TABLE, {}),
		customers: await listEntities<Customer>(db, CUSTOMERS_TABLE, {}),
		orders: await listEntities<Order>(db, ORDERS_TABLE, {}),
		consents: await listEntities<ConsentRecord>(db, CONSENT_TABLE, {}),
	};
}

function selectUserRows(user: User, all: LgpdData): UserRows {
	// Filter conversations by the user's contacts
	const userContactIds = new Set(
		all.contacts.filter(c => c.assignedUserId === user.id).map(c => c.id)
	);
	return {
		contacts: all.contacts.filter(c => c.assignedUserId === user.id),
		conversations: all.conversations.filter(
			c => userContactIds.has(c.contactId)
		),
		deals: all.deals.filter(d => d.assignedUserId === user.id),
		tasks: all.tasks.filter(t => t.assigneeUserId === user.id),
		consents: all.consents.filter(
			c => c.subjectId === user.id && c.subjectType === 'user'
		),
	};
}

function buildDataAccess(user: User, all: LgpdData) {
	const mine = selectUserRows(user, all);
	return {
		profile: publicUser(user),
		contacts: mine.contacts,
		conversations: mine.conversations,
		messages: all.messages,
		deals: mine.deals,
		tasks: mine.tasks,
		customers: all.customers,
		orders: all.orders,
		consents: mine.consents,
		exportedAt: new Date().toISOString(),
		formatVersion: '1.0',
	};
}

export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'não_autenticado' }, 401);

	const db = getDb();
	const all = await loadLgpdData(db);

	await recordAudit(db, newAuditEntry(
		user.id, 'data_access_request', 'user_profile', clientIp(context.request)
	));

	return json(buildDataAccess(user, all));
};
