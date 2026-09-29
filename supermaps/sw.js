// =========================================================================
// RYDEALOT SUPERMAPS — SERVICE WORKER (Rolling 5KM Buffer & Offline Engine)
// =========================================================================

const CACHE_NAME = 'supermaps-v1.0';
const TILE_CACHE = 'supermaps-rolling-tiles';
const MAX_CACHED_TILES = 120; // Keeps RAM usage strictly under 3 MB for potato phones

const STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './style.css',
  './supermaps.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
];

// Install Event: Cache core application assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== TILE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Trim Tile Cache to prevent memory growth (FIFO Sliding Window)
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

// Fetch Handler: Network-first with Rolling Cache Fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Handle Map Tiles (CartoDB, OpenStreetMap, or custom tiles)
  if (url.hostname.includes('tile') || url.pathname.includes('/tile/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(TILE_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
              trimTileCache();
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Dead Zone Trigger: Retrieve from rolling buffer cache
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback transparent 1x1 tile if outside buffer
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#141416"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        })
    );
    return;
  }

  // 2. Handle Application Shell & Static Assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback for HTML documents if completely offline
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
