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

import {
	buildLgpdPayload,
	type LgpdData
} from '../../../domain/lgpdScope';

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
		consents: await listEntities<ConsentRecord>(db, CONSENT_TABLE, {})
	};
}

export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'não_autenticado' }, 401);

	const db = getDb();
	const all = await loadLgpdData(db);
	const now = () => new Date().toISOString();

	await recordAudit(db, newAuditEntry(
		user.id, 'data_access_request', 'user_profile', clientIp(context.request)
	));

	return json(buildLgpdPayload(user, all, publicUser(user), now));
};
