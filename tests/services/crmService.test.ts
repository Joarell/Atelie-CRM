import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../helpers/inMemoryRepository';
import { CrmService, type CrmRepositories } from '../../src/services/CrmService';
import type {
  Contact, Pipeline, Stage, Deal, Task, CalendarEvent, Conversation, Message,
  CrmActivity, ConversationNote, Tag, AppointmentType
} from '../../src/domain/crm';

const contact = (id: string, name: string): Contact =>
  ({ id, name, phone: '5511999990000', email: '', notes: '', tags: [], assignedUserId: '', createdAt: '2026-09-01T00:00:00Z' });

const pipeline = (id: string, isDefault = false): Pipeline => ({ id, name: 'Funil ' + id, isDefault });

const stage = (id: string, pipelineId: string, position: number): Stage =>
  ({ id, pipelineId, name: 'Etapa ' + position, position });

const deal = (id: string, stageId: string, pipelineId: string, valueCents: number, status: Deal['status'] = 'open'): Deal =>
  ({ id, pipelineId, stageId, contactId: 'c1', title: id, valueCents, status, lostReason: '', nextActionAt: '', assignedUserId: '', createdAt: '2026-09-01T00:00:00Z' });

const task = (id: string, dueAt: string): Task =>
  ({ id, title: id, done: false, dueAt, assigneeUserId: '', contactId: '', createdAt: '2026-09-01T00:00:00Z' });

const event = (id: string, startsAt: string): CalendarEvent =>
  ({ id, contactId: '', title: id, startsAt, endsAt: startsAt, eventType: 'outro', remindBeforeMin: 0, createdBy: '', createdAt: '' });

const conversation = (id: string, contactId: string, lastMessageAt: string, status: Conversation['status'] = 'open'): Conversation =>
  ({ id, contactId, channel: 'whatsapp', channelPhone: '5511999990000', lastMessageAt, assignedUserId: '', status, snoozedUntil: '', createdAt: '2026-09-01T00:00:00Z' });

const message = (id: string, conversationId: string, createdAt: string): Message =>
  ({ id, conversationId, direction: 'inbound', text: id, createdBy: '', createdAt });

const activity = (id: string, dealId: string, createdAt: string): CrmActivity =>
  ({ id, contactId: 'c1', dealId, actorKind: 'user', actorUserId: '', action: 'deal.moved', evidence: '', createdAt });

const note = (id: string, conversationId: string): ConversationNote =>
  ({ id, conversationId, body: 'lembrete', authorUserId: '', createdAt: '2026-09-01T00:00:00Z' });

const tag = (id: string, name: string): Tag =>
  ({ id, name, color: 'caramel', ativo: true, createdAt: '2026-09-01T00:00:00Z' });

const appointmentType = (id: string, name: string, position: number): AppointmentType =>
  ({ id, name, durationMin: 60, color: '', ativo: true, position, createdAt: '2026-09-01T00:00:00Z' });

function harness(overrides: Partial<CrmRepositories> = {}): CrmService {
  const repos: CrmRepositories = {
    contacts: InMemoryRepository.seeded([contact('c1', 'Ana'), contact('c2', 'Bruno')]),
    pipelines: InMemoryRepository.seeded([pipeline('p1', true), pipeline('p2', false)]),
    stages: InMemoryRepository.seeded([stage('s1', 'p1', 0), stage('s2', 'p1', 1), stage('s3', 'p1', 2)]),
    deals: InMemoryRepository.seeded([deal('d1', 's1', 'p1', 1000), deal('d2', 's2', 'p1', 2500, 'won'), deal('d3', 's1', 'p1', 4000)]),
    tasks: InMemoryRepository.seeded([]),
    quickReplies: InMemoryRepository.seeded([]),
    events: InMemoryRepository.seeded([]),
    conversations: InMemoryRepository.seeded([]),
    messages: InMemoryRepository.seeded([]),
    catalog: InMemoryRepository.seeded([]),
    activities: InMemoryRepository.seeded([]),
    notes: InMemoryRepository.seeded([]),
    appointmentTypes: InMemoryRepository.seeded([]),
    tags: InMemoryRepository.seeded([]),
    ...overrides
  };
  return new CrmService(repos);
}

