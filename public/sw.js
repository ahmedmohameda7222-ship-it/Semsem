const cacheName = 'our-space-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName)
      const response = await fetch('/index.html', { cache: 'reload' })
      if (!response.ok) throw new Error('Could not load Our Space shell')
      const html = await response.clone().text()
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((match) => match[1])
      await cache.addAll([
        '/manifest.webmanifest',
        '/icons/192.png',
        '/icons/512.png',
        '/icons/apple.png',
        ...assets,
      ])
      await cache.put('/index.html', response)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('our-space-shell-') && name !== cacheName)
          await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match('/index.html')) ?? Response.error(),
      ),
    )
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () =>
        (await caches.match(event.request)) ?? fetch(event.request))(),
    )
  }
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const data = event.data?.json()
      if (!data || !/^[0-9a-f-]{36}$/i.test(data.entry)) return
      await self.registration.showNotification(data.title || 'Our Space', {
        body: data.body || 'You have a new message.',
        tag: data.entry,
        renotify: false,
        icon: '/icons/192.png',
        data: { entry: data.entry },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const entry = event.notification.data?.entry
  if (!/^[0-9a-f-]{36}$/i.test(entry ?? '')) return
  const path = '/chat?entry=' + encodeURIComponent(entry)
  event.waitUntil(
    (async () => {
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        if (new URL(client.url).origin === self.location.origin) {
          const navigated = await client.navigate(path)
          if (navigated) return navigated.focus()
        }
      }
      return self.clients.openWindow(path)
    })(),
  )
})
