import type { APIRoute } from 'astro';
import type { Database } from '../../../server/db';
import { getDb } from '../../../server/context';
import { userFromToken } from '../../../server/auth';
import { deleteEntity, listEntities, updateEntity } from '../../../server/crud';
import { json } from '../../../server/http';
import {
	USERS_TABLE, SESSIONS_TABLE, CONTACTS_TABLE, CONVERSATIONS_TABLE,
	MESSAGES_TABLE, DEALS_TABLE, TASKS_TABLE, CONSENT_TABLE
} from '../../../server/tables';
import { recordAudit, newAuditEntry, clientIp } from '../../../server/audit';
import type {
	Contact, Conversation, Deal, Task, Message, User
} from '../../../domain/crm';
import type { Customer, Order } from '../../../domain/types';

async function anonymizeContacts(
	db: Database,
	userContacts: Contact[]
): Promise<void> {
	for (const contact of userContacts) {
		await updateEntity(db, CONTACTS_TABLE, {}, contact.id, {
			name: `Contato Anonimizado #${contact.id.slice(0, 8)}`,
			phone: '',
			email: '',
			notes: '[Dados removidos por solicitação LGPD Art. 18]',
			tags: ['anonymized'],
		} as Partial<Contact>);
	}
}

async function anonymizeConversations(
	db: Database,
	userContacts: Contact[]
): Promise<void> {
	const conversations = await listEntities<Conversation>(
		db, CONVERSATIONS_TABLE, {}
	);
	for (const conv of conversations) {
		if (userContacts.some(c => c.id === conv.contactId)) {
			await updateEntity(db, CONVERSATIONS_TABLE, {}, conv.id, {
				channelPhone: '',
				status: 'closed',
			} as Partial<Conversation>);
		}
	}
}

async function anonymizeMessages(
	db: Database,
	userContacts: Contact[]
): Promise<void> {
	const conversations = await listEntities<Conversation>(
		db, CONVERSATIONS_TABLE, {}
	);
	const userConversationIds = new Set(
		conversations
			.filter(c => userContacts.some(uc => uc.id === c.contactId))
			.map(c => c.id)
	);
	const messages = await listEntities<Message>(db, MESSAGES_TABLE, {});
	for (const msg of messages) {
		if (userConversationIds.has(msg.conversationId)) {
			await updateEntity(db, MESSAGES_TABLE, {}, msg.id, {
				text: '[Anonimizado por solicitação LGPD Art. 18]',
			} as Partial<Message>);
		}
	}
}

async function anonymizeDeals(db: Database, userId: string): Promise<void> {
	const deals = await listEntities<Deal>(db, DEALS_TABLE, {});
	for (const deal of deals) {
		if (deal.assignedUserId === userId) {
			await updateEntity(db, DEALS_TABLE, {}, deal.id, {
				title: '[Anonimizado]',
				lostReason: '[Anonimizado por solicitação LGPD Art. 18]',
			} as Partial<Deal>);
		}
	}
}

async function anonymizeTasks(db: Database, userId: string): Promise<void> {
	const tasks = await listEntities<Task>(db, TASKS_TABLE, {});
	for (const task of tasks) {
		if (task.assigneeUserId === userId) {
			await updateEntity(db, TASKS_TABLE, {}, task.id, {
				title: '[Anonimizado]',
			} as Partial<Task>);
		}
	}
}

async function anonymizeUserRows(
	db: Database,
	user: User,
	userContacts: Contact[]
): Promise<void> {
	// Anonymize contacts (replace PII with placeholders)
	await anonymizeContacts(db, userContacts);

	// Anonymize conversations
	await anonymizeConversations(db, userContacts);

	// Anonymize messages for user's conversations
	await anonymizeMessages(db, userContacts);

	// Anonymize deals
	await anonymizeDeals(db, user.id);

	// Anonymize tasks
	await anonymizeTasks(db, user.id);
}

async function deleteUserData(db: Database, user: User): Promise<void> {
	// Delete user sessions
	await db.prepare('DELETE FROM sessions WHERE userId = ?').bind(user.id).run();

	// Delete user consents
	const sql = 'DELETE FROM consents WHERE subjectId = ? AND subjectType = ?';
	await db.prepare(sql).bind(user.id, 'user').run();

	// Delete user account
	await deleteEntity(db, USERS_TABLE, user.id);
}

export const DELETE: APIRoute = async (context) => {
	const db = getDb();
	const user = await userFromToken(db, context.request);
	if (!user) return json({ error: 'não_autenticado' }, 401);

	const ip = clientIp(context.request);

	// Anonymize contacts (replace PII with placeholders)
	const contacts = await listEntities<Contact>(db, CONTACTS_TABLE, {});
	const userContacts = contacts.filter(c => c.assignedUserId === user.id);
	await anonymizeUserRows(db, user, userContacts);

	// Delete user sessions, consents and account
	await deleteUserData(db, user);

	const entry = newAuditEntry(user.id, 'data_erasure_request', user.email, ip);
	await recordAudit(db, entry);

	return json({
		ok: true,
		message: 'Dados pessoais removidos conforme Art. 18 LGPD',
		anonymizedContacts: userContacts.length,
	});
};
