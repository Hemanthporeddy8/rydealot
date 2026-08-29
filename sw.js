var CACHE_NAME = 'rydealot-v11';
var urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.svg',
  './manifest.json'
];

// Install: cache files
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate: delete ALL old caches immediately
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

// Fetch: NETWORK FIRST for local GET assets, BYPASS API and non-GET calls
self.addEventListener('fetch', function(event) {
  // Never intercept non-GET requests (POST, PATCH, DELETE) or Supabase API calls
  if (event.request.method !== 'GET' || event.request.url.indexOf('supabase.co') !== -1) {
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
        return caches.match(event.request);
      })
  );
});

