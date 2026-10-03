// Pins the inventory of per-id routes so an authorization fix cannot be undone
// by a route appearing outside the reviewed list, and so no id route can be
// smuggled into the middleware's public set.
//
// The audit's IDOR finding was confined to `users/[id]` because the app is
// single-tenant (ASM-100): every other id route addresses a shared resource,
// so session presence is the whole control there. That asymmetry is only safe
// while the inventory below stays true, hence AC-140.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED = [
  '/api/components/[id]',
  '/api/crm/activities/[id]',
  '/api/crm/appointment-types/[id]',
  '/api/crm/calendar-events/[id]',
  '/api/crm/catalog-products/[id]',
  '/api/crm/contacts/[id]',
  '/api/crm/conversation-notes/[id]',
  '/api/crm/conversations/[id]',
  '/api/crm/deals/[id]',
  '/api/crm/messages/[id]',
  '/api/crm/pipelines/[id]',
  '/api/crm/quick-replies/[id]',
  '/api/crm/stages/[id]',
  '/api/crm/tags/[id]',
  '/api/crm/tasks/[id]',
  '/api/customers/[id]',
  '/api/ingredients/[id]',
  '/api/orders/[id]',
  '/api/products/[id]',
  '/api/purchases/[id]',
  '/api/users/[id]'
];

const ID_ROUTE = '[id].ts';

function tsFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesIn(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Every per-id route in the code, as an API path. */
function idRoutesOnDisk(): string[] {
  return tsFilesIn('src/pages/api')
    .filter((file) => file.endsWith(ID_ROUTE))
    .map((file) => file.replace(/^src\/pages/, '').replace(/\.ts$/, ''))
    .sort();
}

function publicPaths(): string[] {
  const source = readFileSync('src/middleware.ts', 'utf8');
  const start = source.indexOf('const PUBLIC_PATHS');
  const block = source.slice(start, source.indexOf('];', start));
  return block.match(/'(\/[^']+)'/g)?.map((q) => q.slice(1, -1)) ?? [];
}

describe('id route inventory', () => {
  it('@spec:AC-140 every id route in the code is on the reviewed list', () => {
    expect(idRoutesOnDisk()).toEqual(EXPECTED);
  });

  it('@spec:AC-140 the reviewed list is exactly the 21 routes', () => {
    expect(EXPECTED).toHaveLength(21);
  });

  it('@spec:AC-140 no listed route is missing from the code', () => {
    expect(EXPECTED.filter((route) => !idRoutesOnDisk().includes(route)))
      .toEqual([]);
  });
});

describe('id routes require a session', () => {
  it('@spec:AC-141 no id route is in PUBLIC_PATHS', () => {
    const publicSet = publicPaths();
    const exposed = idRoutesOnDisk().filter((route) =>
      publicSet.includes(route)
    );
    expect(exposed).toEqual([]);
  });

  it('@spec:AC-141 users/[id] has role coverage in usersAuthz.test.ts', () => {
    const source = readFileSync('tests/server/usersAuthz.test.ts', 'utf8');
    expect(source).toContain("api/users/[id]");
    for (const ac of ['AC-103', 'AC-104', 'AC-105', 'AC-106']) {
      expect(source).toContain(`@spec:${ac}`);
    }
  });
});
