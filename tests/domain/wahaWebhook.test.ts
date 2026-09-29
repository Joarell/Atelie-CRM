import { describe, it, expect } from 'vitest';
import {
  ackToWahaStatus,
  bareWaMessageId,
  chatIdForPhone,
  isIgnoredChat,
  isWahaAckEvent,
  isWahaEditedEvent,
  isWahaLidChat,
  isWahaMessageEvent,
  isWahaRevokedEvent,
  isWahaSessionEvent,
  parseWahaChatId,
  parseWahaEnvelope,
  parseWahaMessageId,
  phoneFromWahaKey,
  routeWahaEvent,
  waNotifyName,
  waTimestampToISO,
  wahaE164Phone,
  wahaEchoExternalIds,
  wahaPeerPhone
} from '../../src/domain/wahaWebhook';

const MESSAGE = {
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
    hasMedia: false
  }
};

describe('routeWahaEvent — stage 1 (archive routing facts only)', () => {
  it('extracts event, session and the raw payload id', () => {
    expect(routeWahaEvent(MESSAGE)).toEqual({
      event: 'message.any',
      session: 'default',
      id: 'true_5511999999999@c.us_3A30B5E2A7B9E6C1D4F'
    });
  });

  it('is null for anything that is not an event envelope', () => {
    expect(routeWahaEvent(null)).toBeNull();
    expect(routeWahaEvent({})).toBeNull();
    expect(routeWahaEvent({ session: 'default' })).toBeNull();
    expect(routeWahaEvent({ event: '' })).toBeNull();
  });

  it('tolerates a missing payload id (still routable, thus archivable)', () => {
    expect(routeWahaEvent({ event: 'message.ack', payload: {} })).toEqual({ event: 'message.ack', session: '', id: undefined });
  });
});

describe('parseWahaEnvelope — stage 2 (interpreted contract)', () => {
  it('parses a full message envelope', () => {
    const envelope = parseWahaEnvelope(MESSAGE)!;
    expect(envelope.event).toBe('message.any');
    expect(envelope.session).toBe('default');
    expect(envelope.payload?.id).toBe('true_5511999999999@c.us_3A30B5E2A7B9E6C1D4F');
    expect(envelope.payload?.fromMe).toBe(false);
    expect(envelope.payload?._data).toBeUndefined();
  });

  it('keeps notifyName and the alt phone from _data', () => {
    const envelope = parseWahaEnvelope({
      event: 'message.any',
      payload: { _data: { notifyName: 'Maria', key: { remoteJidAlt: '5511999999999' } } }
    })!;
    expect(envelope.payload?._data).toEqual({
      notifyName: 'Maria',
      key: { remoteJidAlt: '5511999999999' }
    });
  });

  it('returns null when the event field is absent', () => {
    expect(parseWahaEnvelope({ session: 'default', payload: {} })).toBeNull();
    expect(parseWahaEnvelope(null)).toBeNull();
  });

  it('never rejects the payload on a field the app does not consume', () => {
    const envelope = parseWahaEnvelope({
      event: 'message.any',
      payload: { id: 'x', body: 'oi', fromMe: false, weird: { nested: [1, 2] }, _data: { message: { anything: true } } }
    })!;
    expect(envelope.payload?.body).toBe('oi');
  });
});

describe('parseWahaMessageId / bareWaMessageId / wahaEchoExternalIds — id reconciliation', () => {
  it('strips the fromMe + jid prefix down to the bare id', () => {
    expect(bareWaMessageId('true_5511999999999@c.us_3A30B5E2A7B9E6C1D4F')).toBe('3A30B5E2A7B9E6C1D4F');
    expect(bareWaMessageId('false_5511999999999@c.us_DEADBEEF')).toBe('DEADBEEF');
  });

  it('passes a bare id through untouched', () => {
    expect(bareWaMessageId('3A30B5E2A7B9E6C1D4F')).toBe('3A30B5E2A7B9E6C1D4F');
  });

  it('parseWahaMessageId returns the bare id for full or bare, null for junk', () => {
    expect(parseWahaMessageId('true_5511999999999@c.us_ABC')).toBe('ABC');
    expect(parseWahaMessageId('ABC')).toBe('ABC');
    expect(parseWahaMessageId(null)).toBeNull();
    expect(parseWahaMessageId({})).toBeNull();
    expect(parseWahaMessageId('')).toBeNull();
  });

  it('wahaEchoExternalIds returns the candidate forms a stored id may match', () => {
    const candidates = wahaEchoExternalIds('true_5511999999999@c.us_ABC', '5511999999999');
    expect(candidates).toContain('true_5511999999999@c.us_ABC');
    expect(candidates).toContain('ABC');
    for (const candidate of [...new Set(candidates)]) {
      expect(candidates.filter((c) => c === candidate)).toHaveLength(1);
    }
  });
});

