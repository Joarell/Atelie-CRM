import type { Database } from './db';
import { recordActionLog, getClientIdFromRequest, TraceAction }
	from './tracing';
import { ACTION_LOGS_TABLE } from './tables';
import { clientIp, type RequestHeaders } from './audit';

export interface UserActionRecord {
	id: string;
	clientId: string;
	userId: string;
	action: string;
	detail: string;
	metadata: Record<string, unknown>;
	ip: string;
	createdAt: string;
}

function logUserAction(
	db: Database,
	request: RequestHeaders,
	userId: string,
	action: string,
	detail: string,
	metadata: Record<string, unknown>
): Promise<void> {
	const clientId = getClientIdFromRequest(request);
	const ip = clientIp(request);
	return recordActionLog(db, {
		id: crypto.randomUUID(),
		clientId,
		userId,
		action,
		detail,
		metadata,
		ip,
		createdAt: new Date().toISOString()
	});
}

function makeGetDetail(successMsg: string, failMsg: string) {
	return (_args: unknown[], result: unknown) =>
		result ? successMsg : failMsg;
}

export class UserActions {
	constructor(private db: Database) {}

	@TraceAction('user.login', {
		getDetail: makeGetDetail('login succeeded', 'login failed'),
		getMetadata: () => ({ success: true }),
		clientIdKey: 'clientId'
	})
	async recordLogin(
		request: RequestHeaders,
		userId: string,
		success: boolean,
		detail = ''
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'login',
			success ? 'User logged in' : 'Login failed: ' + detail,
			{ success });
	}

	@TraceAction('user.logout', {
		getDetail: () => 'User logged out',
		getMetadata: () => ({}),
		clientIdKey: 'clientId'
	})
	async recordLogout(
		request: RequestHeaders,
		userId: string
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'logout',
			'User logged out', {});
	}

	@TraceAction('user.password_change', {
		getDetail: makeGetDetail('Password changed', 'Password change failed'),
		getMetadata: () => ({ success: true }),
		clientIdKey: 'clientId'
	})
	async recordPasswordChange(
		request: RequestHeaders,
		userId: string,
		success: boolean,
		detail = ''
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'password_change',
			success ? 'Password changed successfully'
				: 'Password change failed: ' + detail,
			{ success });
	}

	@TraceAction('order.create', {
		getDetail: makeGetDetail('Order created', 'Order creation failed'),
		getMetadata: (_args: unknown[], result: unknown) =>
			({ orderId: (result as any)?.id }),
		clientIdKey: 'clientId'
	})
	async recordOrderCreate(
		request: RequestHeaders,
		userId: string,
		orderId: string,
		orderTotal: number
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'order_create',
			`Order ${orderId} created with total ${orderTotal}`,
			{ orderId, orderTotal });
	}

	@TraceAction('order.update_status', {
		getDetail: (_args: unknown[]) => `Order status updated to ${_args[2]}`,
		getMetadata: (_args: unknown[]) => ({
			orderId: _args[1],
			newStatus: _args[2]
		}),
		clientIdKey: 'clientId'
	})
	async recordOrderStatusUpdate(
		request: RequestHeaders,
		userId: string,
		orderId: string,
		newStatus: string
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'order_status_update',
			`Order ${orderId} status changed to ${newStatus}`,
			{ orderId, newStatus });
	}

	@TraceAction('contact.create', {
		getDetail: makeGetDetail('Contact created', 'Contact creation failed'),
		getMetadata: (_args: unknown[], result: unknown) =>
			({ contactId: (result as any)?.id }),
		clientIdKey: 'clientId'
	})
	async recordContactCreate(
		request: RequestHeaders,
		userId: string,
		contactId: string,
		contactName: string
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'contact_create',
			`Contact ${contactName} (${contactId}) created`,
			{ contactId, contactName });
	}

	@TraceAction('conversation.message_sent', {
		getDetail: (_args: unknown[]) => `Message sent to conversation ${_args[1]}`,
		getMetadata: (_args: unknown[]) => ({
			conversationId: _args[1],
			messageLength: (_args[2] as string)?.length
		}),
		clientIdKey: 'clientId'
	})
	async recordMessageSent(
		request: RequestHeaders,
		userId: string,
		conversationId: string,
		messageText: string
	): Promise<void> {
		await logUserAction(this.db, request, userId, 'message_sent',
			`Message sent to conversation ${conversationId}`,
			{ conversationId, messageLength: messageText.length });
	}

	async getUserActions(
		clientId: string,
		userId: string,
		limit = 50,
		offset = 0
	): Promise<UserActionRecord[]> {
		const stmt = this.db.prepare(
			`SELECT * FROM ${ACTION_LOGS_TABLE} 
			 WHERE clientId = ? AND userId = ? 
			 ORDER BY createdAt DESC 
			 LIMIT ? OFFSET ?`
		);
		const { results } = await stmt.bind(clientId, userId, limit, offset)
			.all<Record<string, unknown>>();
		return this.mapResults(results ?? []);
	}

	async getClientActions(
		clientId: string,
		limit = 100,
		offset = 0
	): Promise<UserActionRecord[]> {
		const stmt = this.db.prepare(
			`SELECT * FROM ${ACTION_LOGS_TABLE} 
			 WHERE clientId = ? 
			 ORDER BY createdAt DESC 
			 LIMIT ? OFFSET ?`
		);
		const { results } = await stmt.bind(clientId, limit, offset)
			.all<Record<string, unknown>>();
		return this.mapResults(results ?? []);
	}

	async getActionsByType(
		clientId: string,
		action: string,
		limit = 50,
		offset = 0
	): Promise<UserActionRecord[]> {
		const stmt = this.db.prepare(
			`SELECT * FROM ${ACTION_LOGS_TABLE} 
			 WHERE clientId = ? AND action = ? 
			 ORDER BY createdAt DESC 
			 LIMIT ? OFFSET ?`
		);
		const { results } = await stmt.bind(clientId, action, limit, offset)
			.all<Record<string, unknown>>();
		return this.mapResults(results ?? []);
	}

	private mapResults(rows: Record<string, unknown>[]): UserActionRecord[] {
		return rows.map((row) => ({
			...row,
			metadata: typeof row.metadata === 'string'
				? JSON.parse(row.metadata)
				: row.metadata
		})) as UserActionRecord[];
	}
}

export { TraceAction, TraceActionSync } from './tracing';