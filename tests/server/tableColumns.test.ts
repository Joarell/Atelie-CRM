import { describe, it, expect } from 'vitest';
import { migrationFiles, schemaFromMigrations } from '../helpers/fakeD1';
import {
  INGREDIENTS_TABLE, INGREDIENTS_SHAPE,
  COMPONENTS_TABLE, COMPONENTS_SHAPE,
  PRODUCTS_TABLE, PRODUCTS_SHAPE,
  CUSTOMERS_TABLE, CUSTOMERS_SHAPE,
  ORDERS_TABLE, ORDERS_SHAPE,
  STOCK_MOVEMENTS_TABLE, STOCK_MOVEMENTS_SHAPE,
  USERS_TABLE, USERS_SHAPE,
  SESSIONS_TABLE, SESSIONS_SHAPE,
  AUTH_AUDIT_TABLE, AUTH_AUDIT_SHAPE,
  CONTACTS_TABLE, CONTACTS_SHAPE,
  PIPELINES_TABLE, PIPELINES_SHAPE,
  STAGES_TABLE, STAGES_SHAPE,
  DEALS_TABLE, DEALS_SHAPE,
  TASKS_TABLE, TASKS_SHAPE,
  QUICK_REPLIES_TABLE, QUICK_REPLIES_SHAPE,
  CALENDAR_EVENTS_TABLE, CALENDAR_EVENTS_SHAPE,
  CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE,
  MESSAGES_TABLE, MESSAGES_SHAPE,
  WAHA_SESSIONS_TABLE, WAHA_SESSIONS_SHAPE,
  WEBHOOK_EVENTS_TABLE, WEBHOOK_EVENTS_SHAPE,
  CATALOG_PRODUCTS_TABLE, CATALOG_PRODUCTS_SHAPE,
  CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE,
  CONVERSATION_NOTES_TABLE, CONVERSATION_NOTES_SHAPE,
  TAGS_TABLE, TAGS_SHAPE,
  APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE,
  ACTION_LOGS_TABLE, ACTION_LOGS_SHAPE,
  CONSENT_TABLE, CONSENT_SHAPE,
  RATE_LIMIT_TABLE, RATE_LIMIT_SHAPE,
} from '../../src/server/tables';

const schema = schemaFromMigrations(migrationFiles());

