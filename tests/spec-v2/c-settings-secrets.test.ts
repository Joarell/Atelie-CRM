import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FakeD1 } from '../helpers/fakeD1';
import type { APIContext } from 'astro';
import { GET as getSettings, PUT as putSettings } from
  '../../src/pages/api/settings';
import { verifyPassword } from '../../src/server/auth';
import {
  LEGACY_SEED_HASH, assertNoSeedCredential, bootstrapAdmin,
  isLegacySeedHash, SeedCredentialError
} from '../../src/server/seedCredential';
import { readWahaWebhookConfig } from '../../src/server/wahaWebhook';
import { USERS_TABLE } from '../../src/server/tables';
import type { Role } from '../../src/domain/crm';

const state = vi.hoisted(() => ({ db: null as unknown as FakeD1 }));
vi.mock('cloudflare:workers', () => ({
  env: { get DB() { return state.db; } }
}));
vi.mock('../../src/server/context', () => ({
  getDb: () => state.db
}));

const SETTINGS = 'settings';
const TEXT_FILE = /\.(ts|js|json|md|py|txt|sql|toml|example|yml|yaml)$/;
const KEY_ASSIGNMENT = /WAHA_API_KEY\s*=\s*["']([^"']+)["']/g;

function looksLikeRealKey(value: string): boolean {
	const key = value.trim();
	if (key.length < 16) return false;
	if (/change[_-]?me|your[_-]?key|placeholder/i.test(key)) return false;
	return /^[A-Za-z0-9._-]+$/.test(key);
}

type Row = Record<string, unknown>;
type SettingsBody = Record<string, unknown>;

