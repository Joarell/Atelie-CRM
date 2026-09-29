import { describe, expect, it } from 'vitest';
import {
  FreshnessLog,
  NO_FRESHNESS,
  formatFreshness,
  freshnessLabel
} from '../../src/domain/dataFreshness';

describe('FreshnessLog', () => {
  it('reports no update for a menu it has never seen', () => {
    const log = new FreshnessLog();
    expect(log.has('/contatos')).toBe(false);
    expect(log.read('/contatos')).toBe(NO_FRESHNESS);
  });

  it('keeps one stamp per menu, independently', () => {
    const log = new FreshnessLog();
    log.touch('/contatos', 1000);
    log.touch('/funil', 2000);

    expect(log.read('/contatos')).toBe(1000);
    expect(log.read('/funil')).toBe(2000);
    expect(log.menus()).toEqual(['/contatos', '/funil']);
  });

  it('overwrites the stamp when the same menu changes again', () => {
    const log = new FreshnessLog();
    log.touch('/contatos', 1000);
    log.touch('/contatos', 5000);

    expect(log.read('/contatos')).toBe(5000);
    expect(log.menus()).toEqual(['/contatos']);
  });

  it('drops every stamp on clear', () => {
    const log = new FreshnessLog();
    log.touch('/contatos', 1000);
    log.clear();

    expect(log.has('/contatos')).toBe(false);
    expect(log.menus()).toEqual([]);
  });
});

describe('formatFreshness', () => {
  it('renders HH:MM:SS with zero padding', () => {
    const at = new Date(2026, 0, 2, 9, 5, 3).getTime();
    expect(formatFreshness(at)).toBe('09:05:03');
  });

  it('pads every component, not just the hour', () => {
    const at = new Date(2026, 0, 2, 23, 59, 59).getTime();
    expect(formatFreshness(at)).toBe('23:59:59');
  });
});

describe('freshnessLabel', () => {
  it('is empty for a menu that never changed', () => {
    const log = new FreshnessLog();
    expect(freshnessLabel(log, '/tarefas')).toBe('');
  });

  it('is the clock time once the menu has a stamp', () => {
    const log = new FreshnessLog();
    const at = new Date(2026, 0, 2, 14, 30, 0).getTime();
    log.touch('/tarefas', at);
    expect(freshnessLabel(log, '/tarefas')).toBe('14:30:00');
  });
});
