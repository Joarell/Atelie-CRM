import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PWA_MANIFEST_PATH } from '../../src/domain/pwa';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PUBLIC = join(ROOT, 'public');

const manifest: Record<string, unknown> = JSON.parse(
  readFileSync(join(PUBLIC, PWA_MANIFEST_PATH.replace(/^\//, '')), 'utf8')
);

interface PngHeader {
  width: number;
  height: number;
}

function pngDimensions(bytes: Buffer): PngHeader {
  const sig = bytes.subarray(0, 8);
  expect([...sig]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

describe('manifest.webmanifest', () => {
  it('is discoverable at the domain-pinned path', () => {
    expect(PWA_MANIFEST_PATH).toBe('/manifest.webmanifest');
  });

  it('declares the PWA identity', () => {
    expect(manifest.name).toContain('DeskcommCRM');
    expect(typeof manifest.short_name).toBe('string');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.theme_color).toBe('#506d48');
    expect(manifest.background_color).toBe('#faf9f6');
  });

  it('installs as a table icon plus a maskable variant', () => {
    const icons = manifest.icons as Array<Record<string, string>>;
    expect(icons.length).toBe(3);
    const byPurpose = Object.fromEntries(
      icons.map((icon) => [`${icon.sizes} ${icon.purpose}`, icon])
    );
    expect(byPurpose['192x192 any']).toBeDefined();
    expect(byPurpose['512x512 any']).toBeDefined();
    expect(byPurpose['512x512 maskable'].purpose).toBe('maskable');
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src).toMatch(/^\/icon-.*\.png$/);
    }
  });

  it('deep-links the CRM inbox and the Ateliê Pedidos board', () => {
    const shortcuts = manifest.shortcuts as Array<Record<string, string>>;
    expect(shortcuts).toHaveLength(2);
    const urls = shortcuts.map((s) => s.url);
    expect(urls).toContain('/#/inbox');
    expect(urls).toContain('/#/atelie/pedidos');
    for (const shortcut of shortcuts) {
      expect(typeof shortcut.name).toBe('string');
      expect(shortcut.url).toMatch(/^\/#\//);
    }
  });

  it('references icon files that exist on disk with the right sizes', () => {
    for (const icon of manifest.icons as Array<Record<string, string>>) {
      const file = icon.src.replace(/^\//, '');
      const full = join(PUBLIC, file);
      expect(existsSync(full), `missing ${file}`).toBe(true);
      const { width, height } = pngDimensions(readFileSync(full));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });
});

describe('apple touch icon', () => {
  it('exists and is a 180x180 PNG', () => {
    const bytes = readFileSync(join(PUBLIC, 'apple-touch-icon.png'));
    const { width, height } = pngDimensions(bytes);
    expect(width).toBe(180);
    expect(height).toBe(180);
  });
});