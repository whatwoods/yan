// 笔记 · service worker — Vite-aware offline caching.
const CACHE = 'yan-v4';
const PRECACHE = [
  './',
  'index.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      fetch('./index.html').then((res) => {
        if (res.ok) {
          return res.clone().text().then((html) => {
            const assetUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
              .map((m) => m[1]);
            return cache.addAll([...PRECACHE, ...assetUrls]).then(() => res);
          });
        }
        return cache.addAll(PRECACHE).then(() => res);
      })
    ).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    // Network-first for fonts
    if (url.hostname.includes('fonts.font.im') || url.hostname.includes('gstatic.font.im') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
      e.respondWith(
        fetch(e.request).then((r) => {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return r;
        }).catch(() => caches.match(e.request))
      );
    }
    return;
  }

  // Vite hashed assets (cache-first — immutable by filename)
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((r) => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return r;
        });
      })
    );
    return;
  }

  // Network-first for HTML (always get latest shell)
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const clone = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest, etc.)
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((r) => {
        if (r.ok && e.request.method === 'GET') {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match('./'));
    })
  );
});
