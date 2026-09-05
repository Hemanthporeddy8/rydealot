var CACHE_NAME = 'rydealot-v17';
var urlsToCache = [
  './',
  './index.html',
  './sage.html',
  './login.html',
  './profile.html',
  './offline.html',
  './style.css',
  './app.js',
  './icon.svg',
  './manifest.json',
  './logo.png'
];

// Install: cache essential assets and offline fallback page
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate: purge older caches immediately
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: Network-first with automatic offline fallback to offline.html
self.addEventListener('fetch', function(event) {
  // Bypass API and non-GET calls
  if (event.request.method !== 'GET' || event.request.url.indexOf('supabase.co') !== -1 || event.request.url.indexOf('/api/') !== -1) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request).then(function(cachedResp) {
          if (cachedResp) return cachedResp;
          // If HTML page request fails and is not cached, return custom offline mascot page
          if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
            return caches.match('./offline.html');
          }
        });
      })
  );
});
