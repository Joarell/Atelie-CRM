// Style gate for the codebase: every function/method body must be at most
// 25 lines, and every source line at most 80 columns. Exits 1 on violation.
//
// Usage:
//   npx tsx scripts/check-style.ts            # default: src/**
//   npx tsx scripts/check-style.ts src/server tests/services
//
// Long string literals / template expressions that cannot be split without
// changing behavior should still be wrapped or extracted; inside tests,
// large fixtures are a documented exception, so pass tests paths explicitly.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const MAX_FN_LINES = 25;
const MAX_COL = 80;
const FN_ONLY = process.argv.includes('--fn-only');
const args = process.argv.slice(2).filter((a) => a !== '--fn-only');
const targets = args.length > 0 ? args : ['src'];

function collectFiles(): string[] {
  const out: string[] = [];
  for (const raw of targets) {
    const target = resolve(ROOT, raw);
    if (!statSync(target).isDirectory()) out.push(target);
    else walk(target, out);
  }
  return out.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.astro' || entry === 'dist') return;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function bodyLineCount(fn: ts.Node, sourceText: string): number {
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body) return 0;
  let count = 1;
  for (let i = body.getFullStart(); i < body.end; i++) {
    if (sourceText.charCodeAt(i) === 10) count++;
  }
  return count;
}

const fnViolations: Array<{ file: string; line: number; name: string; lines: number }> = [];
const colViolations: Array<{ file: string; line: number; len: number; snippet: string }> = [];
const targetFiles = collectFiles();

for (const file of targetFiles) {
  const sourceText = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (!FN_ONLY) {
    sourceText.split('\n').forEach((line, index) => {
      if (line.length > MAX_COL) {
        colViolations.push({ file, line: index + 1, len: line.length, snippet: line.trim().slice(0, 60) });
      }
    });
  }
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)) {
      const lines = bodyLineCount(node, sourceText);
      if (lines > MAX_FN_LINES) {
        const name = node.name ? node.name.getText(sf) : '(arrow)';
        const at = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        fnViolations.push({ file, line: at, name, lines });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const fail = fnViolations.length > 0 || colViolations.length > 0;
for (const v of fnViolations) {
  console.log(`FN(${v.lines}>${MAX_FN_LINES}) ${v.file}:${v.line} ${v.name}`);
}
for (const v of colViolations) {
  console.log(`COL(${v.len}>${MAX_COL}) ${v.file}:${v.line} ${v.snippet}`);
}
if (colViolations.length === 0) console.log('no column violations');
console.log(
  `\ncheck:style — functions over ${MAX_FN_LINES} lines: ${fnViolations.length}; ` +
    `lines over ${MAX_COL} cols: ${colViolations.length}; total target files: ${targetFiles.length}`
);
process.exit(fail ? 1 : 0);