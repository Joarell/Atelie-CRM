import type { Database } from './db';
import type { Contact, Conversation } from '../domain/crm';
import { uid } from '../domain/format';
import { normalizePhoneDigits } from '../domain/crmMath';
import { digitsFromJid } from '../domain/wahaWebhook';
import { findWhere, insertById, updateById } from './wahaSql';

// Reconciles a WAHA contact/conversation pair before a message row is
// inserted. The contact name comes from the inbound `notifyName` ONLY —
// an outbound echo must not baptize the client contact with the store name.

export async function ensureWahaContact(
  db: Database,
  phone: string,
  name: string | null,
  at: string
): Promise<Contact> {
  const key = normalizePhoneDigits(phone);
  const existing = await findContactByPhone(db, phone, key);
  const contact = existing[0] ?? newWahaContact(phone, name, at);
  if (!existing[0]) {
    await insertById(db, 'contacts', contact);
  } else if (name && contact.name === phone) {
    await updateById<Contact>(db, 'contacts', contact.id, { name });
    contact.name = name;
  }
  contact.tags = JSON.parse((contact.tags as unknown as string) || '[]');
  return contact;
}

// The peer phone arrives E.164 (`5511985709355`) but Contatos stores national
// numbers (`11985709355`), so a number already known must be matched under
// BOTH spellings — the national key first, then the raw engine phone — or
// every inbound of an existing number would spawn a duplicate contact.
async function findContactByPhone(
  db: Database, raw: string, key: string
): Promise<Contact[]> {
  if (key === raw) {
    return findWhere<Contact>(db, 'contacts', 'phone', key);
  }
  const byKey = await findWhere<Contact>(db, 'contacts', 'phone', key);
  if (byKey[0]) return byKey;
  return findWhere<Contact>(db, 'contacts', 'phone', raw);
}

function newWahaContact(
  phone: string, name: string | null, at: string
): Contact {
  return {
    id: uid(),
    name: name || phone,
    phone,
    email: '',
    notes: '',
    tags: '[]',
    createdAt: at
  } as unknown as Contact;
}

export async function ensureWahaConversation(
  db: Database,
  contact: Contact,
  remoteJid: string,
  phone: string,
  at: string
): Promise<Conversation> {
  const byRemote = await findWhere<Conversation>(
    db, 'conversations', 'remoteId', remoteJid
  );
  if (byRemote[0]) return byRemote[0];
  const byContact = await findWhere<Conversation>(
    db, 'conversations', 'contactId', contact.id
  );
  const viaContact = byContact.find((c) => c.channel === 'whatsapp');
  if (viaContact) return reuseWahaConversation(db, viaContact, remoteJid);
  const conversation = newWahaConversation(contact, phone, remoteJid, at);
  await insertById(db, 'conversations', conversation);
  return conversation;
}

async function reuseWahaConversation(
  db: Database,
  conversation: Conversation,
  remoteJid: string
): Promise<Conversation> {
  if (!conversation.remoteId) {
    await updateById<Conversation>(
      db, 'conversations', conversation.id, { remoteId: remoteJid }
    );
  }
  return { ...conversation, remoteId: remoteJid };
}

function newWahaConversation(
  contact: Contact, phone: string, remoteJid: string, at: string
): Conversation {
  return {
    id: uid(),
    contactId: contact.id,
    channel: 'whatsapp',
    channelPhone: phone,
    lastMessageAt: at,
    assignedUserId: '',
    status: 'open',
    snoozedUntil: '',
    createdAt: at,
    remoteId: remoteJid
  };
}

export function phoneOf(chatId: string): string | null {
  return digitsFromJid(chatId);
}