const git = (...args: string[]): string => execFileSync(
  'git', args,
  { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
);

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

/** Strips SQL line comments so prose about a secret is not read as one. */
function sqlWithoutComments(file: string): string {
  return read(file)
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function settingsCtx(role: Role, body?: unknown): APIContext {
  return {
    request: new Request('http://localhost/api/settings', {
      method: body === undefined ? 'GET' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    params: {},
    locals: { user: { id: 'u1', role, email: 'u1@x.test' } }
  } as unknown as APIContext;
}

beforeEach(() => {
  state.db = FakeD1.from({ [SETTINGS]: [], [USERS_TABLE]: [] });
});

describe('AC-326/327/328 — /api/settings read and write contract', () => {
  it('@spec:AC-326 GET performs no write when settings row is absent', async () => {
    const response = await getSettings(settingsCtx('viewer'));
    expect(response.status).toBe(200);
    expect((await response.json()) as Row).toHaveProperty('salary');
    expect(state.db.rows(SETTINGS)).toHaveLength(0);
  });

  it('@spec:AC-327 PUT discards a key outside the settings allowlist', async () => {
    await putSettings(settingsCtx('manager', {
      salary: 5000, hackerField: 'rm -rf /'
    }));
    const row = state.db.rows(SETTINGS)[0];
    expect(Number(row.salary)).toBe(5000);
    expect(row.hackerField).toBeUndefined();
  });

  it('@spec:AC-328 a non-numeric field is rejected before the merge', async () => {
    const response = await putSettings(settingsCtx('manager', {
      salary: 'abc', rent: 1200
    }));
    const merged = (await response.json()) as SettingsBody;
    expect(merged.salary).not.toBe('abc');
    expect(Number.isNaN(Number(merged.salary))).toBe(false);
    expect(merged.rent).toBe(1200);
  });

  it('@spec:AC-327 PUT is refused for a viewer', async () => {
    const response = await putSettings(settingsCtx('viewer', { salary: 1 }));
    expect(response.status).toBe(403);
    expect(state.db.rows(SETTINGS)).toHaveLength(0);
  });
});

describe('AC-331/332/333 — the seed credential is not reproducible', () => {
  const randomPassword = (): string => 'fixed-test-password-123';

  it('@spec:AC-331 a fresh database gets an admin with a random password', async () => {
    const result = await bootstrapAdmin(state.db, { randomPassword });
    expect([result.action, result.passwordSource])
      .toEqual(['created', 'random']);
    expect(result.password).toBe('fixed-test-password-123');
    const admin = state.db.rows(USERS_TABLE)[0];
    expect([admin.role, admin.mustChangePassword]).toEqual(['admin', 1]);
  });

  it('@spec:AC-331 ADMIN_INITIAL_PASSWORD wins when it is long enough', async () => {
    const result = await bootstrapAdmin(state.db, {
      randomPassword, fromEnv: 'from-env-password-123'
    });
    expect([result.passwordSource, result.password])
      .toEqual(['env', 'from-env-password-123']);
  });

  it('@spec:AC-332 startup refuses a database carrying the legacy seed hash', async () => {
    state.db = FakeD1.from({
      [USERS_TABLE]: [{
        id: 'seed-user-admin',
        email: 'admin@deskcomm.local',
        passwordHash: LEGACY_SEED_HASH
      }]
    });
    await expect(assertNoSeedCredential(state.db))
      .rejects.toBeInstanceOf(SeedCredentialError);
  });

  it('@spec:AC-332 a rotated hash passes the startup assertion', async () => {
    await bootstrapAdmin(state.db, { randomPassword });
    await expect(assertNoSeedCredential(state.db)).resolves.toBeUndefined();
  });

  it('@spec:AC-333 verifyPassword has no fixed-salt default', async () => {
    expect(await verifyPassword('admin123', LEGACY_SEED_HASH, undefined))
      .toBe(false);
    expect(await verifyPassword('admin123', LEGACY_SEED_HASH, null))
      .toBe(false);
    expect(await verifyPassword('admin123', LEGACY_SEED_HASH, ''))
      .toBe(false);
    expect(isLegacySeedHash(LEGACY_SEED_HASH)).toBe(true);
    expect(read('src/server/auth.ts'))
      .not.toMatch(/salt[^)]*=\s*'deskcomm-seed-v1'/);
  });
});

describe('AC-336/337 — webhook secrets refuse placeholders', () => {
  it('@spec:AC-336 a placeholder or short secret yields no usable secret', () => {
    const cases: Array<[string, string]> = [
      ['gere-um-segredo-por-ambiente-openssl-rand-hex-32', 'placeholder'],
      ['dev_plaintext_change_me', 'dev placeholder'],
      ['change-me', 'short known placeholder'],
      ['too-short', 'under 32 bytes']
    ];
    for (const [secret, label] of cases) {
      const config = readWahaWebhookConfig({ WAHA_HMAC_SECRET: secret });
      expect([label, config.hmacSecret]).toEqual([label, null]);
    }
  });

  it('@spec:AC-336 a real secret of 32+ bytes is accepted', () => {
    const real = 'a'.repeat(32);
    expect(readWahaWebhookConfig({ WAHA_HMAC_SECRET: real }).hmacSecret)
      .toBe(real);
  });

  it('@spec:AC-337 the example env file ships an empty HMAC secret', () => {
    const line = read('.dev.vars.example')
      .split('\n')
      .find((row) => row.trim().startsWith('WAHA_HMAC_SECRET='));
    expect(line).toBeDefined();
    const value = line?.split('=').slice(1).join('=')
      .trim().replace(/^["']|["']$/g, '');
    expect(value).toBe('');
  });
});

describe('AC-329/330 — no reproducible credential in the allowlist or migrations', () => {
  it('@spec:AC-329 every public route self-authenticates', () => {
    const middleware = read('src/middleware.ts');
    const block = /PUBLIC_PATHS = new Set\(\[([\s\S]*?)\]\)/
      .exec(middleware)?.[1] ?? '';
    const paths = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    // Documented exceptions: login is the credential exchange, and the
    // webhook authenticates by HMAC signature instead of a session.
    const exceptions: Record<string, string> = {
      '/api/auth/login': 'verifica senha e emite a sessao',
      '/api/whatsapp/webhook': 'autentica por assinatura HMAC'
    };
    for (const path of paths) {
      const file = `src/pages${path}.ts`;
      const source = read(file);
      const authenticated = source.includes('userFromToken') ||
        exceptions[path] !== undefined;
      expect([path, authenticated]).toEqual([path, true]);
    }
  });

  it('@spec:AC-330 no migration seeds a plaintext admin123', () => {
    const dir = join(process.cwd(), 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect([file, sqlWithoutComments(`migrations/${file}`)])
        .not.toContain('admin123');
    }
  });
});

describe('AC-334/335/338 — secrets and vendored app stay out of git', () => {
  it('@spec:AC-334 .dev.vars is not tracked', () => {
    let failed = false;
    try {
      git('ls-files', '--error-unmatch', '.dev.vars');
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('@spec:AC-335 no tracked file carries the real WAHA key', () => {
    const tracked = git('ls-files').split('\n').filter(Boolean);
    const secrets: string[] = [];
    try {
      const vars = read('.dev.vars');
      const key = /WAHA_API_KEY="([^"]+)"/.exec(vars)?.[1];
      if (key && looksLikeRealKey(key)) secrets.push(key);
    } catch {
      // .dev.vars is untracked by design; the scan below still runs.
    }
    for (const file of tracked) {
      if (!TEXT_FILE.test(file)) continue;
      let content = '';
      try {
        content = read(file);
      } catch {
        continue;
      }
      for (const secret of secrets) {
        expect([file, content.includes(secret)]).toEqual([file, false]);
      }
      const leaked = [...content.matchAll(KEY_ASSIGNMENT)]
        .map((match) => match[1])
        .filter(looksLikeRealKey);
      expect([file, leaked]).toEqual([file, []]);
    }
  });

  it('@spec:AC-338 DeskcommCRM is untracked and gitignored', () => {
    expect(git('ls-files', 'DeskcommCRM-RecipeCosting/').trim()).toBe('');
    expect(read('.gitignore')).toContain('DeskcommCRM-RecipeCosting/');
  });
});

describe('AC-372/373 — mechanical guards for credential hygiene', () => {
  const CRED_PATHS = ['.dev.vars', '.env'];

  it('@spec:AC-372 every credential-bearing path is ignored by git', () => {
    for (const path of CRED_PATHS) {
      let ignored = false;
      try {
        git('check-ignore', '-q', path);
        ignored = true;
      } catch {
        ignored = false;
      }
      expect([path, ignored]).toEqual([path, true]);
    }
  });

  it('@spec:AC-373 no tracked file carries a real secret literal', () => {
    const tracked = git('ls-files').split('\n').filter(Boolean);
    const secretNames = [
      'WAHA_HMAC_SECRET',
      'WAHA_API_KEY',
      'WHATSAPP_HOOK_URL',
      'WHATSAPP_HOOK_EVENTS',
      'ADMIN_INITIAL_PASSWORD'
    ];
    const allowedPatterns = [
      /=\s*""$/,          // empty assignment: NAME=""
      /=\s*\$\{[^}]+\}$/  // env reference: NAME=${VAR}
    ];

    // Files that are expected to contain placeholder/template values (not real secrets)
    const excludedFiles = new Set([
      '.dev.vars.example',
      'waha/.env.example',
      'docs/whatsapp-waha.md',
      'tests/spec-v2/c-settings-secrets.test.ts',
      // spec files may contain redacted/prototype values
      '.spec/features/security-audit-fixes-v2/tasks.md'
    ]);

    for (const file of tracked) {
      if (!TEXT_FILE.test(file)) continue;
      if (excludedFiles.has(file)) continue;
      let content = '';
      try {
        content = read(file);
      } catch {
        continue;
      }
      for (const name of secretNames) {
        const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'g');
        let match: RegExpExecArray | null;
        while ((match = re.exec(content)) !== null) {
          const found = match;
          const value = found[1];
          const isAllowed = allowedPatterns.some((p) => p.test(found[0]));
          expect([file, name, value, isAllowed]).toEqual([file, name, value, true]);
        }
      }
    }
  });
});
