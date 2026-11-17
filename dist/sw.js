'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Do not cache customer pages or intercept fetches. A push always displays a visible notification.
self.addEventListener('push',event=>event.waitUntil(self.registration.showNotification('전남열쇠 견적 알림',{
  body:'새 알림이 도착했습니다. 눌러서 견적 접수함을 확인하세요.',
  icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag:'jeonnam-new-quote',renotify:true,
  data:{url:'/admin'},vibrate:[200,100,200]
})));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{const url=new URL('/admin',self.location.origin).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url===url){await client.focus();return;}}await self.clients.openWindow(url);})());
});