describe('parseWahaChatId / chatIdForPhone / isIgnoredChat / phoneFromWahaKey', () => {
  it('extracts the digits from a c.us jid', () => {
    expect(parseWahaChatId('5511999999999@c.us')).toBe('5511999999999');
    expect(parseWahaChatId('5511999999999@lid')).toBe('5511999999999');
  });

  it('rejects out-of-range or useless phone shapes', () => {
    expect(parseWahaChatId('')).toBeNull();
    expect(parseWahaChatId('@c.us')).toBeNull();
    expect(parseWahaChatId('555@c.us')).toBeNull();
    expect(parseWahaChatId(null)).toBeNull();
  });

  it('rebuilds the c.us jid from digits', () => {
    expect(chatIdForPhone('5511999999999')).toBe('5511999999999@c.us');
  });

  it('rebuilds the BR country code for national-format phones', () => {
    expect(wahaE164Phone('11985709355')).toBe('5511985709355');
    expect(wahaE164Phone('(11) 98570-9355')).toBe('5511985709355');
  });

  it('passes through already-international and foreign phones', () => {
    expect(wahaE164Phone('5511985709355')).toBe('5511985709355');
    expect(wahaE164Phone('5511999990001')).toBe('5511999990001');
    expect(wahaE164Phone('6281234567890')).toBe('6281234567890');
  });

  it('refuses empty phone shapes', () => {
    expect(wahaE164Phone('')).toBeNull();
    expect(wahaE164Phone(null)).toBeNull();
    expect(wahaE164Phone(undefined)).toBeNull();
  });

  it('flags group/broadcast/channel chats as ignored', () => {
    expect(isIgnoredChat('55111@g.us')).toBe(true);
    expect(isIgnoredChat('status@broadcast')).toBe(true);
    expect(isIgnoredChat('120363000@newsletter')).toBe(true);
    expect(isIgnoredChat('5511999999999@c.us')).toBe(false);
    expect(isIgnoredChat(undefined)).toBe(true);
  });

  it('reads the alt phone the engine sends alongside an @lid chat', () => {
    expect(phoneFromWahaKey({ _data: { key: { remoteJidAlt: '5511999999999' } } })).toBe('5511999999999');
    expect(phoneFromWahaKey({})).toBeNull();
  });

  it('reads the peer phone from the plain NOWEB key names too', () => {
    const key = { remoteJid: '447770123123@s.whatsapp.net', participant: '33333@s.whatsapp.net' };
    expect(phoneFromWahaKey({ _data: { key } })).toBe('447770123123');
    expect(phoneFromWahaKey({ _data: { key: { participant: '5511999999999@s.whatsapp.net' } } })).toBe('5511999999999');
  });

  it('recognizes @lid chat ids', () => {
    expect(isWahaLidChat('176369157804064@lid')).toBe(true);
    expect(isWahaLidChat('5511999999999@c.us')).toBe(false);
    expect(isWahaLidChat(undefined)).toBe(false);
  });

  it('resolves @lid peers through the key phone instead of the lid digits', () => {
    expect(
      wahaPeerPhone('176369157804064@lid', {
        _data: { key: { remoteJidAlt: '6281234567890@s.whatsapp.net' } }
      })
    ).toBe('6281234567890');
    expect(wahaPeerPhone('176369157804064@lid', {})).toBe('176369157804064');
    expect(wahaPeerPhone('5511999999999@c.us', {})).toBe('5511999999999');
    expect(wahaPeerPhone('', {})).toBeNull();
  });
});

describe('ackToWahaStatus / waTimestampToISO / waNotifyName', () => {
  it('maps ack numbers to the CRM delivery words', () => {
    expect(ackToWahaStatus(0)).toBe('sent');
    expect(ackToWahaStatus(1)).toBe('sent');
    expect(ackToWahaStatus(2)).toBe('delivered');
    expect(ackToWahaStatus(3)).toBe('read');
    expect(ackToWahaStatus(99)).toBe('read');
  });

it('converts WAHA epoch seconds to ISO', () => {
		expect(waTimestampToISO(1750000000)).toBe('2025-06-15T15:06:40.000Z');
		expect(waTimestampToISO(0)).toBe('');
		expect(waTimestampToISO(-1)).toBe('');
		expect(waTimestampToISO('nope')).toBe('');
		expect(waTimestampToISO(undefined)).toBe('');
	});

  it('reads the display name from _data', () => {
    expect(waNotifyName({ _data: { notifyName: ' Maria ' } })).toBe('Maria');
    expect(waNotifyName({ _data: {} })).toBeNull();
    expect(waNotifyName({})).toBeNull();
  });
});

describe('event classifiers', () => {
  it('recognizes message / message.any, ack, edited, revoked and session kinds', () => {
    expect(isWahaMessageEvent('message.any')).toBe(true);
    expect(isWahaMessageEvent('message')).toBe(true);
    expect(isWahaMessageEvent('message.ack')).toBe(false);
    expect(isWahaAckEvent('message.ack')).toBe(true);
    expect(isWahaEditedEvent('message.edited')).toBe(true);
    expect(isWahaRevokedEvent('message.revoked')).toBe(true);
    expect(isWahaSessionEvent('session.status')).toBe(true);
    expect(isWahaSessionEvent('state.change')).toBe(true);
  });
});