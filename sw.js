/* MEDTRIX Service Worker v1.0
   Enables Offline Capability & PWA features */

const CACHE_NAME = 'medtrix-core-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './medtrix_core.js',
    './config.js',
    './mock_engine.html',
    './settings.html',
    './logo_medtrix.jpeg',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Poppins:wght@300;400;600;700&display=swap'
];

// 1. INSTALL: Cache core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching App Shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// 2. ACTIVATE: Cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keyList => {
            return Promise.all(keyList.map(key => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});

// 3. FETCH: Offline-First Strategy
self.addEventListener('fetch', event => {
    // Skip cross-origin requests that aren't fonts/libs
    if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('cdn')) return;

    event.respondWith(
        caches.match(event.request).then(response => {
            // Return cached file if found
            if (response) return response;

            // Otherwise, fetch from network and cache it dynamically (For Q-Banks)
            return fetch(event.request).then(networkResponse => {
                // Check if valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Clone and Cache
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            });
        }).catch(() => {
            // If offline and not in cache, we can show a fallback (optional)
            // return caches.match('offline.html');
        })
    );
});
