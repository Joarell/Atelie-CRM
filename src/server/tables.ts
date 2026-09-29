import type { TableShape } from './mapping';

export const INGREDIENTS_TABLE = 'ingredients';
export const INGREDIENTS_SHAPE: TableShape = {};

export const COMPONENTS_TABLE = 'components';
export const COMPONENTS_SHAPE: TableShape = { jsonFields: ['items'] };

export const PRODUCTS_TABLE = 'products';
export const PRODUCTS_SHAPE: TableShape = {
  jsonFields: ['labor', 'fixedExpenses', 'items']
};

export const CUSTOMERS_TABLE = 'customers';
export const CUSTOMERS_SHAPE: TableShape = {};

export const ORDERS_TABLE = 'orders';
export const ORDERS_SHAPE: TableShape = {
  jsonFields: ['lines'],
  boolFields: ['stockDeducted']
};

export const STOCK_MOVEMENTS_TABLE = 'stock_movements';
export const STOCK_MOVEMENTS_SHAPE: TableShape = {};

// ── DeskcommCRM (ported) ─────────────────────────────────────────────
// Same Open/Closed seam as above: every CRM entity is a plain table with
// an `id TEXT PRIMARY KEY` plus optional JSON/boolean columns.

export const USERS_TABLE = 'users';
export const USERS_SHAPE: TableShape = {};

export const SESSIONS_TABLE = 'sessions';
export const SESSIONS_SHAPE: TableShape = {};

export const AUTH_AUDIT_TABLE = 'auth_audit';
export const AUTH_AUDIT_SHAPE: TableShape = {};

export const CONTACTS_TABLE = 'contacts';
export const CONTACTS_SHAPE: TableShape = { jsonFields: ['tags'] };

export const PIPELINES_TABLE = 'pipelines';
export const PIPELINES_SHAPE: TableShape = {};

export const STAGES_TABLE = 'pipeline_stages';
export const STAGES_SHAPE: TableShape = {};

export const DEALS_TABLE = 'deals';
export const DEALS_SHAPE: TableShape = {};

export const TASKS_TABLE = 'tasks';
export const TASKS_SHAPE: TableShape = { boolFields: ['done'] };

export const QUICK_REPLIES_TABLE = 'quick_replies';
export const QUICK_REPLIES_SHAPE: TableShape = {};

export const CALENDAR_EVENTS_TABLE = 'calendar_events';
export const CALENDAR_EVENTS_SHAPE: TableShape = {};

export const CONVERSATIONS_TABLE = 'conversations';
export const CONVERSATIONS_SHAPE: TableShape = {};

export const MESSAGES_TABLE = 'messages';
export const MESSAGES_SHAPE: TableShape = { boolFields: ['fromMe'] };

// ── WhatsApp/WAHA engine (0007_waha.sql) ───────────────────────────────

export const WAHA_SESSIONS_TABLE = 'waha_sessions';
export const WAHA_SESSIONS_SHAPE: TableShape = {};

export const WEBHOOK_EVENTS_TABLE = 'webhook_events';
export const WEBHOOK_EVENTS_SHAPE: TableShape = {};

export const CATALOG_PRODUCTS_TABLE = 'catalog_products';
export const CATALOG_PRODUCTS_SHAPE: TableShape = { boolFields: ['ativo'] };

// ── Feature rolls (activities, tags, notes, agenda types) ─────────────

export const CRM_ACTIVITIES_TABLE = 'crm_lead_activities';
export const CRM_ACTIVITIES_SHAPE: TableShape = {};

export const CONVERSATION_NOTES_TABLE = 'conversation_notes';
export const CONVERSATION_NOTES_SHAPE: TableShape = {};

export const TAGS_TABLE = 'tags';
export const TAGS_SHAPE: TableShape = { boolFields: ['ativo'] };

export const APPOINTMENT_TYPES_TABLE = 'appointment_types';
export const APPOINTMENT_TYPES_SHAPE: TableShape = { boolFields: ['ativo'] };

// ── Action Logs (per-client audit trail) ────────────────────────────────

export const ACTION_LOGS_TABLE = 'action_logs';
export const ACTION_LOGS_SHAPE: TableShape = {
  jsonFields: ['metadata'],
  boolFields: []
};

// ── LGPD (consent + rate limit) ─────────────────────────────────────────

export const CONSENT_TABLE = 'consents';
export const CONSENT_SHAPE: TableShape = {};

export const RATE_LIMIT_TABLE = 'rate_limits';
export const RATE_LIMIT_SHAPE: TableShape = {
  jsonFields: ['metadata']
};