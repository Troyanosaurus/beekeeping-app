// sw.js — offline support for Beekeeping App (GitHub Pages subpath)
// Scope: /beekeeping-app/   (register from that path)

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Build absolute URLs from the SW scope (works on GitHub Pages subpaths)
const fromScope = (path) => new URL(path, self.registration.scope).toString();

// App shell (same-origin) to pre-cache
const APP_SHELL = [
  fromScope('./'), // index.html
  fromScope('./index.html'),
  fromScope('./app.jsx'),
  fromScope('./manifest.webmanifest'),
  fromScope('./icons/icon-192.png'),
  fromScope('./icons/icon-512.png'),
  fromScope('./icons/maskable-512.png'),
  fromScope('./icons/apple-touch-icon.png'),
];

// CDN hosts we’ll runtime-cache with Stale-While-Revalidate
const CDN_ALLOWLIST = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => ![STATIC_CACHE, RUNTIME_CACHE].includes(n))
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Simple helpers
const isGET = (req) => req.method === 'GET';
const isSameOrigin = (reqUrl) => reqUrl.origin === self.location.origin;
const isCDN = (reqUrl) => CDN_ALLOWLIST.some(host => reqUrl.host === host);

// Cache strategies
async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached; // last resort
  }
}

async function networkFirstNavigate(req) {
  // For SPA-style navigations: try network, fall back to cached index.html offline
  try {
    const res = await fetch(req);
    return res;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const fallback = await cache.match(fromScope('./index.html'));
    return fallback || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchAndUpdate = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  // Return cached immediately if present; otherwise wait for network
  return cached || fetchAndUpdate || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isGET(request)) return;

  const url = new URL(request.url);

  // Handle SPA navigations
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // Same-origin static assets → cache-first
  if (isSameOrigin(url)) {
    const isStatic = /\.(?:js|jsx|css|png|jpg|jpeg|gif|svg|webmanifest|json)$/.test(url.pathname);
    if (isStatic) {
      event.respondWith(cacheFirst(request));
      return;
    }
  }

  // CDN resources → stale-while-revalidate (works after first online visit)
  if (isCDN(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: pass through
});
