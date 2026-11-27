import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {talkBody,talkKey,talkKeyMatches} from '../src/talk.mjs';
import {database} from '../src/db.mjs';
import {sendTalkPush} from '../src/push.mjs';

test('chat text is trimmed, bounded and free of control characters',()=>{
  assert.equal(talkBody('  안녕하세요\r\n문의드려요  '),'안녕하세요\n문의드려요');
  for(const bad of ['','   ',undefined,42,'x'.repeat(1001),'a\u0000b'])assert.equal(talkBody(bad),null);
  assert.equal(talkBody('x'.repeat(1000)).length,1000);
});

test('consultation chat: private link, both sides, unread count, removal with the inquiry',async t=>{
  const directory=fileURLToPath(new URL(`../.sites-runtime/test-${crypto.randomUUID()}/`,import.meta.url));await mkdir(directory,{recursive:true});
  const local=await createLocalEnvironment(directory,'https://example.test');t.after(()=>local.close());
  const served=[];
  const worker=createWorker(async path=>{served.push(path);return new Response('page');});
  const call=(path,{method='GET',data,headers={},admin=false,origin='https://example.test'}={})=>{
    const h={'Origin':origin,...headers};if(data)h['Content-Type']='application/json';if(admin)h['oai-authenticated-user-id']='local-owner';
    return worker.fetch(new Request(`https://example.test${path}`,{method,headers:h,body:data?JSON.stringify(data):undefined}),local.env,{waitUntil:()=>{}});
  };
  const form={requestKey:crypto.randomUUID(),uploadToken:'c'.repeat(64),inquiryType:'home',district:'광주 북구',phone:'01000000000',desiredProduct:'실제 고객 아님',consent:true,consentVersion:'2026-10-27-v3'};
  const draft=await(await call('/api/quotes',{method:'POST',data:form})).json();
  const submitted=await(await call(`/api/quotes/${draft.id}/submit`,{method:'POST',data:{slots:[]},headers:{'X-Quote-Token':form.uploadToken}})).json();
  assert.match(submitted.talk,/^\/talk#[a-f0-9-]{36}\.[a-f0-9]{64}$/,'The customer gets a chat link once the inquiry is in');
  const key=submitted.talk.split('.')[1], mine={'X-Talk-Key':key}, path=`/api/talk/${draft.id}`;
  assert.equal(key,await talkKey(local.env,draft.id));
  assert.equal(await talkKeyMatches(local.env,draft.id,key),true);
  assert.equal(await talkKeyMatches(local.env,crypto.randomUUID(),key),false,'A key only opens its own inquiry');

  await t.test('only the holder of the link can read or write',async()=>{
    assert.equal((await call(path)).status,404);
    assert.equal((await call(path,{headers:{'X-Talk-Key':'0'.repeat(64)}})).status,404);
    assert.equal((await call(`/api/talk/${crypto.randomUUID()}`,{headers:mine})).status,404);
    const empty=await call(path,{headers:mine});assert.equal(empty.status,200);
    const body=await empty.json();assert.deepEqual(body.messages,[]);assert.equal(body.receipt,draft.receipt);
    assert.equal(JSON.stringify(body).includes(form.phone),false,'The chat never echoes the phone number');
    assert.equal((await call(path,{method:'POST',data:{body:'안녕하세요'},headers:mine,origin:'https://evil.test'})).status,403);
    assert.equal((await call(path,{method:'POST',data:{body:'x'.repeat(1001)},headers:mine})).status,400);
    assert.equal((await call(path,{method:'POST',data:{body:'설치 가능한 날짜가 궁금해요'},headers:mine})).status,201);
  });

  await t.test('the owner sees the unread message, answers, and the inquiry moves to consulting',async()=>{
    const adminPath=`/api/admin/quotes/${draft.id}/talk`;
    assert.equal((await call(adminPath)).status,401);
    assert.equal((await call(adminPath,{method:'POST',data:{body:'몰래'}})).status,401);
    let row=(await(await call('/api/admin/quotes',{admin:true})).json()).inquiries[0];assert.equal(row.unread_messages,1);
    assert.equal((await(await call(`/api/admin/quotes/${draft.id}`,{admin:true})).json()).inquiry.unread_messages,1);
    const opened=await(await call(adminPath,{admin:true})).json();
    assert.equal(opened.messages.length,1);assert.equal(opened.messages[0].from,'customer');
    assert.equal(opened.link,`https://example.test${submitted.talk}`,'The owner can always show the same link again');
    row=(await(await call('/api/admin/quotes',{admin:true})).json()).inquiries[0];assert.equal(row.unread_messages,0);
    assert.equal((await call(adminPath,{method:'POST',data:{body:'   '},admin:true})).status,400);
    assert.equal((await call(adminPath,{method:'POST',data:{body:'내일 오후에 가능합니다.'},admin:true})).status,201);
    row=(await(await call('/api/admin/quotes',{admin:true})).json()).inquiries[0];assert.equal(row.status,'consulting');
    const thread=(await(await call(path,{headers:mine})).json()).messages;
    assert.deepEqual(thread.map(message=>[message.from,message.body]),[['customer','설치 가능한 날짜가 궁금해요'],['owner','내일 오후에 가능합니다.']]);
  });

  await t.test('a customer device can ask for answer alerts; alerts carry no content and are throttled',async()=>{
    const endpoint='https://fcm.googleapis.com/fcm/send/customer-device', pushPath=path+'/push';
    assert.equal((await call(pushPath,{method:'PUT',data:{endpoint}})).status,404,'Needs the chat key');
    assert.equal((await call(pushPath,{method:'PUT',data:{endpoint:'https://evil.test/hook'},headers:mine})).status,400);
    const saved=await call(pushPath,{method:'PUT',data:{endpoint},headers:mine});assert.equal(saved.status,200);
    const deviceId=(await saved.json()).id;
    const state=(await(await call(path,{headers:mine})).json()).alerts;
    assert.deepEqual(state.devices,[deviceId]);assert.equal(state.publicKey,local.env.VAPID_PUBLIC_KEY);
    assert.equal(local.sqlite.prepare('SELECT encrypted_endpoint FROM talk_subscriptions').get().encrypted_endpoint.includes('customer-device'),false,'The address is stored encrypted');
    assert.equal((await(await call(`/api/admin/quotes/${draft.id}/talk`,{admin:true})).json()).customerAlerts,1);
    const realFetch=globalThis.fetch, sent=[];t.after(()=>{globalThis.fetch=realFetch;});
    globalThis.fetch=async(url,options)=>{sent.push({url:String(url),length:options.body.length,auth:options.headers.Authorization});return new Response(null,{status:201});};
    const db=database(local.env);
    assert.equal(await sendTalkPush(db,local.env,draft.id,1000000),1);
    assert.equal(sent.length,1);assert.equal(sent[0].url,endpoint);assert.equal(sent[0].length,0,'No message text leaves the server');assert.match(sent[0].auth,/^vapid t=/);
    assert.equal(await sendTalkPush(db,local.env,draft.id,1010000),0,'Within 30 seconds the device is not alerted again');
    assert.equal(await sendTalkPush(db,local.env,draft.id,1040000),1);
    globalThis.fetch=async()=>new Response(null,{status:410});
    assert.equal(await sendTalkPush(db,local.env,draft.id,1100000),0);
    assert.equal(local.sqlite.prepare('SELECT count(*) AS count FROM talk_subscriptions').get().count,0,'A device that is gone is forgotten');
    globalThis.fetch=realFetch;
    assert.equal((await call(pushPath,{method:'PUT',data:{endpoint},headers:mine})).status,200);
    assert.equal((await call(pushPath,{method:'DELETE',data:{endpoint},headers:mine})).status,200);
    assert.deepEqual((await(await call(path,{headers:mine})).json()).alerts.devices,[]);
    assert.equal((await call(pushPath,{method:'PUT',data:{endpoint},headers:mine})).status,200);
  });

  await t.test('the chat page is served without being indexed, and the chat is erased with the inquiry',async()=>{
    const page=await call('/talk');assert.equal(page.status,200);assert.equal(served.at(-1),'/talk.html');assert.match(page.headers.get('X-Robots-Tag'),/noindex/);
    assert.equal((await call(`/api/admin/quotes/${draft.id}`,{method:'DELETE',data:{confirm:draft.receipt},admin:true})).status,200);
    assert.equal(local.sqlite.prepare('SELECT count(*) AS count FROM talk_messages').get().count,0);
    assert.equal(local.sqlite.prepare('SELECT count(*) AS count FROM talk_subscriptions').get().count,0);
    assert.equal((await call(path,{headers:mine})).status,404);
    assert.equal((await call(path,{method:'POST',data:{body:'아직 계세요?'},headers:mine})).status,404);
  });
});

test('alerts open the chat on a customer device and the inbox on the owner device',async()=>{
  const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');
  const run=async saved=>{
    const handlers={},shown=[],opened=[];
    const self={location:{origin:'https://jeonnamlock.com'},addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting(){},
      registration:{showNotification:async(title,options)=>{shown.push({title,...options});}},
      clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>{opened.push(url);}}};
    const caches={open:async()=>({match:async()=>saved===null?undefined:new Response(saved)})};
    vm.runInNewContext(await readFile(new URL('../dist/sw.js',import.meta.url),'utf8'),{self,caches,URL,Response});
    let done;handlers.push({waitUntil:p=>{done=p;}});await done;
    handlers.notificationclick({notification:{close(){},data:shown[0].data},waitUntil:p=>{done=p;}});await done;
    return {note:shown[0],opened:opened[0]};
  };
  const chat='/talk#11111111-1111-4111-8111-111111111111.'+'a'.repeat(64);
  const customer=await run(chat);
  assert.equal(customer.note.title,'전남열쇠 상담 답변');assert.equal(customer.opened,'https://jeonnamlock.com'+chat);
  assert.equal(/\d{3}-\d{3,4}-\d{4}|JN-/.test(customer.note.body),false,'No customer details in the alert');
  for(const saved of [null,'https://evil.test/','/admin#x']){const owner=await run(saved);assert.equal(owner.note.title,'전남열쇠 견적 알림');assert.equal(owner.opened,'https://jeonnamlock.com/admin');}
});
