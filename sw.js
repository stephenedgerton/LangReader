// Offline support: app shell is cached; translation requests always go to the network.
const VERSION = 'langreader-v12';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/text.js', 'js/vocab.js', 'js/settings.js', 'js/services.js',
  'js/ui.js', 'js/stats.js', 'js/wordcard.js', 'js/reader.js', 'js/importer.js', 'js/dictionary.js', 'js/storage.js', 'js/bubble.js', 'js/curl.js', 'js/haptics.js', 'js/names.js', 'js/goals.js', 'js/difficulty.js', 'js/achievements.js',
  'samples/sample.js', 'samples/stories.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first for same-origin files (so updates show up), falling back to the cache offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
