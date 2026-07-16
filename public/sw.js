const CACHE = 'cana-v2';
const SHELL = [
  '/', '/dashboard.html', '/cana.html', '/vault.html', '/profile.html',
  '/cana-core.js', '/cana-sq.js', '/cana.css',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }).catch(function(){})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Network first for API calls, cache first for assets
  if (e.request.url.includes('/.netlify/') || e.request.url.includes('supabase.co') || e.request.url.includes('stripe.com')) {
    return; // Always network for API
  }
  e.respondWith(
    fetch(e.request).then(function(res) {
      var clone = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
