import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { APIContext } from 'astro';
import { FakeD1, schemaFromMigrations } from '../helpers/fakeD1';
import {
  USERS_TABLE,
  SESSIONS_TABLE,
  AUTH_AUDIT_TABLE
} from '../../src/server/tables';
import { hashPassword } from '../../src/server/auth';
import { POST as loginPost } from '../../src/pages/api/auth/login';
import { POST as changePost } from '../../src/pages/api/auth/change-password';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));

vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));

vi.mock('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn
}));

import { onRequest } from '../../src/middleware';

const PKG = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const M0020 = 'migrations/0020_users_must_change_password.sql';
const M0021 = 'migrations/0021_seed_admin_flag.sql';
const ADMIN_ID = 'seed-user-admin';

function migrationsIn(script: string): string[] {
  return PKG.scripts[script].match(/migrations\/[\w.]+\.sql/g) ?? [];
}

async function seedDb(flag: number): Promise<FakeD1> {
  const { hash, salt } = await hashPassword('admin123');
  return FakeD1.from({
    [USERS_TABLE]: [{
      id: ADMIN_ID,
      name: 'Administrador',
      email: 'admin@deskcomm.local',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      mustChangePassword: flag,
      createdAt: '2026-01-01T00:00:00Z'
    }],
    [SESSIONS_TABLE]: [],
    [AUTH_AUDIT_TABLE]: []
  });
}

