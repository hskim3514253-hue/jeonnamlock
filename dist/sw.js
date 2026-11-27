'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Do not cache customer pages or intercept fetches. A push always displays a visible notification.
// Pushes carry no data. A customer's browser remembers its own chat address (written by the chat page
// when alerts are switched on); if it is there, this device belongs to a customer.
const TALK=/^\/talk#[a-f0-9-]{36}\.[a-f0-9]{64}$/;
async function customerChat(){try{const saved=await (await caches.open('jn-talk-v1')).match('/__talk-target');const value=saved?await saved.text():'';return TALK.test(value)?value:'';}catch{return '';}}
self.addEventListener('push',event=>event.waitUntil((async()=>{
  const chat=await customerChat();
  if(chat)return self.registration.showNotification('전남열쇠 상담 답변',{body:'전남열쇠에서 답변이 도착했습니다. 눌러서 확인하세요.',icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag:'jeonnam-talk',renotify:true,data:{url:chat},vibrate:[200,100,200]});
  return self.registration.showNotification('전남열쇠 견적 알림',{
    body:'새 견적이나 손님 메시지가 도착했습니다. 눌러서 견적 접수함을 확인하세요.',
    icon:'/app-icon-192.png',badge:'/app-icon-192.png',tag:'jeonnam-new-quote',renotify:true,
    data:{url:'/admin'},vibrate:[200,100,200]
  });
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const wanted=event.notification.data&&event.notification.data.url;
  const path=TALK.test(wanted||'')?wanted:'/admin';
  event.waitUntil((async()=>{const url=new URL(path,self.location.origin).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url===url){await client.focus();return;}}await self.clients.openWindow(url);})());
});
