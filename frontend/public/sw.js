// ShapeShift's service worker. The editor runs entirely in the browser, so
// once it has loaded it keeps working offline: pages come from the network
// when possible and the cache otherwise, and built assets (which have hashed
// names) and the hand-tracking model are kept after their first use. The API
// always goes to the network.
const CACHE = "shapeshift-v1";
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"];
const CDN = ["https://cdn.jsdelivr.net/npm/@mediapipe/", "https://storage.googleapis.com/mediapipe-models/"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return (await cache.match(request)) || (await cache.match("/")) || Response.error();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.startsWith("/api/")) return;
        if (request.mode === "navigate") return event.respondWith(networkFirst(request));
        if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(request));
        return event.respondWith(networkFirst(request));
    }
    if (CDN.some((prefix) => request.url.startsWith(prefix))) event.respondWith(cacheFirst(request));
});
