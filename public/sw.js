/* Volt-On CRM service worker.
 * Caches ONLY static files (app code, fonts, icons) so the app opens fast.
 * Pages and API calls always go to the network — customer data is never stored on the phone.
 * When the network is down, pages show /offline.html. */
const VERSION = 'v1'
const STATIC = `volton-static-${VERSION}`
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/brand/volton-logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('volton-') && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }
  const isStatic = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/')
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC).then((cache) => cache.put(request, copy))
            }
            return res
          }),
      ),
    )
  }
})
