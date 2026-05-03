// 笔记 · service worker — basic offline caching.
const CACHE = 'biji-v2';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'src/tokens.jsx',
  'src/icons.jsx',
  'src/store.jsx',
  'src/components.jsx',
  'src/screen-capture.jsx',
  'src/screen-list.jsx',
  'src/screen-detail.jsx',
  'src/screen-yan.jsx',
  'src/screen-settings.jsx',
  'src/screen-onboard.jsx',
  'src/screen-search.jsx',
  'src/screen-tags.jsx',
  'src/app.jsx',
  'src/main.jsx',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
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
  // Network-first for fonts (so they update), cache-first for everything else.
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const clone = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && e.request.method === 'GET') {
        const clone = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match('index.html')))
  );
});