describe('CrmService pipeline helpers', () => {
  it('defaultPipeline prefers the flagged one', () => {
    expect(harness().defaultPipeline()?.id).toBe('p1');
  });
  it('pipelineStages orders by position', () => {
    expect(harness().pipelineStages('p1').map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
  it('dealsInStage and stageTotal consider open deals only', () => {
    const svc = harness();
    expect(svc.dealsInStage('s1').map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(svc.stageTotal('s1')).toBe(5000);
    expect(svc.stageTotal('s2')).toBe(0);
  });
  it('pipelineOpenTotal sums open deals pipeline-wide', () => {
    expect(harness().pipelineOpenTotal('p1')).toBe(5000);
  });
});

describe('CrmService inbox', () => {
  it('lists open conversations newest-first with contact and last message', () => {
    const svc = harness({
      conversations: InMemoryRepository.seeded([
        conversation('cv1', 'c1', '2026-09-17T10:00:00Z'),
        conversation('cv2', 'c2', '2026-09-18T10:00:00Z'),
        conversation('cv3', 'c1', '2026-09-16T10:00:00Z', 'closed')
      ]),
      messages: InMemoryRepository.seeded([message('m1', 'cv1', '2026-09-17T09:00:00Z')])
    });
    const items = svc.inbox();
    expect(items.map((i) => i.conversation.id)).toEqual(['cv2', 'cv1']);
    expect(items[1].contact?.name).toBe('Ana');
    expect(items[1].lastMessage?.id).toBe('m1');
  });
  it('openInboxCount ignores closed conversations', () => {
    const svc = harness({
      conversations: InMemoryRepository.seeded([
        conversation('cv1', 'c1', '2026-09-17T10:00:00Z'),
        conversation('cv2', 'c1', '2026-09-16T10:00:00Z', 'closed')
      ])
    });
    expect(svc.openInboxCount()).toBe(1);
  });
});

describe('CrmService conversation actions', () => {
  it('sendMessage appends the message and bumps lastMessageAt', async () => {
    const conversations = InMemoryRepository.seeded([conversation('cv1', 'c1', '2026-09-01T00:00:00Z')]);
    const svc = harness({ conversations, messages: InMemoryRepository.seeded([]) });
    const saved = await svc.sendMessage('cv1', 'Olá!', 'u1');
    expect(saved.direction).toBe('outbound');
    expect(saved.conversationId).toBe('cv1');
    expect(conversations.getById('cv1')?.lastMessageAt).toBe(saved.createdAt);
  });
  it('startConversation opens a fresh WhatsApp thread', async () => {
    const svc = harness();
    const created = await svc.startConversation('c2', 'whatsapp', '5511999999999');
    expect(created.status).toBe('open');
    expect(created.contactId).toBe('c2');
    expect(created.channelPhone).toBe('5511999999999');
  });

  it('startConversation normalizes a national WhatsApp phone to E.164', async () => {
    const svc = harness();
    const created = await svc.startConversation('c2', 'whatsapp', '(11) 98570-9355');
    expect(created.channelPhone).toBe('5511985709355');
  });

  it('startConversation leaves non-WhatsApp channels untouched', async () => {
    const svc = harness();
    const created = await svc.startConversation('c2', 'email', 'ana@deskcomm.local');
    expect(created.channelPhone).toBe('ana@deskcomm.local');
  });
});

describe('CrmService agenda integration', () => {
  it('todayTasks returns open tasks due by end of today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const svc = harness({
      tasks: InMemoryRepository.seeded([
        task('t-today', `${today}T23:59:59.000Z`),
        task('t-tomorrow', `2099-01-01T10:00:00.000Z`),
        { ...task('t-done-today', `${today}T09:00:00.000Z`), done: true }
      ])
    });
    expect(svc.todayTasks().map((t) => t.id)).toEqual(['t-today']);
  });

  it('upcomingEvents covers only the next N days', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 8 * 86400000).toISOString();
    const svc = harness({
      events: InMemoryRepository.seeded([event('e1', tomorrow), event('e-far', nextWeek)])
    });
    expect(svc.upcomingEvents(7).map((e) => e.id)).toEqual(['e1']);
  });

  it('appointmentTypes orders by position and hides inactive', () => {
    const svc = harness({
      appointmentTypes: InMemoryRepository.seeded([
        appointmentType('a3', 'Entrega', 2),
        appointmentType('a1', 'Reunião', 0),
        { ...appointmentType('a2', 'Degustação', 1), ativo: false }
      ])
    });
    expect(svc.appointmentTypes().map((t) => t.id)).toEqual(['a1', 'a3']);
    expect(svc.appointmentTypes(true).map((t) => t.id)).toEqual(['a1', 'a2', 'a3']);
  });
});

