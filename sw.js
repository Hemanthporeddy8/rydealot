var CACHE_NAME = 'rydealot-v25';
var urlsToCache = [
  './',
  './index.html',
  './alongwith.html',
  './track.html',
  './sage.html',
  './login.html',
  './signup.html',
  './profile.html',
  './offline.html',
  './sandbox.html',
  './style.css',
  './app.js',
  './offline-detector.js',
  './icon.svg',
  './manifest.json',
  './logo.png',
  './assets/mascot-offline.png',
  './assets/mascot-sage.png',
  './assets/mascot-waving.png',
  './assets/mascot-success.png',
  './assets/mascot-moving.png',
  './assets/mascot-offline.webp',
  './assets/mascot-sage.webp',
  './assets/mascot-waving.webp',
  './assets/mascot-success.webp',
  './assets/mascot-moving.webp',
  './assets/video/mascot-offline.mp4'
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

// Fetch: Network-first with immediate offline fallback to offline.html for navigation
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
        // If navigation request fails while offline, serve offline mascot screen directly
        var isHtmlNav = event.request.mode === 'navigate' ||
          (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));
        if (isHtmlNav) {
          return caches.match('./offline.html');
        }
        return caches.match(event.request);
      })
  );
});
