/**
 * Service Worker for Westlake Leaf Collection Tracker
 * Provides offline support and caching for PWA functionality
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `leaf-tracker-${CACHE_VERSION}`;
const API_CACHE = `leaf-tracker-api-${CACHE_VERSION}`;

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/tailwind.css',
  '/images/sebastian-volkel-7QT_puk5CJQ-unsplash.jpg.webp',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/htm@3.1.1/dist/htm.umd.js',
  'https://unpkg.com/gsap@3.12.2/dist/gsap.min.js',
  'https://unpkg.com/dompurify@3.0.6/dist/purify.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete caches that don't match current version
              return cacheName.startsWith('leaf-tracker-') && 
                     cacheName !== CACHE_NAME && 
                     cacheName !== API_CACHE;
            })
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle API requests (network first, fallback to cache)
  if (url.pathname.startsWith('/api/')) {
    // Don't cache POST requests
    if (request.method === 'POST') {
      event.respondWith(fetch(request));
      return;
    }
    
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone response before caching
          const responseClone = response.clone();
          
          // Cache successful API responses (GET only)
          if (response.ok && request.method === 'GET') {
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache
          console.log('[Service Worker] Network failed, serving API from cache:', url.pathname);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Return offline fallback for API
            return new Response(
              JSON.stringify({
                records: [],
                offline: true,
                message: 'You are offline. Showing cached data.'
              }),
              {
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }
  
  // Handle static assets (cache first, fallback to network)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {
            // Ignore network errors when updating cache
          });
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(request).then((response) => {
          // Don't cache non-successful responses
          if (!response.ok) {
            return response;
          }
          
          // Clone response before caching
          const responseClone = response.clone();
          
          // Cache the response for future use
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          
          return response;
        });
      })
      .catch((error) => {
        console.error('[Service Worker] Fetch failed:', error);
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        
        throw error;
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[Service Worker] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Background sync for future enhancements
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Implement sync logic here
      Promise.resolve()
    );
  }
});

console.log('[Service Worker] Loaded');