// Map every shape constant to its table name + allowlist
const shapes: Array<{
  name: string;
  table: string;
  allowlist: string[];
}> = [
  { name: 'INGREDIENTS_SHAPE', table: INGREDIENTS_TABLE, allowlist: INGREDIENTS_SHAPE.columns ?? [] },
  { name: 'COMPONENTS_SHAPE', table: COMPONENTS_TABLE, allowlist: COMPONENTS_SHAPE.columns ?? [] },
  { name: 'PRODUCTS_SHAPE', table: PRODUCTS_TABLE, allowlist: PRODUCTS_SHAPE.columns ?? [] },
  { name: 'CUSTOMERS_SHAPE', table: CUSTOMERS_TABLE, allowlist: CUSTOMERS_SHAPE.columns ?? [] },
  { name: 'ORDERS_SHAPE', table: ORDERS_TABLE, allowlist: ORDERS_SHAPE.columns ?? [] },
  { name: 'STOCK_MOVEMENTS_SHAPE', table: STOCK_MOVEMENTS_TABLE, allowlist: STOCK_MOVEMENTS_SHAPE.columns ?? [] },
  { name: 'USERS_SHAPE', table: USERS_TABLE, allowlist: USERS_SHAPE.columns ?? [] },
  { name: 'SESSIONS_SHAPE', table: SESSIONS_TABLE, allowlist: SESSIONS_SHAPE.columns ?? [] },
  { name: 'AUTH_AUDIT_SHAPE', table: AUTH_AUDIT_TABLE, allowlist: AUTH_AUDIT_SHAPE.columns ?? [] },
  { name: 'CONTACTS_SHAPE', table: CONTACTS_TABLE, allowlist: CONTACTS_SHAPE.columns ?? [] },
  { name: 'PIPELINES_SHAPE', table: PIPELINES_TABLE, allowlist: PIPELINES_SHAPE.columns ?? [] },
  { name: 'STAGES_SHAPE', table: STAGES_TABLE, allowlist: STAGES_SHAPE.columns ?? [] },
  { name: 'DEALS_SHAPE', table: DEALS_TABLE, allowlist: DEALS_SHAPE.columns ?? [] },
  { name: 'TASKS_SHAPE', table: TASKS_TABLE, allowlist: TASKS_SHAPE.columns ?? [] },
  { name: 'QUICK_REPLIES_SHAPE', table: QUICK_REPLIES_TABLE, allowlist: QUICK_REPLIES_SHAPE.columns ?? [] },
  { name: 'CALENDAR_EVENTS_SHAPE', table: CALENDAR_EVENTS_TABLE, allowlist: CALENDAR_EVENTS_SHAPE.columns ?? [] },
  { name: 'CONVERSATIONS_SHAPE', table: CONVERSATIONS_TABLE, allowlist: CONVERSATIONS_SHAPE.columns ?? [] },
  { name: 'MESSAGES_SHAPE', table: MESSAGES_TABLE, allowlist: MESSAGES_SHAPE.columns ?? [] },
  { name: 'WAHA_SESSIONS_SHAPE', table: WAHA_SESSIONS_TABLE, allowlist: WAHA_SESSIONS_SHAPE.columns ?? [] },
  { name: 'WEBHOOK_EVENTS_SHAPE', table: WEBHOOK_EVENTS_TABLE, allowlist: WEBHOOK_EVENTS_SHAPE.columns ?? [] },
  { name: 'CATALOG_PRODUCTS_SHAPE', table: CATALOG_PRODUCTS_TABLE, allowlist: CATALOG_PRODUCTS_SHAPE.columns ?? [] },
  { name: 'CRM_ACTIVITIES_SHAPE', table: CRM_ACTIVITIES_TABLE, allowlist: CRM_ACTIVITIES_SHAPE.columns ?? [] },
  { name: 'CONVERSATION_NOTES_SHAPE', table: CONVERSATION_NOTES_TABLE, allowlist: CONVERSATION_NOTES_SHAPE.columns ?? [] },
  { name: 'TAGS_SHAPE', table: TAGS_TABLE, allowlist: TAGS_SHAPE.columns ?? [] },
  { name: 'APPOINTMENT_TYPES_SHAPE', table: APPOINTMENT_TYPES_TABLE, allowlist: APPOINTMENT_TYPES_SHAPE.columns ?? [] },
  { name: 'ACTION_LOGS_SHAPE', table: ACTION_LOGS_TABLE, allowlist: ACTION_LOGS_SHAPE.columns ?? [] },
  { name: 'CONSENT_SHAPE', table: CONSENT_TABLE, allowlist: CONSENT_SHAPE.columns ?? [] },
  { name: 'RATE_LIMIT_SHAPE', table: RATE_LIMIT_TABLE, allowlist: RATE_LIMIT_SHAPE.columns ?? [] },
];

describe('column allowlists match migrations', () => {
  // @spec:AC-113
  for (const { name, table, allowlist } of shapes) {
    const migrated = schema.get(table);
    if (!migrated) continue; // tables without migration (settings) are skipped
    const migratedCols = [...migrated.columns].sort();
    const allowlistCols = [...allowlist].sort();

    it(`%s: allowlist === migrated columns [@spec:AC-113]`, () => {
      // Exact match both directions: no missing, no extra
      expect(allowlistCols).toEqual(migratedCols);
    });

    // @spec:AC-113 - explicit messages for each direction
    it(`%s: no allowlist column missing from schema`, () => {
      const missing = allowlistCols.filter((c) => !migratedCols.includes(c));
      expect(missing, `allowlist has columns not in schema: ${missing.join(', ')}`).toHaveLength(0);
    });

    it(`%s: no schema column missing from allowlist`, () => {
      const extra = migratedCols.filter((c) => !allowlistCols.includes(c));
      expect(extra, `schema has columns not in allowlist: ${extra.join(', ')}`).toHaveLength(0);
    });
  }
});