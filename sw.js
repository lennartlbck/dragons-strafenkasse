// Service Worker der Dragons Kasse – nur für Push-Benachrichtigungen und die Zahl am App-Icon.
// Absichtlich KEIN Zwischenspeicher für Seiten (kein fetch-Handler): Updates der App kommen wie bisher sofort an.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Zahl am App-Icon: jede Push-Nachricht zählt eins hoch; die App setzt sie beim Öffnen zurück (Cache „badge“, Eintrag „n“).
const BADGE = ['badge', 'n'];
async function bumpBadge() {
  try {
    const c = await caches.open(BADGE[0]), r = await c.match(BADGE[1]);
    const n = (r ? parseInt(await r.text(), 10) || 0 : 0) + 1;
    await c.put(BADGE[1], new Response(String(n)));
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
  } catch (_) {} // ohne Zahl ist die Nachricht trotzdem da
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  // iOS verlangt, dass jede Push-Nachricht auch angezeigt wird
  e.waitUntil(Promise.all([self.registration.showNotification(d.title || 'Dragons Kasse', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'apple-touch-icon.png',
    badge: 'icon-512.png',
    data: { url: d.url || './' },
  }), bumpBadge()]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
