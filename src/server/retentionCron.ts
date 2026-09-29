import type { Database } from './db';
import { applyRetentionPolicies, readRetentionDays } from './retention';

// The scheduled retention run, kept free of Worker/Astro imports so it can be
// driven from a test. `applyRetentionPolicies` never throws — failures are
// collected in the report — so the only thing left to do is surface them.
//
// `config` is the env-like object holding the RETENTION_* windows; it is typed
// `unknown` because `readRetentionDays` parses it by name, which lets the
// Worker pass its whole `Env` and the tests pass a plain literal.
export async function runRetention(
  db: Database,
  config: unknown
): Promise<void> {
  const report = await applyRetentionPolicies(db, readRetentionDays(config));
  if (report.errors.length > 0) {
    console.error('retention run failed', JSON.stringify(report));
    return;
  }
  console.log('retention run', JSON.stringify(report));
}
