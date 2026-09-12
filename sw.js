const CACHE='gridiron-1.0.0';
const PRECACHE=['/','/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy));return r;}).catch(()=>caches.match('/index.html')));return;}
 if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/icon-')||url.pathname==='/__/firebase/init.json')event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return r;})));
});
