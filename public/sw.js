// public/sw.js - 푸시 알림 + 자동 갱신 서비스 워커

// 버전: 배포할 때마다 올리면 옛 캐시가 정리됩니다 (날짜/숫자 아무거나)
const SW_VERSION = '2026-07-08-1'

// 새 서비스 워커가 설치되면 기다리지 않고 바로 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// 활성화되면: 옛 캐시 비우고, 열려있는 모든 탭을 이 워커가 즉시 제어
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 혹시 남아있는 옛 캐시 전부 삭제 (오래된 화면 잔재 방지)
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch {}
      await self.clients.claim()
    })()
  )
})

// 앱(페이지)에서 "지금 바로 갱신" 메시지를 보내면 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// 푸시가 오면 알림 띄우기
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch { data = { title: '📍 안부를 전할 시간이에요', body: '지금 다 같이 안부를 나눠요' } }

  const title = data.title || '📍 안부를 전할 시간이에요'
  const options = {
    body: data.body || '지금 다 같이 안부를 나눠요',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭하면 앱 열기 (이미 열려있으면 그 탭으로 포커스)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) { c.navigate(targetUrl); return c.focus() }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })()
  )
})
