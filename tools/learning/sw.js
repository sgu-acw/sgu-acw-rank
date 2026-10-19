// The runner origin has no API, login state or user source-code persistence.
const engineCache = 'learning-engine-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/packages/objects/')) {
    event.respondWith((async () => {
      for (const name of await caches.keys()) {
        if (!(name.startsWith('learning-package-') || name === 'learning-objects')) continue
        const hit = await (await caches.open(name)).match(event.request)
        if (hit) return hit
      }
      return fetch(event.request)
    })())
  } else if (url.pathname.startsWith('/engine/')) {
    event.respondWith((async () => {
      const cache = await caches.open(engineCache)
      try {
        const response = await fetch(event.request)
        if (response.ok) await cache.put(event.request, response.clone())
        return response
      } catch (error) {
        const cached = await cache.match(event.request)
        if (cached) return cached
        throw error
      }
    })())
  }
})
