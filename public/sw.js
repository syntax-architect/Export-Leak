/* ExportLeak Service Worker — Offline Shell & Asset Cache */
const CACHE_NAME = "exportleak-shell-v1";
const OFFLINE_URL = "/offline";

// Assets to pre-cache on install
const PRECACHE_ASSETS = [OFFLINE_URL, "/favicon.ico", "/icons/icon-192.png", "/icons/icon-512.png"];

// Sensitive or dynamic paths that MUST NEVER be cached
function isUncacheable(url) {
  const path = url.pathname;
  return (
    path.startsWith("/api/") ||
    path.startsWith("/app/") ||
    path.startsWith("/auth/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/onboarding") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("razorpay")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Bypass service worker entirely for local development to avoid HMR / chunk conflicts
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 1. Strict security boundary: never cache private/authenticated API or data endpoints
  if (isUncacheable(url)) {
    // If navigation request to an uncacheable page fails while offline, serve offline shell
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    }
    return;
  }

  // 2. Navigation requests: Network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return (await caches.match(OFFLINE_URL)) || Response.error();
        })
    );
    return;
  }

  // 3. Static assets (_next/static, icons, fonts): Stale-while-revalidate
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }
});
