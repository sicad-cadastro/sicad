// SICAD Service Worker — cache estratégia network-first com fallback
// Garante operação básica offline depois da primeira carga
const CACHE_NAME = 'sicad-v2-2026-06-04-dedup-perf';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate — limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — estratégia diferenciada por tipo
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não cacheia: API Supabase, BrasilAPI, Nominatim, OCR models (dinâmico)
  const noCacheHosts = ['supabase.co', 'brasilapi.com.br', 'viacep.com.br', 'awesomeapi.com.br', 'nominatim.openstreetmap.org', 'api.supabase.com'];
  if (noCacheHosts.some((h) => url.hostname.includes(h))) {
    // Network-only — não cacheia chamadas de API
    return;
  }

  // GET de assets (JS, CSS, fonts, tiles) — cache-first com revalidação
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          // Só cacheia respostas válidas (2xx) e do mesmo origin OU CDNs conhecidos
          if (response && response.status === 200 && response.type !== 'error') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {});
            });
          }
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
        return cached || fetchPromise;
      })
    );
  }
});
