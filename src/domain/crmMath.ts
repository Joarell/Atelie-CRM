// Pure, side-effect-free helpers over the CRM domain types. Everything
// here is deterministic data-in/data-out so the views stay dumb and the
// math is unit-testable without any DOM or repository involved.

import { formatBRL } from './format';
import type {
  Deal, Stage, Task, CalendarEvent, Conversation, Message, Contact, CrmActivity
} from './crm';

export function formatPriceCents(cents: number): string {
  return formatBRL(cents / 100);
}

export function sortedStagesOf(stages: Stage[], pipelineId: string): Stage[] {
  return stages
    .filter((stage) => stage.pipelineId === pipelineId)
    .sort((a, b) => a.position - b.position);
}

export function dealsInStage(deals: Deal[], stageId: string): Deal[] {
  return deals.filter((deal) => isOpenInStage(deal, stageId));
}

function isOpenInStage(deal: Deal, stageId: string): boolean {
  return deal.stageId === stageId && deal.status === 'open';
}

export function stageOpenTotal(deals: Deal[], stageId: string): number {
  const stageDeals = dealsInStage(deals, stageId);
  return stageDeals.reduce((sum, deal) => sum + deal.valueCents, 0);
}

export function pipelineOpenTotal(deals: Deal[], pipelineId: string): number {
  return deals
    .filter((deal) => deal.pipelineId === pipelineId && deal.status === 'open')
    .reduce((sum, deal) => sum + deal.valueCents, 0);
}

export function openDealsForContact(deals: Deal[], contactId: string): Deal[] {
  return deals.filter((deal) => isOpenForContact(deal, contactId));
}

function isOpenForContact(deal: Deal, contactId: string): boolean {
  return deal.contactId === contactId && deal.status === 'open';
}

export function tasksDueBy(tasks: Task[], untilISO: string): Task[] {
  return tasks
    .filter((task) => isTaskDue(task, untilISO))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

function isTaskDue(task: Task, untilISO: string): boolean {
  if (task.done || !task.dueAt) return false;
  return task.dueAt.slice(0, 10) <= untilISO.slice(0, 10);
}

export function upcomingEvents(
  events: CalendarEvent[],
  fromISO: string,
  count = 5
): CalendarEvent[] {
  return events
    .filter((event) => event.startsAt >= fromISO)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, count);
}

export function messagesForConversation(
  messages: Message[],
  conversationId: string
): Message[] {
  return messages
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function openConversations(
  conversations: Conversation[]
): Conversation[] {
  return conversations
    .filter((conversation) => conversation.status === 'open')
    .sort((a, b) => lastTouch(b).localeCompare(lastTouch(a)));
}

function lastTouch(conversation: Conversation): string {
  return conversation.lastMessageAt || conversation.createdAt;
}

// ── Contacts 360: duplicate detection ─────────────────────────────────

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^55(?=\d{10,})/, '');
}

export function contactFingerprint(contact: Contact): string | null {
  const phone = normalizePhoneDigits(contact.phone);
  if (phone.length >= 8) return `p:${phone}`;
  const email = contact.email.trim().toLowerCase();
  if (email) return `e:${email}`;
  return null;
}

export function findPotentialDuplicates(contacts: Contact[]): Contact[][] {
  const byFingerprint = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const fingerprint = contactFingerprint(contact);
    if (!fingerprint) continue;
    const bucket = byFingerprint.get(fingerprint) ?? [];
    bucket.push(contact);
    byFingerprint.set(fingerprint, bucket);
  }
  return [...byFingerprint.values()].filter((bucket) => bucket.length > 1);
}

export function mergeTags(target: string[], source: string[]): string[] {
  return [...new Set([...target, ...source])];
}

// ── Conversation lifecycle: snooze ────────────────────────────────────

export function isSnoozed(
  conversation: Conversation,
  referenceISO: string
): boolean {
  const snoozedUntil = conversation.snoozedUntil;
  return Boolean(snoozedUntil) && snoozedUntil > referenceISO;
}

export function openNotSnoozed(
  conversations: Conversation[],
  referenceISO: string
): Conversation[] {
  const open = openConversations(conversations);
  return open.filter((conversation) => !isSnoozed(conversation, referenceISO));
}

// The dormant queue: open conversations still inside a future snooze window.
// These never appear in the inbox, yet are kept and restored on demand.
export function snoozedConversations(
  conversations: Conversation[],
  referenceISO: string
): Conversation[] {
  return conversations.filter(
    (conversation) =>
      conversation.status === 'open' &&
      isSnoozed(conversation, referenceISO)
  );
}

// ── Activities bus ────────────────────────────────────────────────────

export function sortActivitiesDesc(activities: CrmActivity[]): CrmActivity[] {
  return [...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activitiesForContact(
  activities: CrmActivity[],
  contactId: string
): CrmActivity[] {
  return activities.filter((activity) => activity.contactId === contactId);
}

export function lastActivityAt(
  activities: CrmActivity[],
  dealId: string
): string {
  const match = activities
    .filter((activity) => activity.dealId === dealId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return match[match.length - 1]?.createdAt ?? '';
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to = new Date(toISO).getTime();
  if (isNaN(from) || isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86400000));
}

const ACTIVITY_LABELS: Record<string, string> = {
  'contact.created': 'Contato criado',
  'contact.updated': 'Contato atualizado',
  'contact.merged': 'Contatos mesclados',
  'conversation.started': 'Conversa iniciada',
  'conversation.closed': 'Conversa encerrada',
  'conversation.snoozed': 'Conversa adormecida',
  'conversation.resumed': 'Conversa retomada',
  'message.sent': 'Mensagem enviada',
  'note.added': 'Anotação adicionada',
  'deal.created': 'Negócio criado',
  'deal.updated': 'Negócio atualizado',
  'deal.moved': 'Negócio movido',
  'deal.cloned': 'Negócio duplicado',
  'deal.won': 'Negócio ganho',
  'deal.lost': 'Negócio perdido'
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}