const CACHE = 'yn-admin-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  // Never cache API/data responses: admin must always see live orders/payments/loans.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/orders') || url.pathname.startsWith('/customers') || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/loans')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(r => r || caches.match('/index.html'))));
});
