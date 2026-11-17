import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {database} from '../src/db.mjs';
import {savePushSubscription,pushStatus,sendInquiryPush,vapidAuthorization,validPushEndpoint,testPush,removePushSubscription} from '../src/push.mjs';
import {pushEnvironment} from '../dist/push-environment.js';

test('iPhone setup requires Home Screen and permission; desktop and Android keep working',()=>{
  const base={secure:true,hasServiceWorker:true,hasPushManager:true,hasNotification:true,permission:'default'};
  const iphone={...base,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)'};
  const safariTab=pushEnvironment({...iphone,hasPushManager:false,hasNotification:false});assert.equal(safariTab.needsHomeScreen,true);assert.equal(safariTab.canEnable,false);
  assert.equal(pushEnvironment({...iphone,standalone:true}).canEnable,true);
  assert.equal(pushEnvironment({...iphone,displayStandalone:true}).canEnable,true);
  assert.equal(pushEnvironment({...iphone,standalone:true,permission:'denied'}).canEnable,false);
  assert.equal(pushEnvironment({...iphone,standalone:true,hasPushManager:false}).canEnable,false);
  assert.equal(pushEnvironment({...base,platform:'MacIntel',maxTouchPoints:5}).needsHomeScreen,true);
  assert.equal(pushEnvironment({...base,userAgent:'Mozilla/5.0 (Linux; Android 16)'}).canEnable,true);
  assert.equal(pushEnvironment({...base,platform:'MacIntel',maxTouchPoints:0}).needsHomeScreen,false);
  assert.equal(pushEnvironment({...base,secure:false}).canEnable,false);
});

