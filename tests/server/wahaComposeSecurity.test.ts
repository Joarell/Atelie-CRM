import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../');

describe('WAHA secret out of version control', () => {
  it('@spec:AC-120 .gitignore exclui .env', () => {
    const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env');
  });

  it('@spec:AC-121 waha/.env nao esta rastreado pelo git', () => {
    const out = execSync('git ls-files waha/.env', { cwd: repoRoot, encoding: 'utf8' }).trim();
    expect(out).toBe('');
  });

  it('@spec:AC-122 compose usa variavel de ambiente sem segredo real como padrao', () => {
    const compose = readFileSync(resolve(repoRoot, 'waha/docker-compose.waha.yml'), 'utf8');
    expect(compose).not.toContain('b6eb06b35fa2dd4c9b0c9db7faa94e8246ffb472b26668bd9d523fc01cb13a91');
    expect(compose).toContain('INVALID_CHANGE_ME');
    expect(compose).toContain('${WAHA_API_KEY_SHA512:-');
  });

  it('@spec:AC-123 .env.example nao contem segredo real', () => {
    const example = readFileSync(resolve(repoRoot, 'waha/.env.example'), 'utf8');
    expect(example).not.toContain('b6eb06b35fa2dd4c9b0c9db7faa94e8246ffb472b26668bd9d523fc01cb13a91');
    expect(example).toContain('<your-hex-here>');
  });
});

// The sentinel default above means the key is now provisioned, not baked in.
// These lock the two places that drifted away from that contract: the compose
// comments/docs (which still advertised a ready-to-use dev key) and the egress
// probe (which carried its own fallback key and so reported a green the app
// could not reproduce while every real call answered 401).
describe('WAHA key provisioning contract', () => {
  const compose = readFileSync(resolve(repoRoot, 'waha/docker-compose.waha.yml'), 'utf8');

  it('compose does not advertise a ready-to-use dev key', () => {
    expect(compose).not.toContain('local-test-key');
    expect(compose).toContain('NÃO existe chave padrão utilizável');
  });

  it('compose ships the operational scripts the README documents', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['waha:up']).toContain('waha/docker-compose.waha.yml');
    expect(pkg.scripts['waha:up']).toContain('--env-file waha/.env');
  });

  it('the egress probe reads the app config instead of inventing a key', () => {
    const smoke = readFileSync(resolve(repoRoot, 'scripts/waha-smoke.ts'), 'utf8');
    expect(smoke).toContain("dotEnv('.dev.vars')");
    expect(smoke).not.toMatch(/WAHA_API_KEY:\s*process\.env\.WAHA_API_KEY\s*\?\?/);
    expect(smoke).not.toContain('local-test-key');
  });

  it('docs stop telling the operator that a dev key is preconfigured', () => {
    for (const doc of ['docs/whatsapp-waha.md', 'waha/README.md']) {
      const text = readFileSync(resolve(repoRoot, doc), 'utf8');
      expect(text).not.toContain('local-test-key');
      expect(text).not.toContain('chave já vem pré-configurada');
    }
  });
});