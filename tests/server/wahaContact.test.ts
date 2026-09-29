import { describe, it, expect } from 'vitest';
import { ensureWahaContact } from '../../src/server/wahaContact';
import { FakeD1 } from '../helpers/fakeD1';

describe('ensureWahaContact — sincronização de nome via WhatsApp', () => {
  it('AC-023: atualiza nome quando notifyName difere e nome atual é o telefone @spec:AC-023', async () => {
    const db = FakeD1.with('contacts', [
      {
        id: 'c1',
        name: '5511999999999',
        phone: '5511999999999',
        email: '',
        notes: '',
        tags: '[]',
        createdAt: 't0'
      }
    ]);
    const contact = await ensureWahaContact(db, '5511999999999', 'João Santos', 't1');
    expect(contact.name).toBe('João Santos');
    expect(db.rows('contacts')).toHaveLength(1);
    expect(db.rows('contacts')[0].name).toBe('João Santos');
  });

  it('AC-024: não altera nome quando notifyName é igual @spec:AC-024', async () => {
    const db = FakeD1.with('contacts', [
      {
        id: 'c1',
        name: 'João Silva',
        phone: '5511999999999',
        email: '',
        notes: '',
        tags: '[]',
        createdAt: 't0'
      }
    ]);
    const contact = await ensureWahaContact(db, '5511999999999', 'João Silva', 't1');
    expect(contact.name).toBe('João Silva');
    expect(db.rows('contacts')).toHaveLength(1);
  });

  it('AC-025: cria contato com notifyName quando número é novo @spec:AC-025', async () => {
    const db = FakeD1.empty();
    const contact = await ensureWahaContact(db, '5511888888888', 'Maria Souza', 't1');
    expect(contact.name).toBe('Maria Souza');
    expect(contact.phone).toBe('5511888888888');
    expect(db.rows('contacts')).toHaveLength(1);
    expect(db.rows('contacts')[0].name).toBe('Maria Souza');
  });

  it('AC-026: não sobrescreve nome quando notifyName está vazio @spec:AC-026', async () => {
    const db = FakeD1.with('contacts', [
      {
        id: 'c1',
        name: 'João Silva',
        phone: '5511999999999',
        email: '',
        notes: '',
        tags: '[]',
        createdAt: 't0'
      }
    ]);
    const contact = await ensureWahaContact(db, '5511999999999', null, 't1');
    expect(contact.name).toBe('João Silva');
    expect(db.rows('contacts')).toHaveLength(1);
  });

  it('AC-027: não sobrescreve nome definido pelo usuário @spec:AC-027', async () => {
    const db = FakeD1.with('contacts', [
      {
        id: 'c1',
        name: 'João Silva',
        phone: '5511999999999',
        email: '',
        notes: '',
        tags: '[]',
        createdAt: 't0'
      }
    ]);
    const contact = await ensureWahaContact(db, '5511999999999', 'João Santos', 't1');
    expect(contact.name).toBe('João Silva');
    expect(db.rows('contacts')).toHaveLength(1);
    expect(db.rows('contacts')[0].name).toBe('João Silva');
  });
});
