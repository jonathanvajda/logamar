/* Cache contents and version are generated from the actual shipped files. */
importScripts("./precache-manifest.js");
const PREFIX = `logamar-${self.registration.scope}-`;
const CACHE = PREFIX + self.LOGAMAR_PRECACHE.version;
const assets = new Set(self.LOGAMAR_PRECACHE.assets.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener("install", (event) => {
  // Installation succeeds only when the complete shell and all three vocabularies exist.
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    try {
      await cache.addAll([...assets].map((url) => new Request(url, { cache: "reload" })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  }));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  url.search = "";
  if (!assets.has(url.href) && request.mode !== "navigate") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === "navigate") return await cache.match(new URL("./index.html", self.registration.scope).href) || Response.error();
      throw error;
    }
  })());
});
