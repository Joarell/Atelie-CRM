// PWA routing constants and pure decision helpers, framework-free like the
// rest of the domain: `public/sw.js` mirrors these strings and the unit tests
// pin them (and execute the SW itself) so a rename never desyncs the worker.
export const PWA_CACHE_VERSION = 'v1';
export const PWA_SW_PATH = '/sw.js';
export const PWA_MANIFEST_PATH = '/manifest.webmanifest';

// Everything the SW places in the shell cache at install time (the shell
// document first: the hashed /_astro/* assets are SWR'd on first visit).
export const PWA_PRECACHE_URLS = [
  '/',
  PWA_MANIFEST_PATH,
  '/favicon.svg'
];

export const PWA_CACHE_SHELL = `deskcomm-shell-${PWA_CACHE_VERSION}`;

export type PwaRoute = 'page' | 'api' | 'static' | 'other';

export interface PwaUrl {
  pathname: string;
  mode: string;
  sameOrigin: boolean;
}

// The SW *cache* strategy per request kind:
// - page: navigation document -> network-first, cached shell fallback
// - static: hashed shell assets -> stale-while-revalidate
// - api: /api/* -> never intercepted (network only, auth + live D1 data)
// - other: everything else -> network only
export function routeKind(url: PwaUrl): PwaRoute {
  if (!url.sameOrigin) return 'other';
  if (url.pathname.startsWith('/api/')) return 'api';
  if (url.mode === 'navigate') return 'page';
  if (isStaticPath(url.pathname)) return 'static';
  return 'other';
}

// Static app-shell artifacts: the hashed bundle under /_astro/ plus the PWA
// assets the manifest links to. Hashed names change each build, so they are
// cached at runtime (SWR), never listed in the precache array.
export function isStaticPath(pathname: string): boolean {
  if (pathname === PWA_SW_PATH || pathname === PWA_MANIFEST_PATH) {
    return true;
  }
  if (pathname.startsWith('/_astro/')) return true;
  if (pathname.startsWith('/icon-')) return true;
  if (pathname === '/favicon.svg' || pathname === '/apple-touch-icon.png') {
    return true;
  }
  return /\/fonts\.(css|json)$/.test(pathname);
}

// Whether the worker may serve this GET from its caches at all.
export function cacheableRequest(url: PwaUrl): boolean {
  return routeKind(url) === 'static';
}

// One versioned cache holds the whole shell so a deploy wipes it atomically.
export function pwaCacheName(): string {
  return PWA_CACHE_SHELL;
}