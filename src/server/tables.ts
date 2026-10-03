import type { TableShape } from './mapping';
export const INGREDIENTS_TABLE = 'ingredients';
export const INGREDIENTS_SHAPE: TableShape = {
	columns: [
		'id', 'minStock', 'name', 'packagePrice', 'packageSize', 'stock', 'unit'
	],
	numberFields: [
		'minStock', 'packagePrice', 'packageSize', 'stock'
	],
	jsonFields: [],
	boolFields: [],
};
export const COMPONENTS_TABLE = 'components';
export const COMPONENTS_SHAPE: TableShape = {
	columns: [
		'id', 'items', 'name', 'prepTime', 'type', 'yieldDesc'
	],
	numberFields: [
		'prepTime'
	],
	jsonFields: ['items'],
	boolFields: [],
};
export const PRODUCTS_TABLE = 'products';
export const PRODUCTS_SHAPE: TableShape = {
	columns: [
		'category', 'fixedExpenses', 'id', 'items', 'labor', 'markupPercent', 'name',
		'prepTime', 'variablePercent', 'yieldUnits'
	],
	numberFields: [
		'markupPercent', 'prepTime', 'variablePercent', 'yieldUnits'
	],
	jsonFields: ['labor', 'fixedExpenses', 'items'],
	boolFields: [],
};
export const CUSTOMERS_TABLE = 'customers';
export const CUSTOMERS_SHAPE: TableShape = {
	columns: [
		'email', 'id', 'name', 'notes', 'phone'
	],
	jsonFields: [],
	boolFields: [],
};
export const ORDERS_TABLE = 'orders';
export const ORDERS_SHAPE: TableShape = {
	columns: [
		'createdAt', 'createdFrom', 'customerId', 'customerName', 'deliveryDate',
		'id', 'lines', 'notes', 'paymentStatus', 'status', 'stockDeducted'
	],
	jsonFields: ['lines'],
	boolFields: ['stockDeducted'],
};
export const STOCK_MOVEMENTS_TABLE = 'stock_movements';
export const STOCK_MOVEMENTS_SHAPE: TableShape = {
	columns: [
		'date', 'id', 'ingredientId', 'ingredientName', 'note', 'qty', 'type'
	],
	numberFields: [
		'qty'
	],
	jsonFields: [],
	boolFields: [],
};
export const USERS_TABLE = 'users';
export const USERS_SHAPE: TableShape = {
	columns: [
		'createdAt', 'email', 'id', 'mustChangePassword', 'name',
		'passwordHash', 'passwordSalt', 'role'
	],
	jsonFields: [],
	boolFields: [],
};
export const SESSIONS_TABLE = 'sessions';
export const SESSIONS_SHAPE: TableShape = {
	columns: [
		'createdAt', 'expiresAt', 'token', 'userId'
	],
	jsonFields: [],
	boolFields: [],
};
export const AUTH_AUDIT_TABLE = 'auth_audit';
export const AUTH_AUDIT_SHAPE: TableShape = {
	columns: [
		'action', 'createdAt', 'detail', 'id', 'ip', 'userId'
	],
	jsonFields: [],
	boolFields: [],
};
export const CONTACTS_TABLE = 'contacts';
export const CONTACTS_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'createdAt', 'email', 'id', 'name', 'notes', 'phone', 'tags'
	],
	jsonFields: ['tags'],
	boolFields: [],
};
export const PIPELINES_TABLE = 'pipelines';
export const PIPELINES_SHAPE: TableShape = {
	columns: [
		'id', 'isDefault', 'name'
	],
	numberFields: [
		'isDefault'
	],
	jsonFields: [],
	boolFields: [],
};
export const STAGES_TABLE = 'pipeline_stages';
export const STAGES_SHAPE: TableShape = {
	columns: [
		'id', 'name', 'pipelineId', 'position'
	],
	numberFields: [
		'position'
	],
	jsonFields: [],
	boolFields: [],
};
export const DEALS_TABLE = 'deals';
export const DEALS_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'contactId', 'createdAt', 'id', 'lostReason',
		'nextActionAt', 'pipelineId', 'stageId', 'status', 'title', 'valueCents'
	],
	numberFields: [
		'valueCents'
	],
	jsonFields: [],
	boolFields: [],
};
export const TASKS_TABLE = 'tasks';
export const TASKS_SHAPE: TableShape = {
	columns: [
		'assigneeUserId', 'contactId', 'createdAt', 'done', 'dueAt', 'id', 'title'
	],
	jsonFields: [],
	boolFields: ['done'],
};
export const QUICK_REPLIES_TABLE = 'quick_replies';
export const QUICK_REPLIES_SHAPE: TableShape = {
	columns: [
		'body', 'createdAt', 'createdBy', 'id', 'shortcut', 'title'
	],
	jsonFields: [],
	boolFields: [],
};
export const CALENDAR_EVENTS_TABLE = 'calendar_events';
export const CALENDAR_EVENTS_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'contactId', 'createdAt', 'createdBy', 'endsAt',
		'eventType', 'id', 'remindBeforeMin', 'startsAt', 'title'
	],
	numberFields: [
		'remindBeforeMin'
	],
	jsonFields: [],
	boolFields: [],
};
export const CONVERSATIONS_TABLE = 'conversations';
export const CONVERSATIONS_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'channel', 'channelPhone', 'contactId', 'createdAt', 'id',
		'lastMessageAt', 'remoteId', 'snoozedUntil', 'status'
	],
	jsonFields: [],
	boolFields: [],
};
export const MESSAGES_TABLE = 'messages';
export const MESSAGES_SHAPE: TableShape = {
	columns: [
		'ack', 'conversationId', 'createdAt', 'createdBy', 'deliveredAt', 'direction',
		'editedAt', 'externalId', 'fromMe', 'id', 'mediaMime', 'mediaUrl',
		'messageType', 'readAt', 'remoteJid', 'revokedAt', 'text', 'waStatus',
		'waTimestamp'
	],
	jsonFields: [],
	boolFields: ['fromMe'],
};
export const WAHA_SESSIONS_TABLE = 'waha_sessions';
export const WAHA_SESSIONS_SHAPE: TableShape = {
	columns: [
		'lastChangeAt', 'lastCheckAt', 'name', 'status'
	],
	jsonFields: [],
	boolFields: [],
};
export const WEBHOOK_EVENTS_TABLE = 'webhook_events';
export const WEBHOOK_EVENTS_SHAPE: TableShape = {
	columns: [
		'eventType', 'id', 'payload', 'receivedAt', 'session'
	],
	jsonFields: [],
	boolFields: [],
};
export const CATALOG_PRODUCTS_TABLE = 'catalog_products';
export const CATALOG_PRODUCTS_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'ativo', 'createdAt', 'currency', 'description',
		'id', 'name', 'priceCents', 'updatedAt'
	],
	numberFields: [
		'ativo', 'priceCents'
	],
	jsonFields: [],
	boolFields: ['ativo'],
};
export const CRM_ACTIVITIES_TABLE = 'crm_lead_activities';
export const CRM_ACTIVITIES_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'action', 'actorKind', 'actorUserId', 'contactId',
		'createdAt', 'dealId', 'evidence', 'id'
	],
	jsonFields: [],
	boolFields: [],
};
export const CONVERSATION_NOTES_TABLE = 'conversation_notes';
export const CONVERSATION_NOTES_SHAPE: TableShape = {
	columns: [
		'assignedUserId', 'authorUserId', 'body', 'conversationId',
		'createdAt', 'id'
	],
	jsonFields: [],
	boolFields: [],
};
export const TAGS_TABLE = 'tags';
export const TAGS_SHAPE: TableShape = {
	columns: [
		'ativo', 'color', 'createdAt', 'id', 'name'
	],
	jsonFields: [],
	boolFields: ['ativo'],
};
export const APPOINTMENT_TYPES_TABLE = 'appointment_types';
export const APPOINTMENT_TYPES_SHAPE: TableShape = {
	columns: [
		'ativo', 'color', 'createdAt', 'durationMin', 'id', 'name', 'position'
	],
	jsonFields: [],
	boolFields: ['ativo'],
};
export const ACTION_LOGS_TABLE = 'action_logs';
export const ACTION_LOGS_SHAPE: TableShape = {
	columns: [
		'action', 'clientId', 'createdAt', 'detail', 'id', 'metadata', 'userId'
	],
	jsonFields: ['metadata'],
	boolFields: [],
};
export const CONSENT_TABLE = 'consents';
export const CONSENT_SHAPE: TableShape = {
	columns: [
		'contact', 'contract', 'expired', 'expiresAt', 'grantedAt', 'id', 'ip',
		'legal_obligation', 'legitimate_interest', 'metadata', 'public_task',
		'purposes', 'status', 'subjectId', 'subjectType', 'userAgent', 'version',
		'vital_interest', 'withdrawn', 'withdrawnAt'
	],
	jsonFields: [],
	boolFields: [],
};
export const RATE_LIMIT_TABLE = 'rate_limits';
export const RATE_LIMIT_SHAPE: TableShape = {
	columns: [
		'count', 'id', 'metadata', 'resetAt'
	],
	jsonFields: ['metadata'],
	boolFields: [],
};