describe('CrmService conversation lifecycle', () => {
  const snoozedUntil = (daysAhead: number): string =>
    new Date(Date.now() + daysAhead * 86400000).toISOString();

  it('inbox hides conversations snoozed into the future', () => {
    const future = snoozedUntil(2);
    const svc = harness({
      conversations: InMemoryRepository.seeded([
        { ...conversation('cv1', 'c1', '2026-09-17T10:00:00Z'), snoozedUntil: future },
        conversation('cv2', 'c2', '2026-09-18T10:00:00Z')
      ])
    });
    expect(svc.inbox().map((i) => i.conversation.id)).toEqual(['cv2']);
    expect(svc.openInboxCount()).toBe(1);
  });

  it('dormantInbox lists the soonest-expiring snoozed conversation', () => {
    const svc = harness({
      conversations: InMemoryRepository.seeded([
        { ...conversation('cv1', 'c1', '2026-09-17T10:00:00Z'), snoozedUntil: snoozedUntil(3) },
        { ...conversation('cv2', 'c2', '2026-09-18T10:00:00Z'), snoozedUntil: snoozedUntil(1) },
        conversation('cv3', 'c1', '2026-09-19T10:00:00Z')
      ])
    });
    const dormant = svc.dormantInbox().map((i) => i.conversation.id);
    expect(dormant).toEqual(['cv2', 'cv1']);
  });

  it('restore moves the conversation back into the open inbox', async () => {
    const conversations = InMemoryRepository.seeded([
      { ...conversation('cv1', 'c1', '2026-09-17T10:00:00Z'), snoozedUntil: snoozedUntil(2) }
    ]);
    const svc = harness({ conversations });
    expect(svc.dormantInbox()).toHaveLength(1);
    await svc.resumeConversation('cv1');
    expect(svc.dormantInbox()).toHaveLength(0);
    expect(svc.inbox().map((i) => i.conversation.id)).toEqual(['cv1']);
    expect(conversations.getById('cv1')?.snoozedUntil).toBe('');
    expect(conversations.getById('cv1')?.status).toBe('open');
  });

  it('snooze and resume persist the flag on the conversation', async () => {
    const conversations = InMemoryRepository.seeded([conversation('cv1', 'c1', '2026-09-17T10:00:00Z')]);
    const svc = harness({ conversations });
    await svc.snoozeConversation('cv1', snoozedUntil(1));
    expect(conversations.getById('cv1')?.snoozedUntil).toBeTruthy();
    await svc.resumeConversation('cv1');
    expect(conversations.getById('cv1')?.snoozedUntil).toBe('');
    expect(conversations.getById('cv1')?.status).toBe('open');
  });

  it('addNote stores a note and notesForConversation scopes it', async () => {
    const notes = InMemoryRepository.seeded([note('n1', 'cv-target')]);
    const svc = harness({ notes });
    await svc.addNote('cv-other', '  olhar depois  ', 'u1');
    expect(svc.notesForConversation('cv-target').map((n) => n.id)).toEqual(['n1']);
    expect(svc.notesForConversation('cv-other').map((n) => n.body)).toEqual(['olhar depois']);
  });

  it('updateNote trims the body and records note.updated', async () => {
    const notes = InMemoryRepository.seeded([note('n1', 'cv1')]);
    const activities = InMemoryRepository.seeded<CrmActivity>([]);
    const svc = harness({ notes, activities });
    await svc.updateNote('n1', '  ligar amanhã  ', 'u1');
    expect(notes.getById('n1')?.body).toBe('ligar amanhã');
    const actions = activities.getAll().map((a) => a.action);
    expect(actions).toContain('note.updated');
  });

  it('updateNote ignores an empty body and records nothing', async () => {
    const notes = InMemoryRepository.seeded([note('n1', 'cv1')]);
    const activities = InMemoryRepository.seeded<CrmActivity>([]);
    const svc = harness({ notes, activities });
    await svc.updateNote('n1', '   ', 'u1');
    expect(notes.getById('n1')?.body).toBe('lembrete');
    expect(activities.getAll()).toHaveLength(0);
  });

  it('deleteNote removes the row and records note.deleted', async () => {
    const notes = InMemoryRepository.seeded([note('n1', 'cv1')]);
    const activities = InMemoryRepository.seeded<CrmActivity>([]);
    const svc = harness({ notes, activities });
    await svc.deleteNote('n1', 'u1');
    expect(notes.getById('n1')).toBeUndefined();
    const deleted = activities.getAll().find((a) => a.action === 'note.deleted');
    expect(deleted?.evidence).toBe('lembrete');
    expect(deleted?.actorUserId).toBe('u1');
  });
});

