import { readFileSync } from 'node:fs';

/**
 * Parses a dotenv file into a flat record.
 *
 * The live WAHA tiers must judge the SAME config the app uses. In dev that
 * config lives in `.dev.vars` (the file the dev server loads), not in
 * `process.env` — so a tier that only reads `process.env` silently skips and
 * reports green while proving nothing.
 */
export function dotEnv(file: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = unquote(match[2]);
  }
  return out;
}

/** Real env vars win over the file, so CI can point the tier elsewhere. */
export function wahaSourceFrom(file = '.dev.vars'): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') overrides[key] = value;
  }
  return { ...dotEnv(file), ...overrides };
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}