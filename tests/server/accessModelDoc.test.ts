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

  // Alem do escopo LGPD, o SSE recorta o stream pelas conversas do usuario e
  // /api/whatsapp/send exige posse da conversa: autorizacao por posse, nao so
  // metadado. data.ts/export.ts nao aparecem aqui porque delegam o recorte a
  // src/domain/lgpdScope.ts — um unico lugar onde o campo de dono e lido.
  it('@spec:AC-139 assignment fields are read only where ownership is enforced', () => {
    const allowed = [...LGPD_FILES, 'events.ts', 'send.ts'];
    const routes = apiRoutesUsingFields().map((r) => r.split('/').pop());
    for (const route of routes) {
      expect(allowed).toContain(route);
    }
    // Nenhuma rota nova pode ler o campo de dono sem entrar nesta lista.
    expect(routes.sort()).toEqual(['erase.ts', 'events.ts', 'send.ts']);
  });

  it('@spec:AC-139 the LGPD routes delegate the recorte to the shared helper', () => {
    for (const route of ['data.ts', 'export.ts']) {
      const src = readFileSync(`src/pages/api/me/${route}`, 'utf8');
      expect(src).toContain('buildLgpdPayload');
      expect(FIELDS.some((field) => src.includes(field))).toBe(false);
    }
    const helper = readFileSync('src/domain/lgpdScope.ts', 'utf8');
    expect(FIELDS.some((field) => helper.includes(field))).toBe(true);
  });
});