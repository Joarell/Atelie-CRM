import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../');

describe('WAHA secret out of version control', () => {
  // @spec:AC-120
  it('.gitignore exclui .env', () => {
    const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env');
  });

  // @spec:AC-121
  it('waha/.env nao esta rastreado pelo git', () => {
    const out = execSync('git ls-files waha/.env', { cwd: repoRoot, encoding: 'utf8' }).trim();
    expect(out).toBe('');
  });

  // @spec:AC-122
  it('compose usa variavel de ambiente sem segredo real como padrao', () => {
    const compose = readFileSync(resolve(repoRoot, 'waha/docker-compose.waha.yml'), 'utf8');
    expect(compose).not.toContain('b6eb06b35fa2dd4c9b0c9db7faa94e8246ffb472b26668bd9d523fc01cb13a91');
    expect(compose).toContain('INVALID_CHANGE_ME');
    expect(compose).toContain('${WAHA_API_KEY_SHA512:-');
  });

  // @spec:AC-123
  it('.env.example nao contem segredo real', () => {
    const example = readFileSync(resolve(repoRoot, 'waha/.env.example'), 'utf8');
    expect(example).not.toContain('b6eb06b35fa2dd4c9b0c9db7faa94e8246ffb472b26668bd9d523fc01cb13a91');
    expect(example).toContain('<your-hex-here>');
  });
});