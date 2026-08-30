// Taru Villas service worker.
// Scope: Web Push plus static shell assets. The offline data-sync tier is a
// separate project slice — never cache or queue portal data here.

const CACHE_NAME = 'taru-static-v1'

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      )
      await self.clients.claim()
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/TVPL.png'

  if (
    url.origin !== self.location.origin ||
    event.request.method !== 'GET' ||
    !isStaticAsset
  ) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request)
      if (cachedResponse) return cachedResponse

      const response = await fetch(event.request)
      if (response.ok) await cache.put(event.request, response.clone())
      return response
    }),
  )
})

self.addEventListener('push', (event) => {
  let data = { title: 'Taru Villas', body: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // Payload was not JSON — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/TVPL.png',
      badge: '/TVPL.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
