import { describe, it, expect, vi } from 'vitest';
import type { WahaClient } from '../../src/server/waha';
import {
  dispatchWahaEvent,
  handleInboundMessage,
  insertWahaMessage,
  sendChatIdFor,
  sendWahaText,
  WahaSendError
} from '../../src/server/wahaIngest';
import { FakeD1 } from '../helpers/fakeD1';

const INBOUND = {
  event: 'message.any',
  session: 'default',
  payload: {
    id: 'true_5511999999999@c.us_3A30B5E2A7B9E6C1D4F',
    from: '5511999999999@c.us',
    to: '5531999999999@c.us',
    body: 'Olá',
    type: 'text',
    ack: 0,
    timestamp: 1750000000,
    fromMe: false,
    hasMedia: false,
    _data: { notifyName: 'Maria', key: { remoteJidAlt: '5511999999999' } }
  }
};

describe('handleInboundMessage / handleOutboundEcho', () => {
  it('creates contact + conversation + inbound message, then dedups on replay', async () => {
    const db = FakeD1.empty();
    const first = await handleInboundMessage(db, INBOUND);
    expect(first).not.toBeNull();
    expect(first!.direction).toBe('inbound');
    expect(db.rows('contacts')).toHaveLength(1);
    expect(db.rows('contacts')[0].name).toBe('Maria');
    expect(db.rows('contacts')[0].phone).toBe('5511999999999');
    expect(db.rows('conversations')).toHaveLength(1);
    expect(db.rows('conversations')[0].remoteId).toBe('5511999999999@c.us');
    expect(db.rows('messages')).toHaveLength(1);
    expect(db.rows('messages')[0].externalId).toBe('3A30B5E2A7B9E6C1D4F');

    const again = await handleInboundMessage(db, INBOUND);
    expect(again!.id).toBe(first!.id);
    expect(db.rows('messages')).toHaveLength(1);
    expect(db.rows('contacts')).toHaveLength(1);
  });

  it('stores the bare id even when WAHA already sent a bare form', async () => {
    const db = FakeD1.empty();
    const message = await handleInboundMessage(db, {
      ...INBOUND,
      payload: { ...INBOUND.payload, id: '3A30B5E2A7B9E6C1D4F' }
    });
    expect(message!.externalId).toBe('3A30B5E2A7B9E6C1D4F');
  });

  it('stamps now — never the epoch — for a payload without a timestamp', async () => {
    // A real engine delivery may omit `timestamp`; the receive path must
    // not coerce that into 1970-01-01 (the Unix epoch is a *valid* Date and
    // would sort the new bubble to the top of the thread and sink the
    // conversation to the bottom of the inbox list).
    const db = FakeD1.empty();
    const payload = { ...INBOUND.payload };
    delete (payload as Record<string, unknown>).timestamp;
    const message = await handleInboundMessage(db, { ...INBOUND, payload });
    expect(message).not.toBeNull();
    expect(message!.waTimestamp).toBe(0);
    expect(message!.createdAt).not.toBe('1970-01-01T00:00:00.000Z');
    expect(Date.parse(message!.createdAt)).toBeGreaterThan(0);
    expect(db.rows('conversations')[0].lastMessageAt).toBe(
      message!.createdAt
    );
  });

  it('resolves the real phone for an @lid sender instead of the lid digits', async () => {
    const db = FakeD1.empty();
    await handleInboundMessage(db, {
      ...INBOUND,
      payload: {
        ...INBOUND.payload,
        id: 'false_176369157804064@lid_AC73A4448DFAC1A87C12DBA46E0C1A2C',
        from: '176369157804064@lid',
        _data: {
          notifyName: 'Oji R7',
          key: {
            remoteJid: '176369157804064@lid',
            remoteJidAlt: '6281234567890@s.whatsapp.net'
          }
        }
      }
    });
    const contact = db.rows('contacts')[0];
    expect(contact.name).toBe('Oji R7');
    expect(contact.phone).toBe('6281234567890');
    expect(db.rows('conversations')[0].remoteId).toBe('176369157804064@lid');
    expect(db.rows('messages')[0].externalId).toBe('AC73A4448DFAC1A87C12DBA46E0C1A2C');
  });

  it('reuses a contact stored with a national phone — no duplicate for a new number', async () => {
    const db = FakeD1.with('contacts', [
      {
        id: 'c-existing',
        name: 'Maria',
        phone: '11999999999',
        email: '',
        notes: '',
        tags: '[]',
        createdAt: 't0'
      }
    ]);
    const message = await handleInboundMessage(db, INBOUND);
    expect(message).not.toBeNull();
    expect(db.rows('contacts')).toHaveLength(1);
    expect(db.rows('contacts')[0].id).toBe('c-existing');
    expect(db.rows('conversations')![0].contactId).toBe('c-existing');
  });

  it('refuses group/broadcast chats without touching the db', async () => {
    const db = FakeD1.empty();
    const message = await handleInboundMessage(db, {
      ...INBOUND,
      payload: { ...INBOUND.payload, from: '5511999999999@g.us' }
    });
    expect(message).toBeNull();
    expect(db.rows('conversations')).toHaveLength(0);
  });

  it('refuses messages without a resolvable phone or id', async () => {
    const db = FakeD1.empty();
    await expect(handleInboundMessage(db, { ...INBOUND, payload: { ...INBOUND.payload, from: '' } })).resolves.toBeNull();
    await expect(handleInboundMessage(db, { ...INBOUND, payload: { ...INBOUND.payload, id: '' } })).resolves.toBeNull();
    expect(db.rows('messages')).toHaveLength(0);
  });

  it('echoes an outbound message without overwriting the contact name', async () => {
    const db = FakeD1.empty();
    await dispatchWahaEvent(db, {
      event: 'message.any',
      payload: {
        id: 'true_5511999999999@c.us_DEADBEEF',
        to: '5511999999999@c.us',
        body: 'Estamos a caminho!',
        type: 'text',
        ack: 1,
        timestamp: 1750000001,
        fromMe: true,
        _data: { notifyName: 'Minha Loja' }
      }
    });
    const message = db.rows('messages')[0];
    expect(message.direction).toBe('outbound');
    expect(message.fromMe).toBe(1);
    expect(message.text).toBe('Estamos a caminho!');
    expect(db.rows('contacts')[0].name).toBe('5511999999999');
  });
});

