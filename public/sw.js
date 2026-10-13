/* The First service worker (BLUEPRINT 6.2, ADR 0006), hand-written as in OSCURA.
 * - Hashed assets and fonts: cache-first.
 * - Menu photos (Convex storage): stale-while-revalidate, capped at 50 MB, so the menu works on the floor offline.
 * - Navigations: network-first with the last good copy offline.
 * - Push: shows the notification and routes the click. Never caches API or Convex traffic.
 */
const VERSION = "tf-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PHOTOS = `${VERSION}-photos`;
const PHOTO_CAP_BYTES = 50 * 1024 * 1024;
const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/today", "/schedule", "/menu"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || /\.(?:woff2|svg|png|ico)$/.test(url.pathname);
const isPhoto = (url) => /\.convex\.cloud$/.test(url.hostname) && url.pathname.startsWith("/api/storage/");

async function trim(cacheName, cap) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  let total = 0;
  const sizes = [];
  for (const k of keys) {
    const r = await cache.match(k);
    const n = r ? (await r.clone().blob()).size : 0;
    sizes.push([k, n]);
    total += n;
  }
  for (const [k, n] of sizes) {
    if (total <= cap) break;
    await cache.delete(k);
    total -= n;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isPhoto(url)) {
    event.respondWith(
      caches.open(PHOTOS).then(async (cache) => {
        const hit = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).then(() => trim(PHOTOS, PHOTO_CAP_BYTES));
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/monitoring")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req)) || (await cache.match("/today")) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
  }
});

// Web Push (ADR 0006). The payload carries a generic line; warning content never travels in a notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "The First";
  const urgent = data.topic === "help" || data.urgent;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.topic || "tf",
      renotify: !!urgent,
      requireInteraction: !!urgent,
      vibrate: urgent ? [300, 120, 300, 120, 300] : [120],
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
