// Bump this version on each deploy to force cache invalidation
const CACHE_VERSION = "2026-08-20-02";
const CACHE_NAME = `gachard-${CACHE_VERSION}`;

// Only cache static assets, NOT HTML pages (let Next.js handle those)
const URLS_TO_CACHE = [
  "/icons/gachard-logo.png",
  "/icons/gachard-logo-full.png",
  "/manifest.json",
];

// INSTALL: cache static assets and skip waiting immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
  // Activate new SW immediately without waiting for old one to terminate
  self.skipWaiting();
});

// ACTIVATE: delete all old caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// FETCH: network-first for HTML, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API routes
  if (url.pathname.startsWith("/api/")) return;

  // For HTML pages: network-first (always fetch fresh, fallback to cache)
  if (
    event.request.headers.get("accept")?.includes("text/html") ||
    url.pathname === "/" ||
    !url.pathname.includes(".")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh response for offline fallback
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Only serve cache as fallback when offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // For static assets (JS, CSS, images): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
