import { describe, it, expect } from 'vitest';
import {
  THEME_STORAGE_KEY, isThemeMode, modeIcon, modeLabel, nextMode, preferredMode
} from '../../src/domain/theme';

describe('isThemeMode', () => {
  it('accepts the two explicit modes', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['system', '', null, undefined, 1, {}, []]) {
      expect(isThemeMode(value)).toBe(false);
    }
  });
});

describe('preferredMode', () => {
  it('honours an explicit stored choice over the OS preference', () => {
    expect(preferredMode('light', true)).toBe('light');
    expect(preferredMode('dark', false)).toBe('dark');
  });

  it('follows the OS preference when nothing valid is stored', () => {
    expect(preferredMode(null, true)).toBe('dark');
    expect(preferredMode(undefined, false)).toBe('light');
    expect(preferredMode('system', true)).toBe('dark');
    expect(preferredMode('nonsense', false)).toBe('light');
  });
});

describe('nextMode', () => {
  it('flips between the two modes', () => {
    expect(nextMode('light')).toBe('dark');
    expect(nextMode('dark')).toBe('light');
  });
});

describe('labels and icons', () => {
  it('describes each mode for the toggle', () => {
    expect(modeLabel('dark')).toBe('Escuro');
    expect(modeLabel('light')).toBe('Claro');
    expect(modeIcon('dark')).toBe('☾');
    expect(modeIcon('light')).toBe('☀');
  });
});

describe('storage key', () => {
  it('matches the key read by the no-flash script in BaseLayout.astro', () => {
    expect(THEME_STORAGE_KEY).toBe('deskcomm-theme');
  });
});
