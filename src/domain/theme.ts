// Dark/light theme is a pure two-mode concern: the tab remembers an explicit
// choice, but the first visit follows the OS. Keeping the decision here (no
// DOM) makes it unit-testable; `src/ui/theme.ts` applies the result.
export type ThemeMode = 'light' | 'dark';

// Icon name (see src/ui/icons.ts) shown on the toggle for each mode.
export type ThemeIcon = '☾' | '☀';

export const THEME_STORAGE_KEY = 'deskcomm-theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

// No stored choice means "follow the system"; once the user picks a side we
// keep it regardless of the OS setting.
export function preferredMode(
  stored: unknown,
  prefersDark: boolean
): ThemeMode {
  if (isThemeMode(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextMode(mode: ThemeMode): ThemeMode {
  return mode === 'dark' ? 'light' : 'dark';
}

export function modeLabel(mode: ThemeMode): string {
  return mode === 'dark' ? 'Escuro' : 'Claro';
}

export function modeIcon(mode: ThemeMode): ThemeIcon {
  return mode === 'dark' ? '☾' : '☀';
}
