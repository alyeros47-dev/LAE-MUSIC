'use strict';
function localUrl(value){try{const u=new URL(typeof value==='string'?value:'/',self.location.origin);return u.origin===self.location.origin?u.pathname+u.search+u.hash:'/';}catch{return '/';}}
self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{};}catch{}event.waitUntil(self.registration.showNotification(String(data.title||'LAE-MUSIC new release'),{body:String(data.body||'A new song is available'),icon:'/web/mark.svg',badge:'/web/mark.svg',tag:'lae-new-release',data:{url:localUrl(data.url)}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=localUrl(event.notification.data?.url);event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{for(const w of windows){if(new URL(w.url).origin===self.location.origin&&'focus'in w){if(new URL(w.url).searchParams.get('legacy')==='1')await w.navigate(url);else w.postMessage({type:'LAE_NAVIGATE',url});return w.focus();}}return clients.openWindow(new URL(url,self.location.origin).href);}));});

// Public app resources only. APIs, audio, recovery/admin pages and signed URLs are never cached.
const OFFLINE_CACHE='lae-offline-shell-v15';
const OFFLINE_ASSETS=['/offline','/web/offline-app.js','/web/offline.js','/web/offline-protocol.js','/web/player.js','/web/ui.css','/web/mark.svg','/web/artwork.svg','/web/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.addAll(OFFLINE_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lae-offline-shell-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'&&['/','/discover','/artists','/library','/premium','/offline'].includes(url.pathname)){event.respondWith(fetch(event.request).catch(()=>caches.open(OFFLINE_CACHE).then(c=>c.match('/offline'))));return;}
 if(OFFLINE_ASSETS.includes(url.pathname)&&url.pathname!=='/offline')event.respondWith(fetch(event.request).catch(()=>caches.open(OFFLINE_CACHE).then(c=>c.match(url.pathname))));
});
