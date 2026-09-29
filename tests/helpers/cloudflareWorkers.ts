// Stand-in for Cloudflare's `cloudflare:workers` module inside vitest.
// Server tests normally shadow it with `vi.mock('cloudflare:workers', ...)`,
// which vitest only applies under the node environment — the happy-dom
// environment (used by the e2e DOM test) fails to resolve the alias, so
// vitest.config.ts maps the specifier here instead. Throwing a clear error
// (instead of returning a null DB) surfaces any environment where the
// `vi.mock` did not take effect.
export const env = {
  get DB(): never {
    throw new Error(
      'cloudflare:workers env.DB is unset — mock it with ' +
      'vi.mock("cloudflare:workers", ...) before importing routes.'
    );
  }
};