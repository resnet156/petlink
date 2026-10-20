/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope

// autoUpdate：新版本立即接管，避免用户停留在旧缓存
self.skipWaiting()
clientsClaim()

// Workbox 预缓存应用外壳（离线可用）
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ---- Web Push：服务器主动推送（应用后台/关闭也能收到）----
self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; url?: string } = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() }
  }
  const title = payload.title || 'PetLink'
  const options: NotificationOptions = {
    body: payload.body || '你有一条新的宠物提醒',
    icon: new URL('icon-192.png', self.registration.scope).href,
    badge: new URL('icon-192.png', self.registration.scope).href,
    tag: 'petlink-push',
    data: { url: payload.url || self.registration.scope },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return (c as WindowClient).focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