test('durable quote, private photos, validation, idempotency, cleanup and free push isolation', async t=>{
  const directory=fileURLToPath(new URL(`../.sites-runtime/test-${crypto.randomUUID()}/`,import.meta.url));await mkdir(directory,{recursive:true});
  let local=await createLocalEnvironment(directory,'https://example.test');
  const worker=createWorker(async()=>new Response('site'));
  const pending=[];
  const call=async(path,{method='GET',data,body,headers={},admin=false,origin='https://example.test'}={})=>{
    const h={'Origin':origin,...headers};if(data)h['Content-Type']='application/json';if(admin)h['oai-authenticated-user-id']='local-owner';
    return worker.fetch(new Request(`https://example.test${path}`,{method,headers:h,body:data?JSON.stringify(data):body}),local.env,{waitUntil:p=>pending.push(p)});
  };
  const details=()=>({requestKey:crypto.randomUUID(),uploadToken:'a'.repeat(64),service:'도어락 교체',space:'아파트 / 오피스텔',district:'광주 북구',customerName:'통합 테스트',phone:'01000000000',address:'광주 테스트로 1',addressDetail:'테스트동',details:'실제 고객 아님',consent:true,consentVersion:'2026-09-28-v1'});
  let info,record,token,photoPath;
  await t.test('server rejects missing consent, neighborhood, phone and cross-origin writes',async()=>{
    for(const change of [{consent:false},{district:''},{phone:'123'},{website:'bot'}])assert.equal((await call('/api/quotes',{method:'POST',data:{...details(),...change}})).status,400);
    assert.equal((await call('/api/quotes',{method:'POST',data:details(),origin:'https://evil.test'})).status,403);
  });
  await t.test('same idempotency key creates one draft, invisible to the inbox',async()=>{
    info=details();token={'X-Quote-Token':info.uploadToken};const first=await call('/api/quotes',{method:'POST',data:info});assert.equal(first.status,201);record=await first.json();
    const duplicate=await(await call('/api/quotes',{method:'POST',data:info})).json();assert.equal(duplicate.id,record.id);
    assert.equal((await(await call('/api/admin/quotes',{admin:true})).json()).inquiries.length,0);
    assert.equal((await call('/api/quotes',{method:'POST',data:{...info,uploadToken:'b'.repeat(64)}})).status,409);
  });
  await t.test('private uploads verify tokens, content bytes, count and completion',async()=>{
    const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
    photoPath=`/api/quotes/${record.id}/photos/door-0`;
    assert.equal((await call(photoPath,{method:'PUT',headers:{'Content-Type':'image/png'},body:png})).status,404);
    assert.equal((await call(photoPath,{method:'PUT',headers:{...token,'Content-Type':'image/png'},body:'<script>x</script>'})).status,415);
    assert.equal((await call(photoPath.replace('door-0','door-5'),{method:'PUT',headers:token,body:png})).status,400);
    assert.equal((await call(photoPath,{method:'PUT',headers:{...token,'Content-Type':'image/png'},body:png})).status,201);
    assert.equal((await call(`/api/quotes/${record.id}/submit`,{method:'POST',data:{slots:[]},headers:token})).status,409);
    const result=await call(`/api/quotes/${record.id}/submit`,{method:'POST',data:{slots:['door-0']},headers:token});assert.equal(result.status,201);assert.equal((await result.json()).submitted,true);
    assert.equal((await call(photoPath,{method:'PUT',headers:{...token,'Content-Type':'image/png'},body:png})).status,409);
    assert.equal((await call(`/api/quotes/${record.id}/submit`,{method:'POST',data:{slots:['door-0']},headers:token})).status,200);
    await Promise.all(pending.splice(0));
  });
  await t.test('customer details and photos survive reopen and require owner authorization',async()=>{
    local.close();local=await createLocalEnvironment(directory,'https://example.test');
    assert.equal((await call('/api/admin/quotes')).status,401);
    assert.equal((await call('/api/admin/quotes',{headers:{'oai-authenticated-user-id':'another-user'}})).status,403);
    const list=await(await call('/api/admin/quotes',{admin:true})).json();assert.equal(list.inquiries.length,1);assert.equal(list.inquiries[0].address,info.address);
    const detail=await(await call(`/api/admin/quotes/${record.id}`,{admin:true})).json();assert.equal(detail.inquiry.customer_name,info.customerName);assert.equal('token_hash' in detail.inquiry,false);photoPath=detail.photos[0].url;
    assert.equal((await call(photoPath)).status,401);const image=await call(photoPath,{admin:true});assert.equal(image.status,200);assert.equal(image.headers.get('Cache-Control'),'private, no-store');assert.equal((await image.arrayBuffer()).byteLength,11);
  });
  await t.test('push subscription secrets, endpoint allowlist, signed VAPID and delivery isolation',async()=>{
    const db=database(local.env), endpoint='https://web.push.apple.com/test-device';
    for(const valid of ['https://web.push.apple.com/test','https://region.push.apple.com/test','https://fcm.googleapis.com/fcm/send/test'])assert.equal(validPushEndpoint(valid),true);
    for(const invalid of ['https://127.0.0.1/private','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:8443/x','http://fcm.googleapis.com/x','https://push.apple.com.evil.test/x','https://evilpush.apple.com/x','https://web.push.apple.com@evil.test/x','https://web.push.apple.com:8443/x'])assert.equal(validPushEndpoint(invalid),false);
    assert.equal((await call('/api/admin/push',{method:'PUT',data:{endpoint}})).status,401);
    const saved=await savePushSubscription(db,local.env,'local-owner',endpoint);
    const encrypted=await db.one('SELECT encrypted_endpoint FROM push_subscriptions WHERE id=?',saved.id);assert.equal(encrypted.encrypted_endpoint.includes('test-device'),false);
    const status=await pushStatus(db,local.env,'local-owner');assert.equal(status.configured,true);assert.equal('encrypted_endpoint' in status.devices[0],false);assert.equal((await pushStatus(db,local.env,'another')).devices.length,0);
    const authorization=await vapidAuthorization(endpoint,local.env),jwt=authorization.split('t=')[1].split(',')[0],parts=jwt.split('.');
    const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.sub,'https://example.test');assert.ok(claims.exp>Date.now()/1000&&claims.exp<Date.now()/1000+86400);
    const key=await crypto.subtle.importKey('raw',Buffer.from(local.env.VAPID_PUBLIC_KEY,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(parts[2],'base64url'),Buffer.from(`${parts[0]}.${parts[1]}`)),true);
    await db.run('INSERT INTO push_outbox (id,inquiry_id,subscription_id,status,attempts,updated_at) VALUES (?,?,?,\'pending\',0,?)','delivery-test',record.id,saved.id,Date.now());
    const realFetch=globalThis.fetch;let requests=0;
    try{
      globalThis.fetch=async()=>{requests++;throw new Error('timeout');};await sendInquiryPush(db,local.env,record.id);assert.equal((await db.one('SELECT status FROM push_outbox WHERE id=\'delivery-test\'')).status,'failed');assert.equal((await db.one('SELECT status FROM inquiries WHERE id=?',record.id)).status,'new');
      globalThis.fetch=async(url,options)=>{requests++;assert.equal(url,endpoint);assert.equal(options.body.byteLength,0);assert.equal(options.headers.Urgency,'high');assert.equal(options.redirect,'manual');return new Response(null,{status:201});};await sendInquiryPush(db,local.env,null,'local-owner');assert.equal((await db.one('SELECT status FROM push_outbox WHERE id=\'delivery-test\'')).status,'accepted');
      await sendInquiryPush(db,local.env,null,'local-owner');assert.equal(requests,2);
      await assert.rejects(()=>testPush(db,local.env,'local-owner',saved.id),/PUSH_TEST_RATE_LIMIT/);
      await assert.rejects(()=>testPush(db,local.env,'another',saved.id),/PUSH_DEVICE_MISSING/);
      for(const [httpStatus,body,expected] of [[302,null,'HTTP_302'],[403,{reason:'BadJwtToken'},'BadJwtToken'],[400,{reason:'https://private.example/secret'},'HTTP_400'],[201,null,null]]){
        await db.run('UPDATE push_subscriptions SET last_at=NULL WHERE id=?',saved.id);
        let attempts=0;
        globalThis.fetch=async(url,options)=>{attempts++;if(options.redirect==='error')throw new TypeError('Invalid redirect value');assert.equal(options.redirect,'manual');assert.equal(options.headers.Topic,undefined);return new Response(body?JSON.stringify(body):null,{status:httpStatus,headers:{Location:'https://untrusted.example'}});};
        const result=await testPush(db,local.env,'local-owner',saved.id);assert.equal(attempts,1);assert.equal(result.httpStatus,httpStatus);assert.equal(result.errorCode,expected);assert.equal(result.status,httpStatus===201?'accepted':'failed');
        const visible=(await pushStatus(db,local.env,'local-owner')).devices[0];assert.equal(visible.last_error,expected);assert.equal(visible.last_http_status,httpStatus);assert.equal(visible.enabled,1);
      }
      await db.run('UPDATE push_outbox SET status=\'failed\' WHERE id=\'delivery-test\'');globalThis.fetch=async()=>new Response(null,{status:410});await sendInquiryPush(db,local.env,null,'local-owner');assert.equal((await db.one('SELECT enabled FROM push_subscriptions WHERE id=?',saved.id)).enabled,0);
      await removePushSubscription(db,'another',endpoint);assert.ok(await db.one('SELECT id FROM push_subscriptions WHERE id=?',saved.id));
      await removePushSubscription(db,'local-owner',endpoint);assert.equal(await db.one('SELECT id FROM push_subscriptions WHERE id=?',saved.id),null);
    }finally{globalThis.fetch=realFetch;}
  });
  await t.test('final submission automatically dispatches one visible notification and duplicates do not resend',async()=>{
    const db=database(local.env),endpoint='https://fcm.googleapis.com/fcm/send/automatic-test';await savePushSubscription(db,local.env,'local-owner',endpoint);
    const data=details(), quote=await(await call('/api/quotes',{method:'POST',data})).json(),headers={'X-Quote-Token':data.uploadToken};let sent=0;const realFetch=globalThis.fetch;
    try{globalThis.fetch=async()=>{sent++;return new Response(null,{status:201});};assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',headers,data:{slots:[]}})).status,201);await Promise.all(pending.splice(0));assert.equal(sent,1);assert.equal((await db.one('SELECT status FROM push_outbox WHERE inquiry_id=?',quote.id)).status,'accepted');await call(`/api/quotes/${quote.id}/submit`,{method:'POST',headers,data:{slots:[]}});await Promise.all(pending.splice(0));assert.equal(sent,1);}finally{globalThis.fetch=realFetch;}
    await call(`/api/admin/quotes/${quote.id}`,{method:'DELETE',data:{confirm:quote.receipt},admin:true});await removePushSubscription(db,'local-owner',endpoint);
  });
  await t.test('owner can change status and explicitly erase personal data and blobs',async()=>{
    assert.equal((await call(`/api/admin/quotes/${record.id}`,{method:'PATCH',data:{status:'consulting'},admin:true})).status,200);
    assert.equal((await call(`/api/admin/quotes/${record.id}`,{method:'DELETE',data:{confirm:'wrong'},admin:true})).status,400);
    assert.equal((await call(`/api/admin/quotes/${record.id}`,{method:'DELETE',data:{confirm:record.receipt},admin:true})).status,200);
    assert.equal((await call(photoPath,{admin:true})).status,404);assert.equal((await(await call('/api/admin/quotes',{admin:true})).json()).inquiries.length,0);
  });
  await t.test('storage errors do not produce a receipt and oversized streams are refused',async()=>{
    const data=details();const created=await(await call('/api/quotes',{method:'POST',data})).json();
    const route=`/api/quotes/${created.id}/photos/door-0`;const headers={'X-Quote-Token':data.uploadToken,'Content-Type':'image/png'};
    assert.equal((await call(route,{method:'PUT',headers:{...headers,'Content-Length':String(11*1024*1024)},body:'tiny'})).status,413);
    const put=local.env.BUCKET.put;local.env.BUCKET.put=async()=>{throw new Error('SIMULATED_STORAGE_OUTAGE');};
    try{assert.equal((await call(route,{method:'PUT',headers,body:new Uint8Array([137,80,78,71,13,10,26,10,1])})).status,503);}finally{local.env.BUCKET.put=put;}
    assert.equal((await call(`/api/quotes/${created.id}/submit`,{method:'POST',headers,data:{slots:['door-0']}})).status,409);
    assert.equal((await(await call('/api/admin/quotes',{admin:true})).json()).inquiries.length,0);
    await Promise.all(pending.splice(0));
  });
  await Promise.all(pending.splice(0));local.close();
});
