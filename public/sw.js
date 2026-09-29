/* DeskcommCRM service worker (classic, framework-free). */
var CACHE_NAME = 'deskcomm-shell-v1';
var PRECACHE_URLS = ['/', '/manifest.webmanifest', '/favicon.svg'];
var SW_PATH = '/sw.js';
var MANIFEST = '/manifest.webmanifest';

function isStaticPath(pathname) {
  if (pathname === SW_PATH || pathname === MANIFEST) return true;
  if (pathname.startsWith('/_astro/')) return true;
  if (pathname.startsWith('/icon-')) return true;
  if (pathname === '/favicon.svg' || pathname === '/apple-touch-icon.png') {
    return true;
  }
  return /\/fonts\.(css|json)$/.test(pathname);
}

function cachePut(cache, req, res) {
  if (res.ok) cache.put(req, res.clone());
  return res;
}

function networkFirst(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return fetch(req).catch(function () {
      return cache.match(req).then(function (hit) {
        return hit || Promise.reject(new Error('offline'));
      });
    }).then(function (res) {
      cachePut(cache, req, res);
      return res;
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var revalidate = fetch(req)
        .then(function (res) {
          return cachePut(cache, req, res);
        })
        .catch(function () {
          return null;
        });
      return hit || revalidate;
    });
  });
}

function handle(req) {
  var pathname = new URL(req.url).pathname;
  if (req.mode === 'navigate') return networkFirst(req);
  if (isStaticPath(pathname)) return staleWhileRevalidate(req);
  return fetch(req);
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).then(function () {
        return self.skipWaiting();
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (name) {
            return name !== CACHE_NAME;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(handle(req));
});