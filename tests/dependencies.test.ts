import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readPackage(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
}

function allDeps(): string[] {
  const pkg = readPackage();
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {})
  ];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const REACT_ECOSYSTEM = [
  '@astrojs/react',
  '@phosphor-icons/react',
  'class-variance-authority',
  'clsx',
  'react',
  'react-dom',
  'tailwind-merge'
];

describe('framework footprint (no React)', () => {
  it('has no React ecosystem packages in package.json', () => {
    const deps = allDeps();
    for (const banned of REACT_ECOSYSTEM) {
      expect(deps).not.toContain(banned);
    }
  });

  it('has no @radix-ui/* or @types/react* packages', () => {
    const offenders = allDeps().filter(
      (name) => name.startsWith('@radix-ui/') || /^@types\/react/.test(name)
    );
    expect(offenders).toEqual([]);
  });

  it('has no dependency whose name contains "react"', () => {
    const offenders = allDeps().filter((name) => /react/i.test(name));
    expect(offenders).toEqual([]);
  });

  it('does not register the React integration in astro.config.ts', () => {
    const config = readFileSync(join(root, 'astro.config.ts'), 'utf-8');
    expect(config).not.toMatch(/@astrojs\/react/);
    expect(config).not.toMatch(/\breact\s*\(/);
  });

  it('ships no .tsx or .jsx source files', () => {
    const src = join(root, 'src');
    const offenders = walk(src).filter((f) => /\.(tsx|jsx)$/.test(f));
    expect(offenders).toEqual([]);
  });
});
