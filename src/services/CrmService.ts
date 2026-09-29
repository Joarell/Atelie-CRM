import type { IRepository } from '../repositories/IRepository';
import type {
  Contact, Pipeline, Stage, Deal, Task, QuickReply, CalendarEvent,
  Conversation, Message, CatalogProduct, CrmActivity, ConversationNote,
  AppointmentType, Tag
} from '../domain/crm';
import { ACTIVITY } from '../domain/crm';
import { uid, nowISO, todayISO } from '../domain/format';
import { wahaE164Phone } from '../domain/wahaWebhook';
import {
  openNotSnoozed,
  snoozedConversations,
  messagesForConversation,
  tasksDueBy,
  upcomingEvents as upcomingEventsOf,
  sortActivitiesDesc,
  lastActivityAt,
  daysBetweenISO,
  mergeTags
} from '../domain/crmMath';

export interface CrmRepositories {
  contacts: IRepository<Contact>;
  pipelines: IRepository<Pipeline>;
  stages: IRepository<Stage>;
  deals: IRepository<Deal>;
  tasks: IRepository<Task>;
  quickReplies: IRepository<QuickReply>;
  events: IRepository<CalendarEvent>;
  conversations: IRepository<Conversation>;
  messages: IRepository<Message>;
  catalog: IRepository<CatalogProduct>;
  activities: IRepository<CrmActivity>;
  notes: IRepository<ConversationNote>;
  appointmentTypes: IRepository<AppointmentType>;
  tags: IRepository<Tag>;
}

export interface InboxItem {
  conversation: Conversation;
  contact: Contact | undefined;
  lastMessage: Message | undefined;
}

export interface RiskItem {
  deal: Deal;
  contact: Contact | undefined;
  daysSinceLastAction: number;
}

type ActivityInput = {
  contactId: string;
  dealId: string;
  action: string;
  evidence: string;
  actorUserId: string;
};

function isOverdue(deal: Deal, reference: string): boolean {
  return Boolean(deal.nextActionAt) && deal.nextActionAt <= reference;
}

// Repoints every row owned by the absorbed contact, returning the
// actual update promises so the caller can await them.
function repoint<T extends { id: string; contactId: string }>(
  repo: IRepository<T>,
  removeId: string,
  keepId: string
): Array<Promise<T | undefined>> {
  const patch = { contactId: keepId } as Partial<T>;
  return repo
    .getAll()
    .filter((item) => item.contactId === removeId)
    .map((item) => repo.update(item.id, patch));
}

// Orchestrates the CRM collections (all cached in-memory repositories)
// for the views: pipeline board, inbox/thread, tasks, agenda. Every write
// flows through here so the values stay consistent across collections and
// the activities bus gets a uniform "who did what when" record.
export class CrmService {
  constructor(private readonly repos: CrmRepositories) {}

  defaultPipeline(): Pipeline | undefined {
    const { pipelines } = this.repos;
    return pipelines.getAll().find((p) => p.isDefault) ?? pipelines.getAll()[0];
  }

  pipelineStages(pipelineId: string): Stage[] {
    return this.repos.stages
      .getAll()
      .filter((stage) => stage.pipelineId === pipelineId)
      .sort((a, b) => a.position - b.position);
  }

  dealsInStage(stageId: string): Deal[] {
    return this.repos.deals
      .getAll()
      .filter((deal) => deal.stageId === stageId && deal.status === 'open');
  }

  stageTotal(stageId: string): number {
    const total = this.dealsInStage(stageId);
    return total.reduce((sum, deal) => sum + deal.valueCents, 0);
  }

  pipelineOpenTotal(pipelineId: string): number {
    const open = this.repos.deals
      .getAll()
      .filter((d) => d.pipelineId === pipelineId && d.status === 'open');
    return open.reduce((sum, deal) => sum + deal.valueCents, 0);
  }

  inbox(): InboxItem[] {
    const { conversations, contacts, messages } = this.repos;
    const open = openNotSnoozed(conversations.getAll(), nowISO());
    return open.map((conversation) => {
      const thread = messagesForConversation(
        messages.getAll(), conversation.id
      );
      return {
        conversation,
        contact: contacts.getById(conversation.contactId),
        lastMessage: thread[thread.length - 1]
      };
    });
  }

  openInboxCount(): number {
    return openNotSnoozed(
      this.repos.conversations.getAll(), nowISO()
    ).length;
  }

  // The opposite of the inbox feed: only the conversations parked by a
  // future snooze window, soonest to expire first, offer "restaurar".
  dormantInbox(): InboxItem[] {
    const { conversations, contacts, messages } = this.repos;
    return snoozedConversations(
      conversations.getAll(), nowISO()
    )
      .sort((a, b) => a.snoozedUntil.localeCompare(b.snoozedUntil))
      .map((conversation) => {
        const thread = messagesForConversation(
          messages.getAll(), conversation.id
        );
        return {
          conversation,
          contact: contacts.getById(conversation.contactId),
          lastMessage: thread[thread.length - 1]
        };
      });
  }

