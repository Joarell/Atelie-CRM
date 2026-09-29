import { describe, expect, it } from 'vitest';
import { PATHS, icon, type IconName } from '../../src/ui/icons';
import { NAV_ENTRIES } from '../../src/ui/Sidebar';

describe('icon() contract', () => {
  it('emits a well-formed inline SVG for every defined glyph', () => {
    for (const name of Object.keys(PATHS) as IconName[]) {
      const svg = icon(name, 'x');
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain(`data-icon="${name}"`);
      expect(svg).toContain('class="icon x"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('stroke-width="1.6"');
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).toContain('stroke-linejoin="round"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).not.toContain('NaN');
    }
  });

  it('closes every child element before the svg tag', () => {
    const svg = icon('chat');
    const children = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length);
    expect(children).toMatch(/\/>$/);
    expect(children.split('>').filter((p) => p && !p.endsWith('/')).length)
      .toBe(0);
  });

  it('renders every icon used by the sidebar menu', () => {
    const used = NAV_ENTRIES.map((entry) => entry.icon);
    expect(used).toContain('chat');
    for (const name of used) {
      const svg = icon(name);
      expect(svg).toMatch(/<path|<rect|<circle/);
      expect(svg).not.toContain('NaN');
    }
  });

  it('demands a shared drawing contract across all glyphs', () => {
    for (const name of Object.keys(PATHS) as IconName[]) {
      for (const element of PATHS[name]) {
        expect(element.trim().endsWith('/>')).toBe(true);
      }
    }
  });
});