function ctx(path: string, body: unknown, token?: string): APIContext {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    request: new Request(`http://localhost${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }),
    locals: {}
  } as unknown as APIContext;
}

function adminRow(): Record<string, unknown> {
  return state.db.rows(USERS_TABLE)[0];
}

// O token da sessao volta num cookie HttpOnly, nao no corpo: um cliente nao
// pode mais ler o proprio token, e nenhum teste deve fingir que consegue.
function sessionTokenFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie') ?? '';
  const match = cookie.match(/crm_session=([^;]+)/);
  if (!match) throw new Error(`sem cookie de sessao em: ${cookie}`);
  return match[1];
}

describe('AC-124 the column and its migration are wired', () => {
  const schema = schemaFromMigrations([M0020]);

  it('@spec:AC-124 users has mustChangePassword', () => {
    expect(schema.get('users')?.columns.has('mustChangePassword')).toBe(true);
  });

  it.each(['db:migrate:local', 'db:migrate:remote'])(
    '@spec:AC-124 %s applies 0020 then 0021 in file order',
    (script) => {
      const applied = migrationsIn(script);
      expect(applied).toContain(M0020);
      expect(applied).toContain(M0021);
      expect(applied.indexOf(M0020)).toBeLessThan(applied.indexOf(M0021));
    }
  );

  it('@spec:AC-124 USERS_SHAPE allowlists the column', async () => {
    const { USERS_SHAPE } = await import('../../src/server/tables');
    expect(USERS_SHAPE.columns).toContain('mustChangePassword');
  });
});

describe('AC-125 the seed admin is born flagged', () => {
  // A linha `seed-user-admin` nao existe mais: 0004 nao semeia usuario algum e o
  // primeiro admin nasce por `admin:bootstrap`, que ja grava a flag ligada.
  it('@spec:AC-125 0021 writes nothing', () => {
    const sql = readFileSync(M0021, 'utf8');
    expect(sql).not.toMatch(/UPDATE\s+users/);
    expect(sql).not.toContain(`WHERE id = '${ADMIN_ID}'`);
  });

  it('@spec:AC-125 0004 no longer creates the admin row', () => {
    const sql = readFileSync('migrations/0004_crm_seed.sql', 'utf8');
    expect(sql).not.toMatch(/INSERT OR IGNORE INTO users\b/i);
  });

  it('@spec:AC-125 admin:bootstrap exists and is wired', () => {
    expect(PKG.scripts['admin:bootstrap']).toBeTruthy();
    const script = readFileSync('scripts/bootstrap-admin.ts', 'utf8');
    expect(script).toContain('mustChangePassword');
  });

  // O comando rodava sob `bun`, que nao tem o runtime `cloudflare:workers`: o
  // import estatico quebrava o processo e nao havia jeito de criar o admin.
  it('@spec:AC-125 admin:bootstrap runs outside the Worker runtime', () => {
    const script = readFileSync('scripts/bootstrap-admin.ts', 'utf8');
    expect(script).not.toMatch(/from 'cloudflare:workers'/);
    expect(script).toContain('getPlatformProxy');
  });

  it.each(['db:seed:local', 'db:seed:remote'])(
    '@spec:AC-125 %s re-runs 0021 after the seed inserts the row',
    (script) => {
      const applied = migrationsIn(script);
      expect(applied).toContain('migrations/0004_crm_seed.sql');
      expect(applied.indexOf('migrations/0004_crm_seed.sql'))
        .toBeLessThan(applied.indexOf(M0021));
    }
  );
});

describe('AC-126 login with the seed password demands a rotation', () => {
  beforeEach(async () => {
    state.db = await seedDb(1);
  });

  it('@spec:AC-126 login answers 200, creates the session and reports the flag', async () => {
    const response = await loginPost(ctx('/api/auth/login', {
      email: 'admin@deskcomm.local',
      password: 'admin123'
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      user: { mustChangePassword: boolean };
    };
    expect(body).not.toHaveProperty('token');
    expect(body.user.mustChangePassword).toBe(true);
    expect(state.db.rows(SESSIONS_TABLE).map((r) => r.token))
      .toContain(sessionTokenFrom(response));
  });

  it('@spec:AC-126 a user without the flag reports false', async () => {
    state.db = await seedDb(0);
    const response = await loginPost(ctx('/api/auth/login', {
      email: 'admin@deskcomm.local',
      password: 'admin123'
    }));
    const body = await response.json() as {
      user: { mustChangePassword: boolean };
    };
    expect(body.user.mustChangePassword).toBe(false);
  });
});

describe('AC-128 the rotation clears the flag', () => {
  beforeEach(async () => {
    state.db = await seedDb(1);
  });

  async function logIn(): Promise<string> {
    const response = await loginPost(ctx('/api/auth/login', {
      email: 'admin@deskcomm.local',
      password: 'admin123'
    }));
    return sessionTokenFrom(response);
  }

  async function apiGet(token: string, path: string): Promise<number> {
    const context = {
      request: new Request(`http://localhost${path}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      locals: {},
      url: new URL(`http://localhost${path}`)
    } as unknown as Parameters<typeof onRequest>[0];
    const response = await onRequest(
      context,
      () => Promise.resolve(new Response('ok'))
    ) as Response;
    return response.status;
  }

  it('@spec:AC-128 the API is closed before the rotation', async () => {
    expect(await apiGet(await logIn(), '/api/users')).toBe(403);
  });

  it('@spec:AC-128 change-password answers 200 and clears the flag', async () => {
    const token = await logIn();
    const response = await changePost(ctx('/api/auth/change-password', {
      currentPassword: 'admin123',
      newPassword: 'senha-nova-123'
    }, token));
    expect(response.status).toBe(200);
    expect(Number(adminRow().mustChangePassword)).toBe(0);
  });

  it('@spec:AC-128 the API answers again after the rotation', async () => {
    const token = await logIn();
    await changePost(ctx('/api/auth/change-password', {
      currentPassword: 'admin123',
      newPassword: 'senha-nova-123'
    }, token));
    const refreshed = await loginPost(ctx('/api/auth/login', {
      email: 'admin@deskcomm.local',
      password: 'senha-nova-123'
    }));
    expect(await apiGet(sessionTokenFrom(refreshed), '/api/users')).toBe(200);
  });
});

describe('AC-129 the README stops documenting the seed password', () => {
  const readme = readFileSync('README.md', 'utf8');

  it('@spec:AC-129 admin123 is gone', () => {
    expect(readme).not.toContain('admin123');
  });

  it('@spec:AC-129 the README states the first access must rotate', () => {
    expect(readme).toMatch(/mustChangePassword/);
    expect(readme).toMatch(/troca de senha|trocar a senha/i);
  });
});

describe('AC-130 the remote seed passes through a guard', () => {
  it('@spec:AC-130 db:seed:remote runs the guard script', () => {
    expect(PKG.scripts['db:seed:remote'])
      .toContain('scripts/generate-admin-seed.ts');
  });

  it('@spec:AC-130 the guard does not pass the flag for the operator', () => {
    expect(PKG.scripts['db:seed:remote'])
      .not.toContain('--allow-seed-admin');
  });

  it('@spec:AC-130 the guard aborts without an acknowledgement', () => {
    const guard = readFileSync('scripts/generate-admin-seed.ts', 'utf8');
    expect(guard).toContain('--allow-seed-admin');
    expect(guard).toMatch(/process\.exit\(1\)/);
    expect(guard).toMatch(/ALLOW_SEED_ADMIN/);
  });
});
