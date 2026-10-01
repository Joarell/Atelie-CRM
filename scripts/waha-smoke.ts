// Live connection test against a running WAHA server.
//
// Not part of `npm test` — that suite must stay deterministic and offline.
// Run it by hand (see docs/whatsapp-waha.md):
//
//   bun run scripts/waha-smoke.ts
//
// Exits 0 when the server is reachable AND the API key is accepted. A paired
// session is NOT required: an unpaired session legitimately reports
// `sessao_sem_conexao: SCAN_QR_CODE`, which still proves the connection.
//
// The config comes from `.dev.vars` — the same file the dev server loads — NOT
// from a hardcoded fallback key. Inventing one here made this probe report
// `saudavel true` while the app itself got 401 on every call, i.e. a green the
// app could not reproduce. A real env var still wins, so CI can point elsewhere.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readWahaConfig, WahaClient } from '../src/server/waha';

function dotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(resolve(file), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
}

const overrides = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
);

const source = { ...dotEnv('.dev.vars'), ...overrides };
const config = readWahaConfig(source);
if (!config) {
  console.error('WAHA nao configurado: defina WAHA_API_BASE_URL e WAHA_API_KEY.');
  process.exit(2);
}

const health = await new WahaClient(config).checkConnection();
const line = (label: string, value: unknown) => console.log(`${label.padEnd(15)} ${String(value)}`);

line('base URL', config.baseUrl);
line('sessao', config.session);
line('alcancavel', health.reachable);
line('autenticado', health.authenticated);
line('versao/engine', `${health.version ?? '-'} / ${health.engine ?? '-'} (tier ${health.tier ?? '-'})`);
line('sessao status', health.session?.status ?? '-');
line('saudavel', `${health.healthy}${health.detail ? ` (${health.detail})` : ''}`);

process.exit(health.reachable && health.authenticated ? 0 : 1);
