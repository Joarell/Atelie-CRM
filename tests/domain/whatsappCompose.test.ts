import { describe, it, expect } from 'vitest';
import {
  composeTargets,
  whatsappConversationFor,
  type ComposeTarget
} from '../../src/domain/whatsapp';
import type { Contact, Conversation } from '../../src/domain/crm';

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c1',
    name: 'Ana',
    phone: '5511999998888',
    email: '',
    notes: '',
    tags: [],
    assignedUserId: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conv1',
    contactId: 'c1',
    channel: 'whatsapp',
    channelPhone: '5511999998888',
    lastMessageAt: '2026-01-01T00:00:00Z',
    assignedUserId: '',
    status: 'open',
    snoozedUntil: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('composeTargets', () => {
  it('lists every contact with a phone as a sendable target', () => {
    const targets = composeTargets(
      [contact({}), contact({ id: 'c2', name: 'Bruno' })],
      []
    );
    expect(targets.map((t) => t.value)).toEqual(['c1', 'c2']);
    expect(targets[0].label).toBe('Ana · 5511999998888');
  });

  it('skips contacts without a phone (no WhatsApp number)', () => {
    const targets = composeTargets(
      [contact({}), contact({ id: 'c2', phone: '' })],
      []
    );
    expect(targets.map((t) => t.value)).toEqual(['c1']);
  });

  it('lists a contact with an existing WhatsApp conversation once', () => {
    const targets = composeTargets(
      [contact({})],
      [conversation({})]
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].value).toBe('conv1');
    expect(targets[0].contactId).toBe('c1');
    expect(targets[0].label).toBe('Ana · 5511999998888');
  });

  it('does not offer a contact that already has a WhatsApp conversation', () => {
    const targets = composeTargets(
      [contact({}), contact({ id: 'c2', name: 'Bruno' })],
      [conversation({})]
    );
    expect(targets.map((t) => t.value)).toEqual(['conv1', 'c2']);
  });

  it('keeps WhatsApp conversations that have no resolvable contact', () => {
    const targets = composeTargets(
      [],
      [conversation({ contactId: '', channelPhone: '551188887777' })]
    );
    expect(targets[0].value).toBe('conv1');
    expect(targets[0].contactId).toBeNull();
    expect(targets[0].label).toBe(' · 551188887777');
  });

  it('falls back to the contact id when the contact is gone', () => {
    const targets = composeTargets(
      [],
      [conversation({})]
    );
    expect(targets[0].label).toBe('c1 · 5511999998888');
  });

  it('sorts the list by label', () => {
    const targets = composeTargets(
      [contact({ name: 'Zé' }), contact({ id: 'c2', name: 'Abel' })],
      []
    );
    expect(targets.map((t) => t.label)).toEqual([
      'Abel · 5511999998888',
      'Zé · 5511999998888'
    ]);
  });

  it('ignores conversations on other channels entirely', () => {
    const targets = composeTargets(
      [contact({})],
      [conversation({ channel: 'email' })]
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].value).toBe('c1');
  });
});

describe('whatsappConversationFor', () => {
  it('finds the WhatsApp conversation of a contact', () => {
    const conv = conversation({});
    const found = whatsappConversationFor('c1', [conv]);
    expect(found).toBe(conv);
  });

  it('ignores conversations on other channels', () => {
    const email = conversation({ channel: 'email' });
    expect(whatsappConversationFor('c1', [email])).toBeUndefined();
  });

  it('is undefined when the contact has no conversation yet', () => {
    expect(whatsappConversationFor('nobody', [conversation({})]))
      .toBeUndefined();
  });
});