describe('delivery events (ack / edited / revoked / session)', () => {
  it('marks a message delivered then read as acks climb', async () => {
    const db = FakeD1.empty();
    await handleInboundMessage(db, INBOUND);
    await dispatchWahaEvent(db, {
      event: 'message.ack',
      payload: { id: 'true_5511999999999@c.us_3A30B5E2A7B9E6C1D4F', ack: 2 }
    });
    const delivered = db.rows('messages')[0];
    expect(delivered.waStatus).toBe('delivered');
    expect(delivered.deliveredAt).toBeTruthy();

    await dispatchWahaEvent(db, {
      event: 'message.ack',
      payload: { id: '3A30B5E2A7B9E6C1D4F', ack: 3 }
    });
    const read = db.rows('messages')[0];
    expect(read.waStatus).toBe('read');
    expect(read.readAt).toBeTruthy();
  });

  it('updates text on edit and stamps revokedAt on revoke', async () => {
    const db = FakeD1.empty();
    await handleInboundMessage(db, INBOUND);
    await dispatchWahaEvent(db, {
      event: 'message.edited',
      payload: { editedMessageId: '3A30B5E2A7B9E6C1D4F', body: 'Texto editado' }
    });
    expect(db.rows('messages')[0].text).toBe('Texto editado');
    expect(db.rows('messages')[0].editedAt).toBeTruthy();

    await dispatchWahaEvent(db, {
      event: 'message.revoked',
      payload: { revokedMessageId: '3A30B5E2A7B9E6C1D4F' }
    });
    expect(db.rows('messages')[0].revokedAt).toBeTruthy();
  });

  it('mirrors session status as a single upserted row', async () => {
    const db = FakeD1.empty();
    await dispatchWahaEvent(db, { event: 'session.status', session: 'default', payload: { status: 'WORKING' } });
    expect(db.rows('waha_sessions')).toHaveLength(1);
    expect(db.rows('waha_sessions')[0].status).toBe('WORKING');

    await dispatchWahaEvent(db, { event: 'session.status', session: 'default', payload: { status: 'STOPPED' } });
    expect(db.rows('waha_sessions')).toHaveLength(1);
    expect(db.rows('waha_sessions')[0].status).toBe('STOPPED');
  });

  it('ignores unknown statuses and never throws on malformed events', async () => {
    const db = FakeD1.empty();
    await expect(
      dispatchWahaEvent(db, { event: 'session.status', session: 'default', payload: { status: 'WEIRD' } })
    ).resolves.toBeUndefined();
    await expect(dispatchWahaEvent(db, { event: 'something.else', payload: {} })).resolves.toBeUndefined();
    await expect(dispatchWahaEvent(db, { event: 'message.any' } as never)).resolves.toBeUndefined();
  });
});

describe('insertWahaMessage — unique external id', () => {
  it('ignores a concurrent duplicate insert instead of crashing on the unique index', async () => {
    const db = FakeD1.empty();
    const row = {
      id: 'a', conversationId: 'c1', direction: 'outbound' as const,
      text: 'oi', createdBy: 'u1', createdAt: 't0', externalId: 'DUPID'
    };
    await insertWahaMessage(db, row as never);
    const dup = await insertWahaMessage(db, { ...row, id: 'b' } as never);
    expect(db.rows('messages')).toHaveLength(1);
    expect(dup.id).toBe('a');
  });
});

