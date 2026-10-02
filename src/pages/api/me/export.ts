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

function exportFileName(user: User): string {
	const day = new Date().toISOString().slice(0, 10);
	return `attachment; filename="lgpd-export-${user.id}-${day}.json"`;
}

export const GET: APIRoute = async (context) => {
	const user = await userFromToken(getDb(), context.request);
	if (!user) return json({ error: 'não_autenticado' }, 401);

	const db = getDb();
	const all = await loadLgpdData(db);
	const now = () => new Date().toISOString();

	await recordAudit(db, newAuditEntry(
		user.id,
		'data_portability_request',
		'user_export',
		clientIp(context.request)
	));

	const exportData = buildLgpdPayload(user, all, publicUser(user), now);

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': exportFileName(user),
		},
	});
};