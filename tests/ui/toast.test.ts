// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ToastModule from '../../src/ui/Toast';

// Toast.ts caches its container in a module-level variable, so each test needs
// a fresh module instance or it would share the previous test's DOM.
type Toast = typeof ToastModule;
let toast: Toast;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  toast = await import('../../src/ui/Toast');
});

afterEach(() => {
  vi.useRealTimers();
});

function texts(): string[] {
  return [...document.querySelectorAll('.toast')].map((el) => el.textContent ?? '');
}

describe('clearToast', () => {
  // The regression: a submit on one screen confirmed with a toast, then the
  // view was replaced (navigation, logout, or the footer refresh). The message
  // outlived the screen that produced it and read as if the NEW screen had just
  // been saved.
  it('drops the pending message when the view is replaced', () => {
    toast.showToast('Contato salvo');
    expect(texts()).toEqual(['Contato salvo']);

    toast.clearToast();

    expect(texts()).toEqual([]);
  });

  it('is safe before any toast was ever shown', () => {
    expect(() => toast.clearToast()).not.toThrow();
    expect(texts()).toEqual([]);
  });

  it('keeps working for the message shown after the clear', () => {
    toast.showToast('Contato salvo');
    toast.clearToast();
    toast.showToast('Evento salvo');
    expect(texts()).toEqual(['Evento salvo']);
  });

  it('leaves the container reusable for later toasts', () => {
    toast.showToast('Contato salvo');
    toast.clearToast();
    toast.showToast('Contato salvo');
    expect(document.querySelectorAll('.toast-wrap')).toHaveLength(1);
    expect(texts()).toEqual(['Contato salvo']);
  });

  // The auto-dismiss timer captured the element before the clear; firing it
  // afterwards must stay a harmless no-op instead of throwing or restoring it.
  it('survives the auto-dismiss timer firing after the clear', () => {
    vi.useFakeTimers();
    toast.showToast('Contato salvo');
    toast.clearToast();
    expect(() => vi.advanceTimersByTime(2600)).not.toThrow();
    expect(texts()).toEqual([]);
  });
});

describe('showToast', () => {
  it('auto-dismisses after its timeout', () => {
    vi.useFakeTimers();
    toast.showToast('Contato salvo');
    expect(texts()).toEqual(['Contato salvo']);
    vi.advanceTimersByTime(2600);
    expect(texts()).toEqual([]);
  });

  it('lets the newest message replace a still-visible older one', () => {
    toast.showToast('Contato salvo');
    toast.showToast('Evento salvo');
    expect(texts()).toEqual(['Evento salvo']);
  });
});

// main.ts runs boot() on import, so buildActivator cannot be unit-tested
// directly. Guard the wiring by source instead — the ORDER matters: clearing
// after the outgoing view is disposed is what makes the message die with the
// screen that produced it.
describe('activate wiring', () => {
  // happy-dom rewrites import.meta.url to an http URL, so the path has to be
  // resolved from the cwd instead of from import.meta.url.
  const source = readFileSync(
    resolve(process.cwd(), 'src/main.ts'),
    'utf8'
  );

  it('clears the toast right after disposing the view it replaces', () => {
    expect(source).toMatch(
      /disposeCurrentView\?\.\(\);\s*\n\s*clearToast\(\);/
    );
  });
});