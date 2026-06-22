// public/sw.js - 푸시 알림을 받는 서비스 워커

// 푸시가 오면 알림 띄우기
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch { data = { title: '📸 모먼 시간!', body: '지금 다 같이 찍어요' } }

  const title = data.title || '📸 모먼 시간!'
  const options = {
    body: data.body || '지금 다 같이 찍어요',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭하면 앱 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  )
})