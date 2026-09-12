const CACHE = "gridiron-__VERSION__";
const FILES = __PRECACHE__;
const shell = new URL("./index.html", self.location.href).href;
const allowed = new Set(FILES.map(file => new URL(file, self.location.href).href));
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...allowed])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("gridiron-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const navigation = event.request.mode === "navigate";
  if (!navigation && !allowed.has(event.request.url)) return;
  // Network-first keeps a root upload current even when filenames stay fixed.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(navigation ? shell : event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const hit = await caches.match(navigation ? shell : event.request);
    return hit || Response.error();
  }));
});
