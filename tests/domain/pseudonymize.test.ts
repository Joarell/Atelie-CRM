import { describe, expect, it } from 'vitest';
import {
  pseudonymizePhone,
  pseudonymizeName,
  pseudonymizeEmail,
  pseudonymizeWahaPayload
} from '../../src/domain/pseudonymize';

describe('pseudonymize', () => {
  it('@spec:AC-016 pseudonymizePhone keeps country code and last 4 digits', () => {
    expect(pseudonymizePhone('+5511999998888')).toBe('+55XXXXXXX8888');
    expect(pseudonymizePhone('11999998888')).toBe('+11XXXXX8888');
  });

  it('@spec:AC-017 pseudonymizeName keeps first letter of each part', () => {
    expect(pseudonymizeName('Maria Silva')).toBe('M**** S****');
    expect(pseudonymizeName('Ana')).toBe('A**');
  });

  it('@spec:AC-018 pseudonymizeEmail keeps first letter and domain', () => {
    expect(pseudonymizeEmail('maria@email.com')).toBe('m****@email.com');
    expect(pseudonymizeEmail('joao.silva@empresa.com.br')).toBe('j*********@empresa.com.br');
  });

  it('@spec:AC-019 pseudonymizeWahaPayload masks known fields including nested', () => {
    const payload = {
      phone: '+5511999998888',
      name: 'Maria Silva',
      email: 'maria@email.com',
      _data: {
        from: '+5511999998888',
        pushName: 'Maria Silva'
      }
    };

    const result = pseudonymizeWahaPayload(payload) as Record<string, unknown>;

    expect(result.phone).toBe('+55XXXXXXX8888');
    expect(result.name).toBe('M**** S****');
    expect(result.email).toBe('m****@email.com');
    expect((result._data as Record<string, unknown>).from).toBe('+55XXXXXXX8888');
    expect((result._data as Record<string, unknown>).pushName).toBe('M**** S****');
  });
});
