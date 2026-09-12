const CACHE = 'yn-customer-shell-v1';
const SHELL = ['/', '/login', '/index.html', '/manifest.webmanifest', '/pwa-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  // Customer order/payment/loan data must always be live, never stale cached API data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/orders') || url.pathname.startsWith('/loans') || url.pathname.startsWith('/customer/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(r => r || caches.match('/index.html'))));
});