describe('sendChatIdFor', () => {
  it('prefers a stored remote jid, then rebuilds @c.us from digits', () => {
    expect(sendChatIdFor({ channel: 'whatsapp', remoteId: '5511999999999@c.us', channelPhone: 'x' } as never)).toBe(
      '5511999999999@c.us'
    );
    expect(sendChatIdFor({ channel: 'whatsapp', remoteId: '', channelPhone: '5511999999999' } as never)).toBe(
      '5511999999999@c.us'
    );
    expect(sendChatIdFor({ channel: 'whatsapp', remoteId: '', channelPhone: '' } as never)).toBeNull();
    expect(sendChatIdFor({ channel: 'whatsapp', remoteId: '55111@g.us', channelPhone: '5511999999999' } as never)).toBe(
      '5511999999999@c.us'
    );
  });

  it('never sends to an @lid remote id — rebuilds @c.us from the phone', () => {
    expect(
      sendChatIdFor({ channel: 'whatsapp', remoteId: '176369157804064@lid', channelPhone: '6281234567890' } as never)
    ).toBe('6281234567890@c.us');
  });

  it('rebuilds the E.164 jid for a new number stored with a national phone', () => {
    expect(
      sendChatIdFor({ channel: 'whatsapp', remoteId: '', channelPhone: '(11) 98570-9355' } as never)
    ).toBe('5511985709355@c.us');
    expect(
      sendChatIdFor({ channel: 'whatsapp', remoteId: '', channelPhone: '11985709355' } as never)
    ).toBe('5511985709355@c.us');
  });
});

