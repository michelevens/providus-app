const CACHE_NAME = 'credentik-v10';
const API_CACHE = 'credentik-api-v2';
const API_TTL = 60 * 60 * 1000; // 60 minutes
const API_MAX_ENTRIES = 100;

const SHELL_FILES = [
  './',
  './index.html',
  './ui/app.js',
  './ui/styles.css',
  './core/config.js',
  './core/auth.js',
  './core/store.js',
  './core/workflow.js',
  './core/batch-generator.js',
  './core/email-generator.js',
  './core/caqh-api.js',
  './core/taxonomy-api.js',
  './data/missing-payers-catalog.js',
  './ui/pages/tools.js',
  './ui/pages/funding.js',
  './ui/pages/billing.js',
  './ui/pages/compliance.js',
  './ui/pages/admin.js',
  './ui/pages/provider-profile.js',
  './ui/pages/billing-services.js',
  './ui/pages/rcm.js',
  './ui/pages/rcm-phase2.js',
  './ui/pages/revenue-cycle.js',
  './ui/pages/healthcare-credentialing.js',
  './ui/pages/compliance-hub.js',
  './ui/pages/workspace-hub.js',
  './ui/pages/analytics-hub.js',
  './ui/pages/command-center.js',
  './ui/pages/admin-hub.js',
  './manifest.json',
];

// API paths eligible for caching (GET only)
const CACHEABLE_API = [
  '/api/providers',
  '/api/applications',
  '/api/contracts',
  '/api/tasks',
  '/api/payers',
  '/api/documents',
  '/api/licenses',
  '/api/notifications',
  '/api/dashboard',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Trim API cache to max entries
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  }
}

// NetworkFirst strategy for API calls
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      const headers = new Headers(clone.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await clone.blob();
      const cachedResponse = new Response(body, { status: clone.status, statusText: clone.statusText, headers });
      await cache.put(request, cachedResponse);
      trimCache(API_CACHE, API_MAX_ENTRIES);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0');
      if (Date.now() - cachedAt < API_TTL) {
        return cached;
      }
    }
    throw err;
  }
}

function isCacheableApi(url) {
  return CACHEABLE_API.some(path => url.includes(path));
}

self.addEventListener('fetch', e => {
  const { request } = e;

  // NetworkFirst for cacheable GET API calls
  if (request.method === 'GET' && request.url.includes('/api/') && isCacheableApi(request.url)) {
    e.respondWith(networkFirst(request));
    return;
  }

  // Invalidate API cache on mutations
  if (request.url.includes('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    e.waitUntil(caches.open(API_CACHE).then(c => c.keys().then(keys =>
      Promise.all(keys.map(k => c.delete(k)))
    )));
    return;
  }

  // Skip non-cacheable API calls
  if (request.url.includes('/api/')) return;

  // Network-first for JS/CSS (always get latest), cache-first for other assets
  if (request.url.endsWith('.js') || request.url.endsWith('.css')) {
    e.respondWith(
      fetch(request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return r;
      }).catch(() => caches.match(request))
    );
    return;
  }
  e.respondWith(
    caches.match(request).then(r => r || fetch(request))
  );
});
