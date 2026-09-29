import {
  THEME_STORAGE_KEY, isThemeMode, modeIcon, modeLabel, nextMode, preferredMode,
  type ThemeMode
} from '../domain/theme';


// DOM side of the theme: reads the stored choice, applies `data-theme` on
// <html> (the attribute every token block keys off) and owns the toggle
// button. The decision logic lives in src/domain/theme.ts; this file only
// touches storage/DOM, so it is thin and testable with happy-dom.

export function readStoredMode(
  storage: Pick<Storage, 'getItem'> = localStorage
): ThemeMode | null {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null; // storage disabled (private mode, blocked cookies...)
  }
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function currentMode(
  root: HTMLElement = document.documentElement
): ThemeMode {
  return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyMode(
  mode: ThemeMode,
  root: HTMLElement = document.documentElement
): void {
  root.setAttribute('data-theme', mode);
}

// Used by tests/SSR-free boot: resolve stored + OS preference and apply it.
export function initMode(): ThemeMode {
  const mode = preferredMode(readStoredMode(), systemPrefersDark());
  applyMode(mode);
  return mode;
}

export function toggleTheme(options: {
  storage?: Pick<Storage, 'setItem'>;
  root?: HTMLElement;
} = {}): ThemeMode {
  const root = options.root ?? document.documentElement;
  const storage = options.storage ?? localStorage;
  const mode = nextMode(currentMode(root));
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Applying the mode still works even when it cannot be persisted.
  }
  applyMode(mode, root);
  return mode;
}

export function themeToggleHtml(mode: ThemeMode): string {
  const title = `Tema: ${modeLabel(mode)}`;
  const label = `Alternar tema (atual: ${modeLabel(mode)})`;
  return (
    '<button class="btn btn-ghost btn-icon theme-toggle" ' +
    'data-theme-toggle type="button"\n' +
    `    title="${title}" aria-label="${label}">` +
    modeIcon(mode) + '</button>'
  );
}

export function updateThemeToggle(
  root: ParentNode | HTMLElement,
  mode: ThemeMode
): void {
  const button = root.querySelector<HTMLElement>('[data-theme-toggle]');
  if (!button) return;
  button.innerHTML = modeIcon(mode);
  button.title = `Tema: ${modeLabel(mode)}`;
  const label = `Alternar tema (atual: ${modeLabel(mode)})`;
  button.setAttribute('aria-label', label);
}

export function mountThemeToggle(slot: HTMLElement): void {
  slot.innerHTML = themeToggleHtml(currentMode());
  const button = slot.querySelector<HTMLElement>('[data-theme-toggle]');
  button?.addEventListener('click', () => {
    updateThemeToggle(slot, toggleTheme());
  });
}