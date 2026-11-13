// Service Worker der Dragons Kasse – nur für Push-Benachrichtigungen.
// Absichtlich KEIN Zwischenspeicher (kein fetch-Handler): Updates der App kommen wie bisher sofort an.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  // iOS verlangt, dass jede Push-Nachricht auch angezeigt wird
  e.waitUntil(self.registration.showNotification(d.title || 'Dragons Kasse', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'apple-touch-icon.png',
    badge: 'icon-512.png',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
