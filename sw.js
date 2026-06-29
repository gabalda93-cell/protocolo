/* The Hollywood Protocol — service worker
   Strategy: network-first for navigations (so an online open always gets the
   latest index.html), cache fallback when offline. Cache-first for other
   same-origin GETs. Self-updates promptly via skipWaiting + clients.claim. */
const CACHE = "hp-cache-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;

  // Navigations / documents: network-first, cache fallback (offline).
  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
        return net;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Other same-origin GETs: cache-first, fill cache on miss.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      if (net && net.ok) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
      }
      return net;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
