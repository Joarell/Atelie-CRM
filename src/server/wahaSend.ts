import type { Database } from './db';
import type { Conversation, Message } from '../domain/crm';
import { nowISO, uid } from '../domain/format';
import {
  chatIdForPhone,
  isIgnoredChat,
  isWahaLidChat,
  parseWahaChatId,
  parseWahaMessageId,
  wahaE164Phone
} from '../domain/wahaWebhook';
import type { WahaClient } from './waha';
import { getEntity } from './crud';
import {
  insertWahaMessage, messageByWahaId, type WahaMessageRow
} from './wahaMessage';
import { deleteById, touchConversation, updateById } from './wahaSql';
import { CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE } from './tables';

// Outbound send through the WAHA engine. The row is persisted first as
// `queued`, then flipped to `sent` (with the bare external id) or `failed`.

export interface SendWahaTextInput {
  conversationId: string;
  text: string;
  userId: string;
  replyTo?: string | null;
}

export class WahaSendError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'WahaSendError';
  }
}

/** Sends a text to a WhatsApp conversation through the WAHA engine. */
export async function sendWahaText(
  db: Database, client: WahaClient, input: SendWahaTextInput
): Promise<Message> {
  const conversation = await loadWahaConversation(db, input.conversationId);
  const chatId = sendChatIdFor(conversation);
  if (!chatId) {
    throw new WahaSendError('missing_phone', 'Contato sem número de WhatsApp');
  }
  const message = await insertWahaMessage(
    db, buildQueuedRow(conversation, input, chatId)
  );
  try {
    const response = await client.sendText(
      client.session, chatId, input.text, input.replyTo || null
    );
    return resolveSendResult(db, conversation, message, input.text, response);
  } catch (error) {
    await updateById<Message>(db, 'messages', message.id, {
      waStatus: 'failed'
    });
    throw error;
  }
}

async function loadWahaConversation(
  db: Database, conversationId: string
): Promise<Conversation> {
  const conversation = await getEntity<Conversation>(
    db, CONVERSATIONS_TABLE, CONVERSATIONS_SHAPE, conversationId
  );
  if (!conversation) {
    throw new WahaSendError(
      'conversation_not_found', 'Conversa não encontrada'
    );
  }
  if (conversation.channel !== 'whatsapp') {
    throw new WahaSendError(
      'wrong_channel', 'Esta conversa não é do canal WhatsApp'
    );
  }
  return conversation;
}

function buildQueuedRow(
  conversation: Conversation, input: SendWahaTextInput, chatId: string
): WahaMessageRow {
  return {
    id: uid(),
    conversationId: conversation.id,
    direction: 'outbound',
    text: input.text,
    createdBy: input.userId,
    createdAt: nowISO(),
    externalId: null,
    ack: 0,
    waStatus: 'queued',
    messageType: 'text',
    mediaUrl: '',
    mediaMime: '',
    remoteJid: chatId,
    fromMe: 1,
    waTimestamp: Math.floor(Date.now() / 1000),
    editedAt: '',
    revokedAt: '',
    deliveredAt: '',
    readAt: ''
  };
}

async function adoptEchoedSend(
  db: Database,
  conversation: Conversation,
  echoed: Message,
  queued: Message,
  text: string
): Promise<Message> {
  // The engine's outbound echo beat the send response and already owns the
  // `externalId`. When the phone-key lookup resolved it to a different (ghost)
  // conversation, adopt it back into the conversation the user actually sent
  // from and drop the stale `queued` row — so the chat box keeps its message.
  await updateById<Message>(db, 'messages', echoed.id, {
    conversationId: conversation.id
  });
  await deleteById(db, 'messages', queued.id);
  await touchConversation(db, conversation.id, queued.createdAt);
  return {
    ...echoed, id: echoed.id, conversationId: conversation.id, text
  } as Message;
}

async function resolveSendResult(
  db: Database,
  conversation: Conversation,
  message: Message,
  text: string,
  response: unknown
): Promise<Message> {
  const externalId = parseWahaMessageId(response);
  const echoed = externalId
    ? await messageByWahaId(db, externalId, null)
    : null;
  if (echoed) {
    return adoptEchoedSend(db, conversation, echoed, message, text);
  }
  const patch: Partial<Message> = externalId
    ? { externalId, waStatus: 'sent', ack: 0 }
    : { waStatus: 'queued', ack: 0 };
  await updateById(db, 'messages', message.id, patch);
  await touchConversation(db, conversation.id, message.createdAt);
  return { ...message, id: message.id, ...patch, text } as Message;
}

export function sendChatIdFor(conversation: Conversation): string | null {
  // `@lid` remote ids cannot be routed by the engine (only the peer phone
  // can), so they fall through to the phone rebuilt as `@c.us`.
  const remoteId = conversation.remoteId;
  if (
    remoteId &&
    !isWahaLidChat(remoteId) &&
    !isIgnoredChat(remoteId)
  ) {
    return remoteId;
  }
  const phone = parseWahaChatId(conversation.channelPhone);
  const e164 = phone ? wahaE164Phone(phone) : null;
  return e164 ? chatIdForPhone(e164) : null;
}