/* MacroQuest Service Worker — handles incoming web push notifications.
 * Kept dependency-free and defensive: a malformed payload must never throw
 * in a way that drops the notification. */

self.addEventListener('install', (event) => {
  // Activate this SW immediately instead of waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    // Fall back to plain text if the payload wasn't JSON
    data = { title: 'MacroQuest', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || '⚔️ MacroQuest'
  const options = {
    body: data.body || 'Time to continue your quest!',
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'macroquest',          // collapses duplicates of same type
    renotify: true,
    data: { url: data.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, else open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})
