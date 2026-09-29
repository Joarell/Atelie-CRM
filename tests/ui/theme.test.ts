// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_STORAGE_KEY } from '../../src/domain/theme';
import {
  applyMode, currentMode, initMode, mountThemeToggle, readStoredMode, themeToggleHtml,
  toggleTheme, updateThemeToggle
} from '../../src/ui/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string): void => { map.set(key, value); },
    dump: (): Record<string, string> => Object.fromEntries(map)
  };
}

const throwingStorage = {
  getItem(): string | null { throw new Error('blocked'); },
  setItem(): void { throw new Error('blocked'); }
};

describe('theme DOM controller', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('currentMode reads data-theme and defaults to light', () => {
    expect(currentMode()).toBe('light');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentMode()).toBe('dark');
  });

  it('applyMode writes the data-theme attribute', () => {
    applyMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('readStoredMode only accepts light/dark', () => {
    expect(readStoredMode(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(readStoredMode(memoryStorage({ [THEME_STORAGE_KEY]: 'system' }))).toBeNull();
    expect(readStoredMode(memoryStorage())).toBeNull();
  });

  it('readStoredMode tolerates storage errors', () => {
    expect(readStoredMode(throwingStorage)).toBeNull();
  });

  it('initMode follows the stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(initMode()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggleTheme flips, applies and persists', () => {
    const storage = memoryStorage();
    document.documentElement.setAttribute('data-theme', 'light');

    expect(toggleTheme({ storage })).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(storage.dump()[THEME_STORAGE_KEY]).toBe('dark');

    expect(toggleTheme({ storage })).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(storage.dump()[THEME_STORAGE_KEY]).toBe('light');
  });

  it('toggleTheme still applies when persistence throws', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(toggleTheme({ storage: throwingStorage })).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('themeToggleHtml reflects the mode', () => {
    expect(themeToggleHtml('dark')).toContain('Tema: Escuro');
    expect(themeToggleHtml('dark')).toContain('☾');
    expect(themeToggleHtml('light')).toContain('Tema: Claro');
    expect(themeToggleHtml('light')).toContain('☀');
  });

  it('mountThemeToggle renders and wires a working button', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const slot = document.createElement('div');
    document.body.appendChild(slot);

    mountThemeToggle(slot);
    const button = slot.querySelector<HTMLElement>('[data-theme-toggle]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('☀');

    button!.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button!.textContent).toBe('☾');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    slot.remove();
  });

  it('restores the exact chosen theme across a reload round-trip', () => {
    // User toggles a mode (persisted to localStorage)...
    document.documentElement.setAttribute('data-theme', 'light');
    toggleTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // ...the page reloads (fresh <html>, no attribute yet)...
    document.documentElement.removeAttribute('data-theme');

    // ...and boot/initMode re-applies the stored choice, never the OS.
    const restored = initMode();
    expect(restored).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    toggleTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    document.documentElement.removeAttribute('data-theme');
    expect(initMode()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('updateThemeToggle is a no-op when there is no button', () => {
    expect(() => updateThemeToggle(document.createElement('div'), 'dark')).not.toThrow();
  });
});
