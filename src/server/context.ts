import { env } from 'cloudflare:workers';
import type { Database } from './db';

// Every API route needs the same one-liner to reach D1. The Cloudflare
// adapter exposes bindings through the `cloudflare:workers` env, so this
// centralises that access in one place. The narrow `Database` return type
// documents the only D1 surface the app uses (see ./db).
export function getDb(): Database {
  return env.DB;
}