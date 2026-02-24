const CACHE_NAME = "manager-pwa-v1";

const ASSETS = [
  "/",
  "/manager.html",
  "/offline.html",

  // CSS
  "/manager.css",

  // JS
  "/manager.js",
  "/firebase-config.js",

  // ICONOS
  "/manzanas.png",
  "/logo_anim_transparent.gif",

  // PWA
  "/manifest.json"
];

// instalar
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// activar
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      )
    )
  );
  self.clients.claim();
});

// fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // HTML
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // archivos
  event.respondWith(
    caches.match(req).then((res) => res || fetch(req))
  );
});
