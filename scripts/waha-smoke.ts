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
import { readWahaConfig, WahaClient } from '../src/server/waha';

const source = {
  WAHA_API_BASE_URL: process.env.WAHA_API_BASE_URL ?? 'http://127.0.0.1:3000',
  WAHA_API_KEY: process.env.WAHA_API_KEY ?? 'local-test-key',
  WAHA_SESSION_NAME: process.env.WAHA_SESSION_NAME ?? 'default'
};

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
