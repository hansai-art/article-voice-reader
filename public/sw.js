// 每次部署新版時遞增這個版本號
const CACHE_VERSION = 2;
const CACHE_NAME = `article-voice-reader-v${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Install: cache static assets, skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches, claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
     .then(() => {
       // Notify all clients to reload
       self.clients.matchAll({ type: 'window' }).then((clients) => {
         clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
       });
     })
  );
});

// Fetch: network-first for EVERYTHING (no more stale cache)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache the fresh response for offline fallback
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        // Offline: fallback to cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation, fallback to index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
