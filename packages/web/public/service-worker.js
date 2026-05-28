const shellCache = 'nullcity-shell-v1';
const shellAssets = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(shellCache)
      .then(cache => cache.addAll(shellAssets))
      .finally(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== shellCache).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/rs') || url.pathname.startsWith('/v1')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && (request.mode === 'navigate' || url.pathname.startsWith('/assets/') || shellAssets.includes(url.pathname))) {
          const copy = response.clone();
          caches.open(shellCache).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          return shell || Response.error();
        }
        return Response.error();
      }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client && new URL(client.url).origin === self.location.origin) {
          if ('navigate' in client) return client.navigate(targetUrl).then(navigated => (navigated || client).focus());
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
