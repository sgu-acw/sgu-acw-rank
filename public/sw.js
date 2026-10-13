/**
 * Web Push 的 service worker。
 *
 * 页面关着也能收到推送——这是它和「页面里的弹窗」的本质区别。
 * 收到 push 就显示一条系统通知；点了通知就开对应页面。
 */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || '通知', {
      body: data.body || '',
      // 图标必须是位图：Chrome/Edge 的系统通知不渲染 SVG，会用白块代替。
      // icon-192 是白底黑标的固定渲染，深浅色系统主题下都可见。
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
