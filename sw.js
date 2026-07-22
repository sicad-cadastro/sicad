// SICAD Service Worker — v5 (2026-07-15)
// Estratégia: NETWORK-FIRST pro index.html + navigation (garante sempre versão nova),
// cache-first pra assets estáticos externos (CDN libs, tiles).
const CACHE_NAME = 'sicad-v5-2026-07-15-network-first';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs — sempre network-only, nunca cacheia
  const noCacheHosts = ['supabase.co', 'brasilapi.com.br', 'viacep.com.br', 'awesomeapi.com.br', 'nominatim.openstreetmap.org', 'api.supabase.com'];
  if (noCacheHosts.some((h) => url.hostname.includes(h))) return;

  if (event.request.method !== 'GET') return;

  // Navegação (index.html, /) → NETWORK-FIRST — garante versão nova sempre
  // Cai no cache SÓ se estiver offline
  const isNavigation = event.request.mode === 'navigate' ||
                       url.pathname.endsWith('/') ||
                       url.pathname.endsWith('/index.html');
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
        }
        return response;
      }).catch(() => caches.match(event.request).then((c) => c || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Assets estáticos → cache-first (rápido) com revalidação em background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type !== 'error') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
      return cached || fetchPromise;
    })
  );
});
