import { describe, expect, it } from 'vitest';
import {
  PWA_CACHE_SHELL,
  PWA_CACHE_VERSION,
  PWA_MANIFEST_PATH,
  PWA_PRECACHE_URLS,
  PWA_SW_PATH,
  cacheableRequest,
  isStaticPath,
  pwaCacheName,
  routeKind,
  type PwaUrl
} from '../../src/domain/pwa';

function url(
  pathname: string,
  mode = 'cors',
  sameOrigin = true
): PwaUrl {
  return { pathname, mode, sameOrigin };
}

describe('routeKind', () => {
  it('prioritises navigations as pages even when path is static-looking', () => {
    expect(routeKind(url('/', 'navigate'))).toBe('page');
    expect(routeKind(url('/_astro/app.js', 'navigate'))).toBe('page');
  });

  it('never touches cross-origin requests with any strategy', () => {
    expect(routeKind(url('/x', 'cors', false))).toBe('other');
    expect(routeKind(url('/api/contacts', 'cors', false))).toBe('other');
  });

  it('leaves /api/ to the network under all modes', () => {
    for (const mode of ['cors', 'navigate', 'no-cors']) {
      expect(routeKind(url('/api/inbox', mode))).toBe('api');
    }
  });

  it('classifies shell assets as static', () => {
    expect(routeKind(url('/_astro/app.a1b2.js'))).toBe('static');
    expect(routeKind(url('/icon-192.png'))).toBe('static');
    expect(routeKind(url('/favicon.svg'))).toBe('static');
    expect(routeKind(url('/sw.js'))).toBe('static');
    expect(routeKind(url('/manifest.webmanifest'))).toBe('static');
  });

  it('keeps anything else on the network', () => {
    for (const path of ['/favicon.ico', '/index.html', '/robots.txt']) {
      expect(routeKind(url(path))).toBe('other');
    }
  });
});

describe('isStaticPath', () => {
  it('recognises the PWA entry points', () => {
    expect(isStaticPath('/sw.js')).toBe(true);
    expect(isStaticPath('/manifest.webmanifest')).toBe(true);
    expect(isStaticPath('/favicon.svg')).toBe(true);
    expect(isStaticPath('/apple-touch-icon.png')).toBe(true);
  });

  it('recognises the hashed bundle and icon families', () => {
    expect(isStaticPath('/_astro/crm.e4f56.js')).toBe(true);
    expect(isStaticPath('/_astro/fonts-2x3y.css')).toBe(true);
    expect(isStaticPath('/icon-maskable-512.png')).toBe(true);
    expect(isStaticPath('/icon-maskable-512.png?v=2')).toBe(true);
    expect(isStaticPath('/_astro/fonts-most.woff2.json')).toBe(true);
  });

  it('rejects user data and plain routes', () => {
    for (const path of ['/', '/inbox', '/api/contacts', '/favicon.ico']) {
      expect(isStaticPath(path)).toBe(false);
    }
  });
});

describe('cacheableRequest', () => {
  it('only serves static assets from caches', () => {
    expect(cacheableRequest(url('/_astro/app.js'))).toBe(true);
    expect(cacheableRequest(url('/api/inbox', 'navigate'))).toBe(false);
    expect(cacheableRequest(url('/', 'navigate'))).toBe(false);
    expect(cacheableRequest(url('/x', 'cors', false))).toBe(false);
  });
});

describe('version pin', () => {
  it('carries the version in the cache name so deploys wipe atomically', () => {
    expect(PWA_CACHE_VERSION).toBe('v1');
    expect(PWA_CACHE_SHELL).toBe('deskcomm-shell-v1');
    expect(pwaCacheName()).toBe(PWA_CACHE_SHELL);
  });

  it('references the worker and manifest paths the assets are served at', () => {
    expect(PWA_SW_PATH).toBe('/sw.js');
    expect(PWA_MANIFEST_PATH).toBe('/manifest.webmanifest');
  });

  it('precaches exactly the shell document, manifest and favicon', () => {
    expect(PWA_PRECACHE_URLS).toEqual([
      '/',
      '/manifest.webmanifest',
      '/favicon.svg'
    ]);
  });
});