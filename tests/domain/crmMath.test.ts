import { describe, it, expect } from 'vitest';
import {
  formatPriceCents,
  sortedStagesOf,
  dealsInStage,
  stageOpenTotal,
  pipelineOpenTotal,
  openDealsForContact,
  tasksDueBy,
  upcomingEvents,
  messagesForConversation,
  openConversations,
  normalizePhoneDigits,
  contactFingerprint,
  findPotentialDuplicates,
  mergeTags,
  isSnoozed,
  openNotSnoozed,
  snoozedConversations,
  sortActivitiesDesc,
  lastActivityAt,
  daysBetweenISO
} from '../../src/domain/crmMath';
import type { Deal, Stage, Task, CalendarEvent, Message, Conversation, Contact, CrmActivity } from '../../src/domain/crm';

const stage = (id: string, pipelineId: string, position: number): Stage => ({ id, pipelineId, name: id, position });

const deal = (id: string, stageId: string, pipelineId = 'p', valueCents = 1000, status: Deal['status'] = 'open'): Deal => ({
  id, pipelineId, stageId, contactId: 'c1', title: id, valueCents, status, lostReason: '', nextActionAt: '', createdAt: '2026-09-01T10:00:00Z'
});

describe('formatPriceCents', () => {
  it('formats integer cents as BRL', () => {
    expect(formatPriceCents(8990)).toContain('89,90');
  });
  it('handles negative-free zero', () => {
    expect(formatPriceCents(0)).toContain('0');
  });
});

describe('sortedStagesOf', () => {
  it('filters by pipeline and orders by position', () => {
    const stages = [stage('a', 'p1', 2), stage('b', 'p1', 0), stage('c', 'p2', 0)];
    expect(sortedStagesOf(stages, 'p1').map((s) => s.id)).toEqual(['b', 'a']);
  });
  it('returns an empty list for an unknown pipeline', () => {
    expect(sortedStagesOf([stage('a', 'p1', 0)], 'p9')).toEqual([]);
  });
});

describe('dealsInStage / totals', () => {
  const deals = [
    deal('d1', 's1', 'p', 1000),
    deal('d2', 's1', 'p', 2000),
    deal('d3', 's2', 'p', 5000, 'won'),
    deal('d4', 's3', 'p2', 4000)
  ];

  it('dealsInStage keeps only open deals of that stage', () => {
    expect(dealsInStage(deals, 's1').map((d) => d.id)).toEqual(['d1', 'd2']);
  });
  it('stageOpenTotal sums only that stage', () => {
    expect(stageOpenTotal(deals, 's1')).toBe(3000);
    expect(stageOpenTotal(deals, 's2')).toBe(0);
  });
  it('pipelineOpenTotal sums open deals across stages of the pipeline', () => {
    expect(pipelineOpenTotal(deals, 'p')).toBe(3000);
  });
});

describe('openDealsForContact', () => {
  it('returns open deals for the contact only', () => {
    const deals = [deal('d1', 's1'), { ...deal('d2', 's1'), contactId: 'c2' }, deal('d3', 's1', 'p', 100, 'won')];
    expect(openDealsForContact(deals, 'c1').map((d) => d.id)).toEqual(['d1']);
  });
});

