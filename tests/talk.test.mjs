import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {talkBody,talkKey,talkKeyMatches} from '../src/talk.mjs';

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

  await t.test('the chat page is served without being indexed, and the chat is erased with the inquiry',async()=>{
    const page=await call('/talk');assert.equal(page.status,200);assert.equal(served.at(-1),'/talk.html');assert.match(page.headers.get('X-Robots-Tag'),/noindex/);
    assert.equal((await call(`/api/admin/quotes/${draft.id}`,{method:'DELETE',data:{confirm:draft.receipt},admin:true})).status,200);
    assert.equal(local.sqlite.prepare('SELECT count(*) AS count FROM talk_messages').get().count,0);
    assert.equal((await call(path,{headers:mine})).status,404);
    assert.equal((await call(path,{method:'POST',data:{body:'아직 계세요?'},headers:mine})).status,404);
  });
});
