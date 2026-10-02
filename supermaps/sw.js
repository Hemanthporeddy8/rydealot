// =========================================================================
// RYDEALOT SUPERMAPS — SERVICE WORKER (Network-First Auto-Updating Engine)
// =========================================================================

const CACHE_NAME = 'supermaps-v3.0';
const TILE_CACHE = 'supermaps-rolling-tiles';
const MAX_CACHED_TILES = 120;

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './supermaps.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
];

// Install: Cache current assets & activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate: Purge ALL stale caches (v1.0, etc.) immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== TILE_CACHE) {
            console.log('[SW] Evicting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Trim Tile Cache to prevent memory growth
async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_CACHED_TILES) {
    const evictCount = keys.length - MAX_CACHED_TILES;
    for (let i = 0; i < evictCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Fetch: NETWORK-FIRST for HTML/CSS/JS (Always fresh when online, cache when offline)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Handle Map Tiles
  if (url.hostname.includes('tile') || url.pathname.includes('/tile/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(TILE_CACHE).then((cache) => {
              cache.put(event.request, clone);
              trimTileCache();
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#141416"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        })
    );
    return;
  }

  // 2. Network-First Strategy for App Assets (Prevents stale code bugs)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Only if offline, serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