describe('tasksDueBy', () => {
  const tasks = [
    { id: 't1', title: 'hoje', done: false, dueAt: '2026-09-17T23:59:59.000Z', assigneeUserId: '', contactId: '', createdAt: '' },
    { id: 't2', title: 'amanhã', done: false, dueAt: '2026-09-18T10:00:00.000Z', assigneeUserId: '', contactId: '', createdAt: '' },
    { id: 't3', title: 'feita hoje', done: true, dueAt: '2026-09-17T09:00:00.000Z', assigneeUserId: '', contactId: '', createdAt: '' }
  ] as Task[];

  it('matches tasks due on the boundary day even with full timestamps', () => {
    expect(tasksDueBy(tasks, '2026-09-17').map((t) => t.id)).toEqual(['t1']);
  });
  it('excludes completed tasks', () => {
    expect(tasksDueBy(tasks, '2026-09-30').map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('returns an empty list when nothing is due', () => {
    expect(tasksDueBy(tasks, '2026-09-01')).toEqual([]);
  });
});

describe('upcomingEvents', () => {
  const event = (id: string, startsAt: string): CalendarEvent =>
    ({ id, contactId: '', title: id, startsAt, endsAt: startsAt, eventType: 'outro', remindBeforeMin: 0, createdBy: '', createdAt: '' });

  it('keeps events from the boundary onwards and sorts ascending', () => {
    const events = [event('ontem', '2026-09-16T10:00:00Z'), event('b', '2026-09-18T10:00:00Z'), event('a', '2026-09-17T10:00:00Z')];
    expect(upcomingEvents(events, '2026-09-17').map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('limits the result to the requested count', () => {
    const events = [event('a', '2026-09-17T10:00:00Z'), event('b', '2026-09-18T10:00:00Z')];
    expect(upcomingEvents(events, '2026-09-17', 1).map((e) => e.id)).toEqual(['a']);
  });
});

describe('messagesForConversation', () => {
  const message = (id: string, conversationId: string, createdAt: string): Message =>
    ({ id, conversationId, direction: 'outbound', text: id, createdBy: '', createdAt });

  it('filters and sorts chronologically', () => {
    const messages = [message('m2', 'conv', '2026-09-17T10:02:00Z'), message('m1', 'conv', '2026-09-17T10:01:00Z'), message('x', 'other', '2026-09-17T10:03:00Z')];
    expect(messagesForConversation(messages, 'conv').map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('openConversations', () => {
  const conv = (id: string, status: Conversation['status'], lastMessageAt: string): Conversation =>
    ({ id, contactId: '', channel: 'whatsapp', channelPhone: '', lastMessageAt, assignedUserId: '', status, snoozedUntil: '', createdAt: '' });

  it('sorts open conversations by last activity, newest first', () => {
    const conversations = [conv('a', 'open', '2026-09-17T10:00:00Z'), conv('b', 'open', '2026-09-18T10:00:00Z'), conv('c', 'closed', '2026-09-19T10:00:00Z')];
    expect(openConversations(conversations).map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('contact duplicates', () => {
  const contact = (id: string, phone: string, email = ''): Contact =>
    ({ id, name: id, phone, email, notes: '', tags: [], createdAt: '' });

  it('normalizePhoneDigits strips formatting and the BR country code prefix', () => {
    expect(normalizePhoneDigits('(11) 99999-0000')).toBe('11999990000');
    expect(normalizePhoneDigits('5511999990000')).toBe('11999990000');
    expect(normalizePhoneDigits('+55 11 99999 0000')).toBe('11999990000');
  });

  it('fingerprints on phone when it has enough digits, else on email', () => {
    expect(contactFingerprint(contact('a', '(11) 99999-0000'))).toBe('p:11999990000');
    expect(contactFingerprint(contact('b', '', 'Ana@Example.com'))).toBe('e:ana@example.com');
    expect(contactFingerprint(contact('c', ''))).toBeNull();
  });

  it('findPotentialDuplicates groups contacts sharing a fingerprint', () => {
    const groups = findPotentialDuplicates([
      contact('a', '11999990000'),
      contact('b', '(11) 99999-0000'),
      contact('c', '11988880000'),
      contact('d', '', 'ana@example.com'),
      contact('e', '', 'ANA@example.com')
    ]);
    expect(groups.length).toBe(2);
    expect(groups.map((g) => g.map((c) => c.id).sort())).toContainEqual(['a', 'b']);
    expect(groups.map((g) => g.map((c) => c.id).sort())).toContainEqual(['d', 'e']);
  });

  it('mergeTags unions both lists without duplicates', () => {
    expect(mergeTags(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('conversation snooze', () => {
  const conv = (snoozedUntil: string, status: Conversation['status'] = 'open'): Conversation =>
    ({ id: 'c', contactId: '', channel: 'whatsapp', channelPhone: '', lastMessageAt: '', assignedUserId: '', status, snoozedUntil, createdAt: '' });

  it('isSnoozed is true only while snoozedUntil is in the future', () => {
    expect(isSnoozed(conv('2026-09-20T00:00:00Z'), '2026-09-17T00:00:00Z')).toBe(true);
    expect(isSnoozed(conv('2026-09-16T00:00:00Z'), '2026-09-17T00:00:00Z')).toBe(false);
    expect(isSnoozed(conv(''), '2026-09-17T00:00:00Z')).toBe(false);
  });

  it('openNotSnoozed drops actively-snoozed conversations but keeps closed out', () => {
    const conversations = [
      conv('', 'open'),
      conv('2099-01-01T00:00:00Z', 'open'),
      conv('', 'closed')
    ];
    expect(openNotSnoozed(conversations, '2026-09-17T00:00:00Z').map((c) => c.id)).toEqual(['c']);
  });

  it('snoozedConversations keeps open conversations inside the snooze window', () => {
    const now = '2026-09-17T00:00:00Z';
    const conversations = [
      { ...conv('2099-01-01T00:00:00Z', 'open'), id: 'a' },
      { ...conv('2026-09-16T00:00:00Z', 'open'), id: 'b' },
      { ...conv('', 'open'), id: 'c' },
      { ...conv('2099-01-01T00:00:00Z', 'closed'), id: 'd' }
    ];
    expect(snoozedConversations(conversations, now).map((c) => c.id)).toEqual(['a']);
  });
});

describe('activities bus', () => {
  const activity = (id: string, dealId: string, createdAt: string): CrmActivity =>
    ({ id, contactId: '', dealId, actorKind: 'user', actorUserId: '', action: 'deal.moved', evidence: '', createdAt });

  it('sortActivitiesDesc orders newest first', () => {
    const activities = [activity('a', 'd', '2026-09-17T10:00:00Z'), activity('b', 'd', '2026-09-18T10:00:00Z')];
    expect(sortActivitiesDesc(activities).map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('lastActivityAt returns the latest createdAt for a deal (empty when none)', () => {
    const activities = [activity('a', 'd1', '2026-09-17T10:00:00Z'), activity('b', 'd1', '2026-09-18T10:00:00Z'), activity('c', 'd2', '2026-09-19T10:00:00Z')];
    expect(lastActivityAt(activities, 'd1')).toBe('2026-09-18T10:00:00Z');
    expect(lastActivityAt(activities, 'd9')).toBe('');
  });

  it('daysBetweenISO counts whole days between two instants', () => {
    expect(daysBetweenISO('2026-09-14T10:00:00Z', '2026-09-17T10:00:00Z')).toBe(3);
    expect(daysBetweenISO('2026-09-17T10:00:00Z', '2026-09-15T10:00:00Z')).toBe(0);
  });
});