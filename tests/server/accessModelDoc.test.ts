import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const README = readFileSync('README.md', 'utf8');
const LGPD_FILES = ['data.ts', 'export.ts', 'erase.ts'];
const FIELDS = ['assignedUserId', 'assigneeUserId'];

const ACCESS_DOC = README.slice(
  README.indexOf('## Modelo de acesso'),
  README.indexOf('## Passo a passo para rodar')
);

function tsFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFilesIn(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function apiRoutesUsingFields(): string[] {
  return tsFilesIn('src/pages/api').filter((file) => {
    const src = readFileSync(file, 'utf8');
    return FIELDS.some((field) => src.includes(field));
  });
}

describe('access model is documented', () => {
  it('@spec:AC-137 README declares there is no per-row isolation', () => {
    expect(ACCESS_DOC).toContain('single-tenant');
    expect(ACCESS_DOC).toContain('base inteira');
    expect(ACCESS_DOC).toContain(
      'Não existe isolamento por linha'
    );
    expect(ACCESS_DOC).toContain('Não há filtro por dono');
  });

  it('@spec:AC-138 README qualifies the assignment fields as metadata', () => {
    expect(ACCESS_DOC).toContain(
      '`assignedUserId` e `assigneeUserId` são metadados de atribuição'
    );
    expect(ACCESS_DOC).toContain('**apenas no escopo LGPD**');
    expect(ACCESS_DOC).toContain(
      'metadados de atribuição**, não\n  autorização'
    );
  });

  it('@spec:AC-139 no non-LGPD route reads the assignment fields', () => {
    const routes = apiRoutesUsingFields();
    expect(routes).toHaveLength(3);
    for (const route of routes) {
      expect(LGPD_FILES).toContain(route.split('/').pop());
    }
  });
});