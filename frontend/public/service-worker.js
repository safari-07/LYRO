/* LYRO minimal service worker — enables PWA install prompts.
 * We deliberately keep runtime caching light so app updates propagate instantly.
 */
const CACHE_NAME = "lyro-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/logo192.png", "/logo512.png"];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL).catch(() => {}))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    // Never cache API calls or QR PNGs — always fresh
    if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
        return;
    }
    // Network-first for navigations so users get the newest UI
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() => caches.match("/index.html"))
        );
        return;
    }
    // Cache-first for same-origin static assets
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
    }
});
