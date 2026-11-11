// firebase-messaging-sw.js: push notifications + offline app shell.
//
// Offline strategy (kept deliberately conservative: online behaviour must be identical to having no SW):
//  - Habitly's own files   -> NETWORK-FIRST. A new deploy is picked up on the next load; the cache is only used
//                             when the network fails (offline) or is crawling (>4s) and an exact copy exists.
//  - Versioned CDN files   -> stale-while-revalidate (Firebase SDK, Chart.js, jsPDF, fonts). Their URLs are immutable.
//  - Everything else (Firestore, Auth, Analytics, FCM APIs, non-GET) is NOT touched: it goes straight to the network.
//
// Bump CACHE_VERSION to force every client to drop its old caches.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Config inlined directly: importScripts cannot load ES modules, so firebase-config.js (an ES module) can't be used here.
const firebaseConfig = {
  apiKey:            "AIzaSyDG0cS8uxLPMNc76Rws4NMuIeQBO85p04w",
  authDomain:        "habit-tracker-demo-34c0a.firebaseapp.com",
  projectId:         "habit-tracker-demo-34c0a",
  storageBucket:     "habit-tracker-demo-34c0a.firebasestorage.app",
  messagingSenderId: "1011289539803",
  appId:             "1:1011289539803:web:a2e9fe1d07e72d6b35f8fe",
  measurementId:     "G-Y7M3MN6ZZN"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Habitly';
  self.registration.showNotification(title, {
    body: payload.notification?.body || 'You still have habits to complete today.',
    icon: '/icon-192.png',          // was '/icons/icon-192.png', which does not exist
    badge: '/icon-192.png',
    tag: 'habitly-reminder',        // one reminder at a time, not a pile
    data: { url: '/' }
  });
});

// Tapping a reminder should open (or focus) the app. There was no handler, so taps did nothing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return; }
    }
    await clients.openWindow(target);
  })());
});

// ── Offline app shell ─────────────────────────────────────
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `habitly-shell-${CACHE_VERSION}`;
const CDN_CACHE = `habitly-cdn-${CACHE_VERSION}`;
const CDN_HOSTS = ['www.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Imported by app.js at startup but not referenced from index.html, so list them for first-offline readiness
const EXTRA_PRECACHE = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  const cdn = await caches.open(CDN_CACHE);
  const res = await fetch('/index.html', { cache: 'reload' });
  const html = await res.clone().text();
  await shell.put('/index.html', res);

  // Cache exactly the files this index.html asks for (with their ?v= versions), plus a few fixed extras
  const local = new Set(['/', '/manifest.json', '/favicon.png', '/icon-192.png', '/icon-512.png']);
  const remote = new Set(EXTRA_PRECACHE);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    let u;
    try { u = new URL(m[1], self.location.origin); } catch (_) { continue; }
    if (u.origin === self.location.origin) local.add(u.pathname + u.search);
    else if (CDN_HOSTS.includes(u.hostname)) remote.add(u.href);
  }
  // Best effort: a single 404 or blocked CDN must never fail the whole install
  await Promise.all([
    ...[...local].map(u => shell.add(u).catch(() => {})),
    ...[...remote].map(u => cdn.add(u).catch(() => {})),
  ]);
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CDN_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('habitly-') && !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;    // Firestore / Auth / FCM / Analytics: untouched
  if (sameOrigin && url.pathname === '/firebase-messaging-sw.js') return;
  if (sameOrigin && url.pathname.startsWith('/__/')) return;      // Firebase Hosting helpers (auth redirect handler, init.json)
  event.respondWith(sameOrigin ? networkFirst(req) : staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {});                                              // a late failure after we returned the cache is fine
  try {
    return await Promise.race([net, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))]);
  } catch (err) {
    // Exact copy only on a slow network (avoids mixing a new index.html with an old app.js).
    const exact = await cache.match(req);
    if (exact) return exact;
    if (err.message === 'timeout') return net;                      // nothing cached: keep waiting for the network
    // Fully offline: any copy of the same file, or the app shell for page navigations
    return (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? (await cache.match('/index.html')) || (await cache.match('/')) : undefined)
      || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });   // fonts CSS varies by User-Agent, gstatic by encoding
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}
