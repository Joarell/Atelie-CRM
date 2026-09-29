// CRM domain — entities migrated from the DeskcommCRM reference app
// (single-tenant: there is no organization_id; a lightweight login/session
// model stores team + access roles). Money is stored in integer cents.

export type Role = 'viewer' | 'agent' | 'manager' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  // Optional: absent on rows created before 0019 (they use the seed salt).
  passwordSalt?: string;
  role: Role;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  assignedUserId: string;
  createdAt: string;
}

export const CONTACT_FIELDS: Record<keyof Contact, true> = {
  id: true, name: true, phone: true, email: true, notes: true, tags: true,
  assignedUserId: true, createdAt: true
};

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
}

export type DealStatus = 'open' | 'won' | 'lost';

export interface Deal {
  id: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  title: string;
  valueCents: number;
  status: DealStatus;
  lostReason: string;
  nextActionAt: string;
  assignedUserId: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  dueAt: string;
  assigneeUserId: string;
  contactId: string;
  createdAt: string;
}

export interface QuickReply {
  id: string;
  title: string;
  body: string;
  shortcut: string;
  createdBy: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  contactId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  eventType: string;
  remindBeforeMin: number;
  createdBy: string;
  createdAt: string;
}

export type MessageDirection = 'inbound' | 'outbound';

// Delivery states kept in sync with the WAHA webhook (`waStatus`).
export type WahaMessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  createdBy: string;
  createdAt: string;
  // WhatsApp/WAHA columns (0007_waha.sql). Optional so CRM-only rows created
  // before the webhook layer keep working unmodified.
  externalId?: string;
  ack?: number;
  waStatus?: WahaMessageStatus;
  messageType?: string;
  mediaUrl?: string;
  mediaMime?: string;
  remoteJid?: string;
  fromMe?: boolean;
  waTimestamp?: number;
  editedAt?: string;
  revokedAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

export type ConversationStatus = 'open' | 'closed';

export interface Conversation {
  id: string;
  contactId: string;
  channel: string;
  channelPhone: string;
  lastMessageAt: string;
  assignedUserId: string;
  status: ConversationStatus;
  snoozedUntil: string;
  createdAt: string;
  // WAHA identity of the peer chat (e.g. `5511999999999@c.us`), used to dedup
  // the conversation across webhooks and to reconstruct the send target.
  remoteId?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  agent: 1,
  manager: 2,
  admin: 3
};

// ── Ported feature rolls (activities bus, tags, notes, agenda types) ──

export type ActivityActorKind = 'user' | 'system' | 'rule';

export interface CrmActivity {
  id: string;
  contactId: string;
  dealId: string;
  actorKind: ActivityActorKind;
  actorUserId: string;
  action: string;
  evidence: string;
  createdAt: string;
}

export interface ConversationNote {
  id: string;
  conversationId: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  ativo: boolean;
  createdAt: string;
}

export interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
  color: string;
  ativo: boolean;
  position: number;
  createdAt: string;
}

// Activity bus vocabulary — writes go through CrmService.recordActivity so
// the "who did what when" history stays uniform across the views.
export const ACTIVITY = {
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_MERGED: 'contact.merged',
  CONVERSATION_STARTED: 'conversation.started',
  CONVERSATION_CLOSED: 'conversation.closed',
  CONVERSATION_SNOOZED: 'conversation.snoozed',
  CONVERSATION_RESUMED: 'conversation.resumed',
  MESSAGE_SENT: 'message.sent',
  NOTE_ADDED: 'note.added',
  NOTE_UPDATED: 'note.updated',
  NOTE_DELETED: 'note.deleted',
  DEAL_CREATED: 'deal.created',
  DEAL_UPDATED: 'deal.updated',
  DEAL_MOVED: 'deal.moved',
  DEAL_CLONED: 'deal.cloned',
  DEAL_WON: 'deal.won',
  DEAL_LOST: 'deal.lost'
} as const;

// LGPD consent record — one row per grant, with full audit trail.
export type ConsentStatus = 'granted' | 'withdrawn' | 'expired';

export type LawfulBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'legitimate_interest'
  | 'vital_interest'
  | 'public_task';

export interface ConsentRecord {
  id: string;
  subjectId: string;
  subjectType: 'user' | 'contact';
  purposes: string[];
  lawfulBasis: LawfulBasis;
  status: ConsentStatus;
  grantedAt: string;
  withdrawnAt?: string;
  expiresAt?: string;
  ip?: string;
  userAgent?: string;
  version: string;
  metadata: Record<string, unknown>;
}