describe('sendWahaText', () => {
  const conversation = {
    id: 'c1',
    contactId: 'ct1',
    channel: 'whatsapp',
    channelPhone: '5511999999999',
    remoteId: '5511999999999@c.us',
    lastMessageAt: '',
    assignedUserId: '',
    status: 'open',
    snoozedUntil: '',
    createdAt: ''
  };

  function client(opts: { ok: boolean; result?: unknown }): WahaClient {
    const sendText = vi.fn(async () => {
      if (!opts.ok) throw new Error('waha_send_500');
      return opts.result;
    });
    return { session: 'default', sendText } as unknown as WahaClient & { sendText: ReturnType<typeof vi.fn> };
  }

  it('queues the message, then flips it to sent with the bare external id', async () => {
    const db = FakeD1.with('conversations', [conversation]);
    const c = client({ ok: true, result: 'true_5511999999999@c.us_SENTID' });
    const message = await sendWahaText(db, c, { conversationId: 'c1', text: 'oi', userId: 'u1' });

    expect(message.waStatus).toBe('sent');
    expect(message.externalId).toBe('SENTID');
    expect(db.rows('messages')).toHaveLength(1);
    const row = db.rows('messages')[0];
    expect(row.direction).toBe('outbound');
    expect(row.waStatus).toBe('sent');
    expect(row.externalId).toBe('SENTID');
    expect(row.createdBy).toBe('u1');
    expect(db.rows('conversations')[0].lastMessageAt).toBeTruthy();
    expect(c.sendText).toHaveBeenCalledWith('default', '5511999999999@c.us', 'oi', null);
  });

  it('passes a reply id through to the engine', async () => {
    const db = FakeD1.with('conversations', [conversation]);
    const c = client({ ok: true, result: 'true_5511999999999@c.us_SENTID' });
    await sendWahaText(db, c, { conversationId: 'c1', text: 'oi', userId: 'u1', replyTo: 'true_1@c.us_PREV' });
    expect(c.sendText).toHaveBeenCalledWith('default', '5511999999999@c.us', 'oi', 'true_1@c.us_PREV');
  });

  it('marks the row failed and rethrows when WAHA rejects', async () => {
    const db = FakeD1.with('conversations', [conversation]);
    await expect(
      sendWahaText(db, client({ ok: false }), { conversationId: 'c1', text: 'oi', userId: 'u1' })
    ).rejects.toThrow('waha_send_500');
    expect(db.rows('messages')[0].waStatus).toBe('failed');
  });

  it('keeps the echo row in the sent conversation even when the echo landed in a ghost', async () => {
    const db = FakeD1.from({
      conversations: [conversation],
      messages: [{
        id: 'echo-1', conversationId: 'ghost-1', direction: 'outbound',
        text: 'oi', createdBy: 'u1', createdAt: 't0', externalId: 'SENTID',
        ack: 1, waStatus: 'sent', messageType: 'text', mediaUrl: '',
        mediaMime: '', remoteJid: '5511999999999@c.us', fromMe: 1,
        waTimestamp: 0, editedAt: '', revokedAt: '', deliveredAt: '', readAt: ''
      }]
    });
    const c = client({ ok: true, result: 'true_5511999999999@c.us_SENTID' });
    const message = await sendWahaText(db, c, { conversationId: 'c1', text: 'oi', userId: 'u1' });

    expect(message.id).toBe('echo-1');
    expect(message.conversationId).toBe('c1');
    expect(message.externalId).toBe('SENTID');
    const rows = db.rows('messages');
    expect(rows).toHaveLength(1);
    expect(rows[0].conversationId).toBe('c1');
    expect(rows[0].externalId).toBe('SENTID');
    expect(rows[0].waStatus).toBe('sent');
  });

  it('keeps the queued row even where bare .run() writes are dropped', async () => {
    // Reproduces the dev-worker quirk: single `.prepare().run()` writes are
    // silently lost from the send route while `batch()` persists. The send
    // path must write through batch, so a dropped direct .run() never shows.
    const db = FakeD1.from({
      conversations: [{ ...conversation }],
      messages: []
    });
    const prepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const stmt = prepare(sql);
      stmt.run = () => Promise.reject(new Error('bare .run() dropped'));
      return stmt;
    }) as typeof db.prepare;
    db.batch = (async (statements: unknown[]) => {
      for (const statement of statements) {
        const s = statement as {
          db: FakeD1; sql: string; values: unknown[];
        };
        s.db.execute(s.sql, s.values);
      }
      return [];
    }) as typeof db.batch;

    const c = client({ ok: true, result: 'true_5511999999999@c.us_SENTID' });
    const message = await sendWahaText(db, c, {
      conversationId: 'c1', text: 'oi', userId: 'u1'
    });

    expect(message.waStatus).toBe('sent');
    expect(message.externalId).toBe('SENTID');
    expect(db.rows('messages')).toHaveLength(1);
    const row = db.rows('messages')[0];
    expect(row.waStatus).toBe('sent');
    expect(row.externalId).toBe('SENTID');
    expect(db.rows('conversations')[0].lastMessageAt).toBeTruthy();
  });

  it('persists a send even when a failed row already holds an empty external id', async () => {
    // Regression: the queued row used to be inserted with externalId '' —
    // which collides on the partial index `WHERE externalId IS NOT NULL`,
    // so `INSERT OR IGNORE` silently dropped every later send. Queued rows
    // must use NULL until the engine returns a real id.
    const db = FakeD1.from({
      conversations: [conversation],
      messages: [{
        id: 'stale-failed', conversationId: 'c1', direction: 'outbound',
        text: 'antiga', createdBy: 'u1', createdAt: 't0', externalId: '',
        ack: 0, waStatus: 'failed', messageType: 'text', mediaUrl: '',
        mediaMime: '', remoteJid: '5511999999999@c.us', fromMe: 1,
        waTimestamp: 0, editedAt: '', revokedAt: '', deliveredAt: '', readAt: ''
      }]
    });
    const c = client({ ok: true, result: 'true_5511999999999@c.us_SENTID2' });
    const message = await sendWahaText(db, c, {
      conversationId: 'c1', text: 'oi', userId: 'u1'
    });

    const rows = db.rows('messages');
    expect(rows).toHaveLength(2);
    const queued = rows.find((r) => r.id === message.id);
    expect(queued).toBeDefined();
    expect(queued!.id).not.toBe('stale-failed');
    expect(queued!.waStatus).toBe('sent');
    expect(queued!.externalId).toBe('SENTID2');
    expect(queueAndSentRowsAreDistinct(rows)).toBe(true);
  });

  function queueAndSentRowsAreDistinct(rows: Record<string, unknown>[]): boolean {
    return rows.filter((r) => r.waStatus === 'sent').length === 1;
  }

  it('refuses non-whatsapp conversations and missing conversations', async () => {
    const db = FakeD1.with('conversations', [{ ...conversation, channel: 'email' }]);
    await expect(sendWahaText(db, client({ ok: true }), { conversationId: 'c1', text: 'x', userId: 'u' })).rejects.toMatchObject({
      code: 'wrong_channel'
    } as WahaSendError);
    const empty = FakeD1.empty();
    await expect(sendWahaText(empty, client({ ok: true }), { conversationId: 'nope', text: 'x', userId: 'u' })).rejects.toMatchObject({
      code: 'conversation_not_found'
    } as WahaSendError);
  });

  it('refuses a conversation without a number', async () => {
    const db = FakeD1.with('conversations', [{ ...conversation, channelPhone: '', remoteId: '' }]);
    await expect(sendWahaText(db, client({ ok: true }), { conversationId: 'c1', text: 'x', userId: 'u' })).rejects.toMatchObject({
      code: 'missing_phone'
    } as WahaSendError);
  });
});