// Own scope (this folder), so it never touches the main briefing's service worker.
// The cache name is per folder (preview-widget, preview-edit…) because caches are shared across the whole origin.
const F=(self.registration.scope.split('/').filter(Boolean).pop()||'app'),C="briefing-"+F+"-ce1";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&(k.startsWith("briefing-"+F+"-")||(F==="preview-widget"&&k.startsWith("briefing-widget-")))).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
 e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)));});
