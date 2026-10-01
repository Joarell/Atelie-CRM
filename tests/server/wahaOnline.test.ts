// ONLINE tier for the WAHA engine (WhatsApp).
//
// This tier talks to a REAL, RUNNING WAHA engine through the REAL transport
// (src/server/waha.ts WahaClient + readWahaConfig) — no fakes, no probes,
// no injected fetch. It is gated by configuration: when WAHA is not
// configured (offline development, CI without secrets) the whole file skips
// cleanly, so the deterministic offline battery stays GREEN. To run it
// against a live engine (the one `podman compose -f waha/docker-compose.waha.yml up -d`
// builds — see docs/whatsapp-waha.md):
//
//   npm run waha:online
//
// The live smoke equivalent (scripts/waha-smoke.ts) enforces the same health
// semantics: reachable + authenticated = pass; anything else = fail.
import { describe, it, expect } from 'vitest';
import { readWahaConfig, WahaClient } from '../../src/server/waha';
import { wahaSourceFrom } from '../helpers/dotenv';

// Read the app's own config (.dev.vars in dev, real env elsewhere), not just
// process.env: a tier that only saw process.env skipped itself and reported
// green while proving nothing about the engine.
const source = wahaSourceFrom();

const configured = readWahaConfig(source);
const skip = () => !configured;

describe.skipIf(skip())('WAHA engine online tier', () => {
  if (!configured) return;
  const client = new WahaClient(configured);

  it('reaches a live WAHA engine and is authenticated', async () => {
    const health = await client.checkConnection();
    expect(health.reachable).toBe(true);
    expect(health.authenticated).toBe(true);
  });

  it('reports the engine version and any session snapshot the engine holds', async () => {
    const health = await client.checkConnection();
    expect(health.engine ?? '').not.toBe('');
    // A paired session is NOT required to prove the connection — same contract
    // as scripts/waha-smoke.ts and docs/whatsapp-waha.md §5.2: absence reports
    // `sessao_inexistente` and still counts as reachable + authenticated, so
    // the snapshot is only shape-checked when the engine actually has one.
    if (health.session) {
      expect(health.session.name).not.toBe('');
      expect(health.session.status).not.toBe('');
    }
  });
});
