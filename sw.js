/**
 * Minimal service worker: network-first with a cached fallback for the app
 * shell, so a pinned home-screen app still opens (read-only) offline.
 * API requests are never cached.
 */
const CACHE = "mickeymiles-v3";
const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/pixel.js",
  "js/landmarks.js",
  "js/mickey.js",
  "js/scenes.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
