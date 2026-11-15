/*
 * ProseCraft offline shell.
 *
 * The app is a static SPA. This worker keeps the shell and hashed build
 * assets available offline, while leaving the IndexedDB vault untouched.
 * It deliberately ignores cross-origin requests (for example Google Drive).
 */
const CACHE_NAME = "prosecraft-shell-v2";
const scopeUrl = new URL(self.registration.scope);
const shellUrls = [
  new URL("./", scopeUrl).href,
  new URL("./index.html", scopeUrl).href
];

self.addEventListener("install", (event) => {
  // Wait for the page to ask before activating so an open editor is never
  // reloaded mid-keystroke. The app shows an "update ready" prompt instead.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          shellUrls.map((url) => cache.add(url).catch(() => undefined))
        )
      )
      .catch(() => undefined)
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations go to the network first so a fresh deploy wins, with the
  // cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match(shellUrls[1])) ||
            (await cache.match(shellUrls[0])) ||
            Response.error()
          );
        })
    );
    return;
  }

  // Hashed JS, CSS, fonts and icons are cache-first and refreshed in the
  // background so the app opens instantly on the next visit.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
