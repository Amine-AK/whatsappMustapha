// Service worker: makes the app installable and lets it open without internet.
// It keeps the app itself (page, scripts, styles, fonts, icons) on the device.
// Customer data is not handled here: the page keeps it in IndexedDB and syncs
// it through /api, which is never cached.
const VERSION = "v2";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGES_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
}

async function put(cacheName, request, response) {
  // Never keep a redirect (e.g. to /login when the session expired) as the page.
  if (!response || !response.ok || response.redirected || response.type === "opaqueredirect") return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

// The page sends the files it loaded, so the app opens offline after the first visit.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "warm-cache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.map(async (href) => {
        try {
          const url = new URL(href, self.location.origin);
          if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
          const cacheName = isStatic(url) ? STATIC_CACHE : PAGES_CACHE;
          if (isStatic(url) && (await caches.match(url.href))) return;
          const key = isStatic(url) ? url.href : url.origin + url.pathname;
          await put(cacheName, key, await fetch(url.href, { credentials: "same-origin" }));
        } catch {}
      }),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // App files have a hash in their name: from the device first.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            event.waitUntil(put(STATIC_CACHE, request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: the network if it answers within 4 s, otherwise the copy on the device.
  if (request.mode === "navigate") {
    const key = url.origin + url.pathname;
    event.respondWith(
      (async () => {
        const network = fetch(request).then((res) => {
          event.waitUntil(put(PAGES_CACHE, key, res.clone()));
          return res;
        });
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
        try {
          const first = await Promise.race([network, timeout]);
          if (first) return first;
        } catch {}
        const cached = await caches.match(key);
        if (cached) return cached;
        try {
          return await network;
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
  }
});
