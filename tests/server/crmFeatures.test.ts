import type { Tag, AppointmentType } from '../../src/domain/crm';
import { describe, it, expect } from 'vitest';
import { FakeD1 } from '../helpers/fakeD1';
import { listEntities, insertEntity, updateEntity, getEntity, deleteEntity } from '../../src/server/crud';
import {
  CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE,
  CONVERSATION_NOTES_TABLE, CONVERSATION_NOTES_SHAPE,
  TAGS_TABLE, TAGS_SHAPE,
  APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE
} from '../../src/server/tables';

const activity = {
  id: 'a1', contactId: 'c1', dealId: 'd1', pivotId: '',
  action: 'message.sent', evidence: 'Oi', actorKind: 'user', actorUserId: 'u1',
  createdAt: '2026-09-01T10:00:00.000Z'
};

const note = {
  id: 'n1', conversationId: 'cv1', authorUserId: 'u1',
  body: 'Cliente pediu orçamento', createdAt: '2026-09-01T10:00:00.000Z'
};

const tag = { id: 't1', name: 'quente', color: 'ruber', ativo: true, createdAt: '2026-09-01T10:00:00.000Z' };

const appointmentType = { id: 'ap1', name: 'Degustação', color: 'gold', ativo: true, createdAt: '2026-09-01T10:00:00.000Z' };

describe('crm_lead_activities shape', () => {
  it('lists and maps rows through the shape', async () => {
    const db = FakeD1.with(CRM_ACTIVITIES_TABLE, [activity]);
    expect(await listEntities(db, CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE)).toEqual([activity]);
  });

  it('inserts and round-trips a row', async () => {
    const db = FakeD1.empty();
    const saved = await insertEntity(db, CRM_ACTIVITIES_TABLE, CRM_ACTIVITIES_SHAPE, activity);
    expect(saved.id).toBe('a1');
    expect(db.rows(CRM_ACTIVITIES_TABLE)).toHaveLength(1);
  });
});

describe('conversation_notes shape', () => {
  it('round-trips an insert', async () => {
    const db = FakeD1.empty();
    const saved = await insertEntity(db, CONVERSATION_NOTES_TABLE, CONVERSATION_NOTES_SHAPE, note);
    expect(saved.body).toBe('Cliente pediu orçamento');
    expect(db.rows(CONVERSATION_NOTES_TABLE)).toHaveLength(1);
  });

  it('deletes a row', async () => {
    const db = FakeD1.with(CONVERSATION_NOTES_TABLE, [note]);
    await deleteEntity(db, CONVERSATION_NOTES_TABLE, 'n1');
    expect(db.rows(CONVERSATION_NOTES_TABLE)).toHaveLength(0);
  });
});

describe('tags shape', () => {
  it('maps the ativo boolean through the shape both ways', async () => {
    const db = FakeD1.with(TAGS_TABLE, [tag]);
    const rows = await listEntities(db, TAGS_TABLE, TAGS_SHAPE);
    expect(rows).toEqual([tag]);

    const updated = await updateEntity<Tag>(db, TAGS_TABLE, TAGS_SHAPE, 't1', { ativo: false });
    expect(updated?.ativo).toBe(false);
    expect(db.rows(TAGS_TABLE)[0].ativo).toBe(0);
  });

  it('inserts a tag with a default ativo state', async () => {
    const db = FakeD1.empty();
    const saved = await insertEntity(db, TAGS_TABLE, TAGS_SHAPE, { ...tag, ativo: true });
    expect(saved.ativo).toBe(true);
    expect(db.rows(TAGS_TABLE)[0].ativo).toBe(1);
  });

  it('returns null for a missing tag', async () => {
    const db = FakeD1.with(TAGS_TABLE, [tag]);
    expect(await getEntity(db, TAGS_TABLE, TAGS_SHAPE, 'nope')).toBeNull();
  });
});

describe('appointment_types shape', () => {
  it('maps the ativo boolean and persists color', async () => {
    const db = FakeD1.with(APPOINTMENT_TYPES_TABLE, [appointmentType]);
    const rows = await listEntities(db, APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE);
    expect(rows).toEqual([appointmentType]);

    const updated = await updateEntity<AppointmentType>(db, APPOINTMENT_TYPES_TABLE, APPOINTMENT_TYPES_SHAPE, 'ap1', { color: 'mint' });
    expect(updated?.color).toBe('mint');
    expect(db.rows(APPOINTMENT_TYPES_TABLE)[0].color).toBe('mint');
  });
});