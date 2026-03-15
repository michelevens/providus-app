const CACHE_NAME = 'credentik-v2';
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
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // Don't cache API calls
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
