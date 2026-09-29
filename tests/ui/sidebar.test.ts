// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  ATELIE_GROUP, CRM_GROUP, NAV_ENTRIES, NAV_GROUPS,
  NAV_STORAGE_KEY, bindNavToggles, readOpenGroups,
  renderSidebar, toggleGroup,
} from '../../src/ui/Sidebar';

const LABELS = NAV_GROUPS.map((group) => group.label);

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null =>
      (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string): void => { map.set(key, value); },
    dump: (): Record<string, string> => Object.fromEntries(map),
  };
}

const throwingStorage = {
  getItem(): string | null { throw new Error('blocked'); },
  setItem(): void { throw new Error('blocked'); },
};

function toggleHtml(html: string, label: string): string {
  const found = html.match(
    new RegExp(`<button[^>]*data-nav-toggle="${label}"[^>]*>`),
  );
  expect(found).not.toBeNull();
  return found![0];
}

describe('renderSidebar', () => {
  it('renders the brand and a dropdown toggle for every group', () => {
    const html = renderSidebar('/');
    expect(html).toContain('DeskcommCRM');
    for (const group of NAV_GROUPS) {
      expect(html).toContain(`data-nav-toggle="${group.label}"`);
      expect(html).toContain(`aria-controls="nav-list-${groupSlug(group.label)}"`);
      expect(html).toContain(`>${group.label}</span>`);
    }
  });

  it('renders every menu item so the menus work from a fresh start', () => {
    const html = renderSidebar('/');
    for (const entry of NAV_ENTRIES) {
      expect(html).toContain(`href="#${entry.path}"`);
      expect(html).toContain(`data-icon="${entry.icon}"`);
      expect(html).toContain(`>${entry.label}</a>`);
    }
  });

  it('marks only the active item as active', () => {
    const html = renderSidebar('/contatos');
    expect(html).toContain('class="nav-item active" href="#/contatos"');
    expect(html.match(/class="nav-item active"/g)).toHaveLength(1);
  });

  it('shows the D1 footer when no app context is given', () => {
    expect(renderSidebar('/')).toContain('Dados em Cloudflare D1');
  });

  it('keeps every entry path unique so no menu link collides', () => {
    const paths = NAV_ENTRIES.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('menu dropdown state', () => {
  it('expands every group when nothing has been saved', () => {
    const html = renderSidebar('/', undefined, memoryStorage());
    for (const label of LABELS) {
      expect(toggleHtml(html, label)).toContain('aria-expanded="true"');
    }
  });

  it('collapses a group missing from the saved list', () => {
    const storage = memoryStorage({
      [NAV_STORAGE_KEY]: JSON.stringify([ATELIE_GROUP.label]),
    });
    const html = renderSidebar('/', undefined, storage);
    expect(toggleHtml(html, CRM_GROUP.label)).toContain('aria-expanded="false"');
    expect(toggleHtml(html, ATELIE_GROUP.label)).toContain('aria-expanded="true"');
  });

  it('keeps menus expanded on a corrupt saved payload instead of breaking', () => {
    const storage = memoryStorage({ [NAV_STORAGE_KEY]: '{not valid json' });
    const html = renderSidebar('/', undefined, storage);
    for (const label of LABELS) {
      expect(toggleHtml(html, label)).toContain('aria-expanded="true"');
    }
  });
});

describe('menu group storage', () => {
  it('readOpenGroups parses a stored list of open labels', () => {
    const storage = memoryStorage({
      [NAV_STORAGE_KEY]: JSON.stringify(['Vendas', 'Ateliê']),
    });
    expect(readOpenGroups(storage)).toEqual(['Vendas', 'Ateliê']);
  });

  it('readOpenGroups returns null when absent, malformed or not a list', () => {
    expect(readOpenGroups(memoryStorage())).toBeNull();
    expect(readOpenGroups(memoryStorage({ [NAV_STORAGE_KEY]: 'nope' })))
      .toBeNull();
    expect(readOpenGroups(memoryStorage({ [NAV_STORAGE_KEY]: '{"a":1}' })))
      .toBeNull();
  });

  it('readOpenGroups tolerates storage errors and drops non-string entries', () => {
    expect(readOpenGroups(throwingStorage)).toBeNull();
    const storage = memoryStorage({
      [NAV_STORAGE_KEY]: JSON.stringify(['Vendas', 3, null]),
    });
    expect(readOpenGroups(storage)).toEqual(['Vendas']);
  });

  it('toggleGroup flips membership and persists it', () => {
    const storage = memoryStorage();
    expect(toggleGroup('Vendas', storage)).toEqual(['Vendas']);
    expect(storage.dump()[NAV_STORAGE_KEY]).toBe('["Vendas"]');
    expect(toggleGroup('Vendas', storage)).toEqual([]);
    expect(storage.dump()[NAV_STORAGE_KEY]).toBe('[]');
  });

  it('toggleGroup still returns the toggled list when persistence throws', () => {
    expect(toggleGroup('Ateliê', throwingStorage)).toEqual(['Ateliê']);
  });
});

describe('menu toggle wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collapses and re-expands a group through clicks', () => {
    const storage = memoryStorage();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const render = (): void => {
      root.innerHTML = renderSidebar('/', undefined, storage);
    };
    const click = (label: string): void => {
      root.querySelector<HTMLElement>(`[data-nav-toggle="${label}"]`)!
        .dispatchEvent(new Event('click', { bubbles: true }));
      render();
    };

    const changed: string[][] = [];
    bindNavToggles(root, storage, (groups) => changed.push(groups));
    storage.setItem(NAV_STORAGE_KEY, JSON.stringify([]));
    render();

    click(CRM_GROUP.label);
    expect(toggleHtml(root.innerHTML, CRM_GROUP.label))
      .toContain('aria-expanded="true"');
    expect(toggleHtml(root.innerHTML, ATELIE_GROUP.label))
      .toContain('aria-expanded="false"');
    expect(changed).toEqual([[CRM_GROUP.label]]);

    click(CRM_GROUP.label);
    expect(toggleHtml(root.innerHTML, CRM_GROUP.label))
      .toContain('aria-expanded="false"');

    click(ATELIE_GROUP.label);
    expect(toggleHtml(root.innerHTML, ATELIE_GROUP.label))
      .toContain('aria-expanded="true"');
    expect(changed).toEqual([
      [CRM_GROUP.label],
      [],
      [ATELIE_GROUP.label],
    ]);
  });
});

describe('route regression', () => {
  it('points Componentes at the registered /atelie/components route', () => {
    const entry = NAV_ENTRIES.find((item) => item.label === 'Componentes');
    expect(entry?.path).toBe('/atelie/components');
  });
});

function groupSlug(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return slug || 'grupo';
}