const CACHE_NAME = 'printflow-pwa-v9';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico',
  '/favicon.png',
  '/icons/neon-logo-192.png',
  '/icons/neon-logo-512.png',
  '/icons/neon-logo-maskable-192.png',
  '/icons/neon-logo-maskable-512.png',
  '/icons/neon-touch-icon.png',
  '/icons/neon-favicon.png',
  '/neon-logo-192.png',
  '/neon-logo-512.png',
  '/neon-touch-icon.png',
  '/apple-touch-icon.png'
];

// Install event: cache core shell assets without forcing immediate skipWaiting
self.addEventListener('install', (event) => {
  // Do NOT call self.skipWaiting() here automatically.
  // This prevents the new SW from hijacking active sessions mid-operation.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            // Soft failure for optional assets
          }
        })
      );
    })
  );
});

// Activate event: safely clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

// Message listener for controlled user-driven updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

// Fetch event: Network-first for navigation & code, Cache-first for static media
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass non-GET, Supabase database/auth requests, and dev server internals
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('/node_modules/') ||
    url.search.includes('t=')
  ) {
    return;
  }

  // 1. Navigation requests (SPA pages): Network-First, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PrintFlow 3D - Offline</title></head><body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h1>PrintFlow 3D</h1><p>Você está sem conexão com a internet. Conecte-se para sincronizar seus dados.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
          );
        })
    );
    return;
  }

  // 2. Static media assets (icons, images, fonts, manifest): Cache-First
  const isStaticMedia =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(url.pathname);

  if (isStaticMedia) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
      })
    );
    return;
  }

  // 3. Scripts, styles, and other resources: Network-First to guarantee compatibility
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
