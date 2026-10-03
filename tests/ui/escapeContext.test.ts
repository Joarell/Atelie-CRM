// Guards the escapeHtml/escapeText attribute-context rule (feature security-audit-fixes-v3, AC-381/382).
//
// This test scans the real UI source files and FAILS if escapeText/escapeHtml is
// used in an attribute context (e.g., `="${escapeText(...)}` or `'${escapeText(...)}'`),
// where escapeAtrib is required instead. All call sites must use the correct
// escaper for their output context.
//
// AC-382: Nenhum atributo é preenchido com o helper de texto — o teste falha se
// escapeText/escapeHtml for usado em contexto de atributo.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const UI_DIR = join(process.cwd(), 'src', 'ui');
const TEXT_EXT = /\.(ts|tsx)$/;

/** Finds all .ts/.tsx files under src/ui recursively. */
function findUiFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findUiFiles(full));
    else if (entry.isFile() && entry.name.match(/\.tsx?$/)) out.push(full);
  }
  return out;
}

/** Detects attribute-context usage of escapeText/escapeHtml in template literals. */
function findAttributeEscapes(content: string): Array<{ line: number; column: number; snippet: string }> {
  const findings: Array<{ line: number; column: number; snippet: string }> = [];
  const lines = content.split('\n');

  // Pattern: ${escapeText(...) or ${escapeHtml(...) inside an attribute value
  // i.e., preceded by = " or = ' and not yet closed
  // We use a simple state machine per line since template literals can span lines.
  let inTemplate = false;
  let templateStart = -1;
  let templateContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let col = 0;

    for (const ch of line) {
      if (ch === '`' && (col === 0 || line[col - 1] !== '\\')) {
        if (!inTemplate) {
          inTemplate = true;
          templateStart = i + 1;
          templateContent = '';
        } else {
          inTemplate = false;
          // Check the accumulated template content for attribute-context escapes
          checkTemplate(templateContent, i + 1);
          templateContent = '';
        }
      } else if (inTemplate) {
        templateContent += ch;
      }
      col++;
    }

    // Handle unclosed template at end of line
    if (inTemplate) {
      templateContent += '\n';
    }
  }

  function checkTemplate(template: string, lineNum: number) {
    // Find attribute context: ="${...}" or ='${...}' or =`${...}`
    // Pattern: =["']`[^`]*\${escape(Text|Html)\(
    const attrPattern = /=["'`]\s*\$\{?\s*(escapeText|escapeHtml)\s*\(/g;
    let match;
    while ((match = attrPattern.exec(template)) !== null) {
      // Find line/column in original file (approximate)
      const beforeMatch = template.slice(0, match.index).split('\n').length;
      const lineInTemplate = beforeMatch;
      findings.push({
        line: lineNum - (template.split('\n').length) + lineInTemplate,
        column: match.index,
        snippet: match[0]
      });
    }
  }

  return findings;
}

const UI_FILES = findUiFiles(UI_DIR).filter(f => !f.includes('node_modules'));

describe('AC-381/382: no escapeHtml/escapeText in attribute context', () => {
  for (const file of UI_FILES) {
    const rel = relative(process.cwd(), file);
    const content = readFileSync(file, 'utf8');

    it(`@spec:AC-381 @spec:AC-382 ${relative('src/ui', file)} has no attribute-context escapeHtml/escapeText`, () => {
      const findings = findAttributeEscapes(content);
      if (findings.length > 0) {
        const details = findings.map(f =>
          `  line ${f.line}: ${f.snippet.trim()}`
        ).join('\n');
        throw new Error(
          `${rel} contains escapeHtml/escapeText in attribute context:\n${details}\n` +
          `Use escapeAtrib() for attribute values instead.`
        );
      }
      expect(true).toBe(true);
    });
  }
});