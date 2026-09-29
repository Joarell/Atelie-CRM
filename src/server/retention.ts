import type { Database } from './db';
import { listEntities, updateEntity, deleteEntity } from './crud';
import {
  CONTACTS_TABLE, CONVERSATIONS_TABLE, MESSAGES_TABLE,
  CUSTOMERS_TABLE, ORDERS_TABLE, WEBHOOK_EVENTS_TABLE,
  AUTH_AUDIT_TABLE, ACTION_LOGS_TABLE, CONSENT_TABLE
} from './tables';
import { nowISO } from '../domain/format';
import type { Contact, Conversation, Message, Deal, Task } from '../domain/crm';
import type { Customer, Order } from '../domain/types';

export interface RetentionDays {
  messages: number;
  conversations: number;
  webhookEvents: number;
  authAudit: number;
  actionLogs: number;
  consents: number;
  orders: number;
  customers: number;
}

// The windows come from the Worker env, not `process.env`: this app runs on
// workerd, where `process.env` is not the binding source, so the old lookup
// silently ignored every configured value and always fell back to the
// defaults.
const RETENTION_DEFAULTS: RetentionDays = {
  messages: 365,
  conversations: 730,
  webhookEvents: 90,
  authAudit: 365,
  actionLogs: 365,
  consents: 2555,
  orders: 2555,
  customers: 2555
};

const RETENTION_VARS: Record<keyof RetentionDays, string> = {
  messages: 'RETENTION_MESSAGES_DAYS',
  conversations: 'RETENTION_CONVERSATIONS_DAYS',
  webhookEvents: 'RETENTION_WEBHOOK_EVENTS_DAYS',
  authAudit: 'RETENTION_AUTH_AUDIT_DAYS',
  actionLogs: 'RETENTION_ACTION_LOGS_DAYS',
  consents: 'RETENTION_CONSENTS_DAYS',
  orders: 'RETENTION_ORDERS_DAYS',
  customers: 'RETENTION_CUSTOMERS_DAYS'
};

/** A window must be a positive whole number of days, else the default wins. */
function positiveDays(raw: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function readRetentionDays(source: unknown): RetentionDays {
  const record = source as Record<string, unknown> | null | undefined;
  const days = { ...RETENTION_DEFAULTS };
  const pairs = Object.entries(RETENTION_VARS) as Array<
    [keyof RetentionDays, string]
  >;
  for (const [key, name] of pairs) {
    days[key] = positiveDays(record?.[name], RETENTION_DEFAULTS[key]);
  }
  return days;
}

export interface RetentionReport {
  runAt: string;
  anonymized: number;
  deleted: number;
  errors: string[];
}

function cutoffFor(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function applyRetentionPolicies(
  db: Database,
  days: RetentionDays = RETENTION_DEFAULTS
): Promise<RetentionReport> {
  const report: RetentionReport = {
    runAt: nowISO(),
    anonymized: 0,
    deleted: 0,
    errors: [],
  };

  try {
    report.anonymized += await anonymizeOldMessages(db, days);
    report.anonymized += await anonymizeOldConversations(db, days);
    report.deleted += await deleteOldWebhookEvents(db, days);
    report.deleted += await deleteOldAuditLogs(db, days);
    report.deleted += await deleteOldActionLogs(db, days);
    report.deleted += await deleteExpiredConsents(db, days);
  } catch (error) {
    report.errors.push(String(error));
  }

  return report;
}

async function anonymizeOldMessages(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.messages);
  const sql =
    `SELECT id FROM messages WHERE createdAt < ? ` +
    `AND text NOT LIKE '[Anonimizado%'`;
  const messages = await db
    .prepare(sql)
    .bind(cutoff)
    .all() as { results: Array<{ id: string }> };

  let count = 0;
  for (const msg of messages.results ?? []) {
    await updateEntity(db, MESSAGES_TABLE, {}, msg.id, {
      text: '[Anonimizado por política de retenção]',
      mediaUrl: '',
      mediaMime: '',
    } as Partial<Message>);
    count++;
  }
  return count;
}

async function anonymizeOldConversations(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.conversations);
  const sql =
    `SELECT id FROM conversations WHERE createdAt < ? ` +
    `AND channelPhone != '' ` +
    // Without this the row is reprocessed on every run, because the marker
    // itself is a non-empty phone value.
    `AND channelPhone NOT LIKE '[Anonimizado%'`;
  const conversations = await db
    .prepare(sql)
    .bind(cutoff)
    .all() as { results: Array<{ id: string }> };

  let count = 0;
  for (const conv of conversations.results ?? []) {
    await updateEntity(db, CONVERSATIONS_TABLE, {}, conv.id, {
      channelPhone: '[Anonimizado]',
    } as Partial<Conversation>);
    count++;
  }
  return count;
}

async function deleteOldWebhookEvents(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.webhookEvents);
  const result = await db
    .prepare(`DELETE FROM ${WEBHOOK_EVENTS_TABLE} WHERE receivedAt < ?`)
    .bind(cutoff)
    .run() as { meta: { changes: number } };
  return result.meta.changes ?? 0;
}

async function deleteOldAuditLogs(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.authAudit);
  const result = await db
    .prepare(`DELETE FROM ${AUTH_AUDIT_TABLE} WHERE createdAt < ?`)
    .bind(cutoff)
    .run() as { meta: { changes: number } };
  return result.meta.changes ?? 0;
}

async function deleteOldActionLogs(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.actionLogs);
  const result = await db
    .prepare(`DELETE FROM ${ACTION_LOGS_TABLE} WHERE createdAt < ?`)
    .bind(cutoff)
    .run() as { meta: { changes: number } };
  return result.meta.changes ?? 0;
}

async function deleteExpiredConsents(
  db: Database, days: RetentionDays
): Promise<number> {
  const cutoff = cutoffFor(days.consents);
  const sql =
    `DELETE FROM ${CONSENT_TABLE} WHERE grantedAt < ? ` +
    `AND status != 'granted'`;
  const result = await db
    .prepare(sql)
    .bind(cutoff)
    .run() as { meta: { changes: number } };
  return result.meta.changes ?? 0;
}