describe('CrmService activities bus', () => {
  it('every write records an activity and stores the who/what/when', async () => {
    const activities = InMemoryRepository.seeded<CrmActivity>([]);
    const svc = harness({ activities });
    await svc.sendMessage('cv1', 'Oi!', 'u1');
    await svc.startConversation('c2', 'whatsapp', '5511999999999');
    const rows = activities.getAll();
    expect(rows.some((a) => a.action === 'message.sent' && a.actorUserId === 'u1')).toBe(true);
    expect(rows.some((a) => a.action === 'conversation.started' && a.contactId === 'c2')).toBe(true);
  });

  it('activities() returns newest first', async () => {
    const activities = InMemoryRepository.seeded([
      activity('old', 'd1', '2026-09-01T00:00:00Z'),
      activity('new', 'd1', '2026-09-02T00:00:00Z')
    ]);
    expect(harness({ activities }).activities().map((a) => a.id)).toEqual(['new', 'old']);
  });
});

describe('CrmService deal actions', () => {
  it('cloneDeal copies the deal as open with a "(cópia)" title', async () => {
    const deals = InMemoryRepository.seeded([deal('d1', 's1', 'p1', 3000)]);
    const svc = harness({ deals });
    const copy = await svc.cloneDeal('d1');
    expect(copy?.id).not.toBe('d1');
    expect(copy?.title).toBe('d1 (cópia)');
    expect(copy?.status).toBe('open');
    expect(copy?.valueCents).toBe(3000);
    expect(deals.getAll().length).toBe(2);
  });

  it('riskDeals flags open deals past the action deadline or stale', () => {
    const svc = harness({
      deals: InMemoryRepository.seeded([
        { ...deal('d-old', 's1', 'p1', 1000), nextActionAt: '2026-09-01T00:00:00Z' },
        deal('d-soon', 's1', 'p1', 2000)
      ]),
      activities: InMemoryRepository.seeded([activity('a1', 'd-soon', new Date().toISOString())])
    });
    const risk = svc.riskDeals(3);
    const ids = risk.map((r) => r.deal.id);
    expect(ids).toContain('d-old');
    expect(ids).not.toContain('d-soon');
  });
});

describe('CrmService contact merge', () => {
  it('mergeContacts repoints children, unions tags and deletes the absorbed contact', async () => {
    const contacts = InMemoryRepository.seeded([
      { ...contact('c1', 'Ana'), tags: ['quente'] },
      { ...contact('c2', 'Bruno'), phone: '5511999990001', tags: ['casamento'] }
    ]);
    const deals = InMemoryRepository.seeded([
      { ...deal('d1', 's1', 'p1', 1000), contactId: 'c2' }
    ]);
    const tasks = InMemoryRepository.seeded([{ ...task('t1', '2026-09-20T00:00:00Z'), contactId: 'c2' }]);
    const events = InMemoryRepository.seeded([{ ...event('e1', '2026-09-20T00:00:00Z'), contactId: 'c2' }]);
    const conversations = InMemoryRepository.seeded([{ ...conversation('cv1', 'c2', '2026-09-17T10:00:00Z'), contactId: 'c2' }]);
    const svc = harness({ contacts, deals, tasks, events, conversations });

    await svc.mergeContacts('c1', 'c2');

    expect(deals.getById('d1')?.contactId).toBe('c1');
    expect(tasks.getById('t1')?.contactId).toBe('c1');
    expect(events.getById('e1')?.contactId).toBe('c1');
    expect(conversations.getById('cv1')?.contactId).toBe('c1');
    expect(contacts.getById('c1')?.tags).toContain('casamento');
    expect(contacts.getById('c1')?.tags).toContain('quente');
    expect(contacts.getById('c2')).toBeUndefined();
  });
});