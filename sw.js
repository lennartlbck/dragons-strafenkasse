// Service Worker der Dragons Kasse: App-Dateien auf dem Handy speichern, Push-Benachrichtigungen, Zahl am App-Icon.
// Startseite: zuerst aus dem Netz (höchstens 1,5 s warten), sonst die gespeicherte – so kommen Updates beim nächsten Öffnen an.
// app.js?v=…, Bibliothek, Schriften: aus dem Speicher (jede neue app.js hat eine neue Versionsnummer, alte werden gelöscht).
// Bilder und Icons: sofort aus dem Speicher, im Hintergrund aktualisiert.
// Daten von Supabase laufen nie über diesen Speicher.
const SHELL = 'shell-v1';
const IMMUTABLE = /\/(app\.js\?v=|vendor\/|fonts\/)/;
const REFRESH = /\/(img\/|icon|apple-touch-icon)/; // sofort aus dem Speicher, im Hintergrund aktualisieren (Fotos können sich ändern)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL && k !== 'badge') await caches.delete(k);
  await self.clients.claim();
})()));

async function fromNetwork(req, cache) {
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    // von app.js nur die aktuelle Version behalten
    if (/\/app\.js\?v=/.test(req.url)) for (const k of await cache.keys()) if (/\/app\.js\?v=/.test(k.url) && k.url !== req.url) await cache.delete(k);
    await cache.put(req, res.clone());
  }
  return res;
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/sw.js')) return;
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    if (IMMUTABLE.test(url.pathname + url.search)) return (await cache.match(req)) || fromNetwork(req, cache);
    if (REFRESH.test(url.pathname)) { const saved = await cache.match(req), net = fromNetwork(req, cache); if (saved) { e.waitUntil(net.catch(() => {})); return saved; } return net; }
    // Startseite und config.js: Netz zuerst, bei Funkloch oder langsamer Leitung die gespeicherte Fassung
    const key = req.mode === 'navigate' ? new Request(new URL('./', self.registration.scope)) : req;
    const net = fetch(req).then(async res => { if (res.ok && res.type === 'basic') await cache.put(key, res.clone()); return res; });
    const saved = await cache.match(key);
    if (!saved) return net;
    return Promise.race([net.catch(() => saved), new Promise(r => setTimeout(() => r(saved), 1500))]);
  })());
});

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