  thread(conversationId: string): Message[] {
    return messagesForConversation(
      this.repos.messages.getAll(), conversationId
    );
  }

  notesForConversation(conversationId: string): ConversationNote[] {
    return this.repos.notes
      .getAll()
      .filter((note) => note.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addNote(
    conversationId: string, body: string, userId: string
  ): Promise<ConversationNote> {
    const note: ConversationNote = {
      id: uid(),
      conversationId,
      body: body.trim(),
      authorUserId: userId,
      createdAt: nowISO()
    };
    const saved = await this.repos.notes.add(note);
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.NOTE_ADDED,
      evidence: body.trim().slice(0, 80), actorUserId: userId
    });
    return saved;
  }

  async updateNote(
    noteId: string, body: string, userId: string
  ): Promise<void> {
    const clean = body.trim();
    if (!clean) return;
    await this.repos.notes.update(noteId, { body: clean });
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.NOTE_UPDATED,
      evidence: clean.slice(0, 80), actorUserId: userId
    });
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const note = this.repos.notes.getById(noteId);
    await this.repos.notes.remove(noteId);
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.NOTE_DELETED,
      evidence: (note?.body ?? '').slice(0, 80), actorUserId: userId
    });
  }

  async snoozeConversation(
    conversationId: string, untilISO: string
  ): Promise<void> {
    await this.repos.conversations.update(
      conversationId, { snoozedUntil: untilISO }
    );
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.CONVERSATION_SNOOZED,
      evidence: untilISO, actorUserId: ''
    });
  }

  async resumeConversation(conversationId: string): Promise<void> {
    await this.repos.conversations.update(
      conversationId, { snoozedUntil: '', status: 'open' }
    );
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.CONVERSATION_RESUMED,
      evidence: '', actorUserId: ''
    });
  }

  async sendMessage(
    conversationId: string, text: string, userId: string
  ): Promise<Message> {
    const message: Message = {
      id: uid(),
      conversationId,
      direction: 'outbound',
      text,
      createdBy: userId,
      createdAt: nowISO()
    };
    const saved = await this.repos.messages.add(message);
    await this.repos.conversations.update(
      conversationId, { lastMessageAt: saved.createdAt }
    );
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.MESSAGE_SENT,
      evidence: text.slice(0, 80), actorUserId: userId
    });
    return saved;
  }

  async startConversation(
    contactId: string, channel: string, channelPhone: string
  ): Promise<Conversation> {
    const timestamp = nowISO();
    const conversation = await this.repos.conversations.add({
      id: uid(),
      contactId,
      channel,
      channelPhone:
        channel === 'whatsapp'
          ? wahaE164Phone(channelPhone) ?? channelPhone
          : channelPhone,
      lastMessageAt: timestamp,
      assignedUserId: '',
      status: 'open',
      snoozedUntil: '',
      createdAt: timestamp
    });
    await this.recordActivity({
      contactId, dealId: '', action: ACTIVITY.CONVERSATION_STARTED,
      evidence: channel, actorUserId: ''
    });
    return conversation;
  }

  async closeConversation(conversationId: string): Promise<void> {
    await this.repos.conversations.update(
      conversationId, { status: 'closed', snoozedUntil: '' }
    );
    await this.recordActivity({
      contactId: '', dealId: '', action: ACTIVITY.CONVERSATION_CLOSED,
      evidence: '', actorUserId: ''
    });
  }

  async addDeal(
    deal: Omit<Deal, 'id' | 'createdAt' | 'nextActionAt'>
  ): Promise<Deal> {
    const saved = await this.repos.deals.add({
      ...deal,
      nextActionAt: '',
      id: uid(),
      createdAt: nowISO()
    });
    await this.recordActivity({
      contactId: deal.contactId,
      dealId: saved.id,
      action: ACTIVITY.DEAL_CREATED,
      evidence: saved.title.slice(0, 80),
      actorUserId: ''
    });
    return saved;
  }

  async updateDeal(
    dealId: string, patch: Partial<Deal>
  ): Promise<Deal | undefined> {
    const saved = await this.repos.deals.update(dealId, patch);
    if (!saved) return undefined;
    await this.recordActivity({
      contactId: saved.contactId,
      dealId: saved.id,
      action: ACTIVITY.DEAL_UPDATED,
      evidence: saved.title.slice(0, 80),
      actorUserId: ''
    });
    return saved;
  }

  async moveDeal(dealId: string, stageId: string): Promise<void> {
    const saved = await this.repos.deals.update(
      dealId, { stageId, status: 'open' }
    );
    if (!saved) return;
    await this.recordActivity({
      contactId: saved.contactId,
      dealId: saved.id,
      action: ACTIVITY.DEAL_MOVED,
      evidence: stageId,
      actorUserId: ''
    });
  }

  async setDealStatus(
    dealId: string, status: Deal['status'], lostReason = ''
  ): Promise<void> {
    const saved = await this.repos.deals.update(
      dealId, { status, lostReason }
    );
    if (!saved) return;
    const action = status === 'won' ? ACTIVITY.DEAL_WON : ACTIVITY.DEAL_LOST;
    await this.recordActivity({
      contactId: saved.contactId,
      dealId: saved.id,
      action,
      evidence: lostReason || '',
      actorUserId: ''
    });
  }

  async cloneDeal(dealId: string): Promise<Deal | undefined> {
    const source = this.repos.deals.getById(dealId);
    if (!source) return undefined;
    const copy = await this.repos.deals.add({
      ...source,
      nextActionAt: '',
      id: uid(),
      title: `${source.title} (cópia)`,
      status: 'open',
      lostReason: '',
      createdAt: nowISO()
    });
    await this.recordActivity({
      contactId: copy.contactId,
      dealId: copy.id,
      action: ACTIVITY.DEAL_CLONED,
      evidence: source.title.slice(0, 80),
      actorUserId: ''
    });
    return copy;
  }

  riskDeals(thresholdDays = 3): RiskItem[] {
    const reference = nowISO();
    const { deals, contacts, activities } = this.repos;
    return deals
      .getAll()
      .filter((deal) => deal.status === 'open')
      .map((deal) => {
        const lastTouch = lastActivityAt(activities.getAll(), deal.id) ||
          deal.createdAt;
        return {
          deal,
          contact: contacts.getById(deal.contactId),
          daysSinceLastAction: daysBetweenISO(lastTouch, reference)
        };
      })
      .filter((item) => isOverdue(item.deal, reference) ||
        item.daysSinceLastAction >= thresholdDays)
      .sort((a, b) => b.daysSinceLastAction - a.daysSinceLastAction);
  }

  async mergeContacts(keepId: string, removeId: string): Promise<void> {
    if (keepId === removeId) return;
    const keep = this.repos.contacts.getById(keepId);
    const remove = this.repos.contacts.getById(removeId);
    if (!keep || !remove) return;
    await this.repointChildren(removeId, keepId);
    await this.backfillContact(keep, remove);
    await this.mergeContactTags(keep, remove);
    await this.repos.contacts.remove(removeId);
    await this.recordActivity({
      contactId: keepId,
      dealId: '',
      action: ACTIVITY.CONTACT_MERGED,
      evidence: `${keep.name || keep.id} + ${remove.name || remove.id}`,
      actorUserId: ''
    });
  }

  private async repointChildren(
    removeId: string, keepId: string
  ): Promise<void> {
    await Promise.all([
      ...repoint(this.repos.deals, removeId, keepId),
      ...repoint(this.repos.tasks, removeId, keepId),
      ...repoint(this.repos.events, removeId, keepId),
      ...repoint(this.repos.conversations, removeId, keepId)
    ]);
  }

  private async backfillContact(keep: Contact, remove: Contact): Promise<void> {
    if (!keep.name && remove.name) {
      await this.repos.contacts.update(keep.id, { name: remove.name });
    }
    if (!keep.phone && remove.phone) {
      await this.repos.contacts.update(keep.id, { phone: remove.phone });
    }
    if (!keep.email && remove.email) {
      await this.repos.contacts.update(keep.id, { email: remove.email });
    }
  }

  private async mergeContactTags(
    keep: Contact, remove: Contact
  ): Promise<void> {
    const tags = mergeTags(keep.tags, remove.tags);
    await this.repos.contacts.update(keep.id, { tags });
  }

  activities(): CrmActivity[] {
    return sortActivitiesDesc(this.repos.activities.getAll());
  }

  activitiesFor(contactId: string): CrmActivity[] {
    return this.activities().filter(
      (activity) =>
        activity.contactId === contactId || activity.dealId === ''
    );
  }

  async recordActivity(input: ActivityInput): Promise<void> {
    const activity: CrmActivity = {
      id: uid(),
      contactId: input.contactId,
      dealId: input.dealId,
      actorKind: 'user',
      actorUserId: input.actorUserId,
      action: input.action,
      evidence: input.evidence,
      createdAt: nowISO()
    };
    await this.repos.activities.add(activity);
  }

  todayTasks(): Task[] {
    return tasksDueBy(this.repos.tasks.getAll(), todayISO());
  }

  upcomingEvents(days = 7): CalendarEvent[] {
    const from = todayISO();
    const until = new Date(Date.now() + days * 86400000)
      .toISOString()
      .slice(0, 10);
    return upcomingEventsOf(this.repos.events.getAll(), from)
      .filter((event) => event.startsAt.slice(0, 10) <= until);
  }

  appointmentTypes(includeInactive = false): AppointmentType[] {
    const all = this.repos.appointmentTypes.getAll();
    const active = includeInactive ? all :
      all.filter((type) => type.ativo);
    return active.sort((a, b) =>
      a.position - b.position || a.name.localeCompare(b.name));
  }
}