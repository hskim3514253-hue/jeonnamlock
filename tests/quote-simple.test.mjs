import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';

const png = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
const valid = () => ({requestKey:crypto.randomUUID(),uploadToken:'c'.repeat(64),district:'광주 북구 용봉동',phone:'010-0000-0000',consent:true,consentVersion:'2026-10-20-v2'});
async function fixture(t) {
  const directory=fileURLToPath(new URL(`../.sites-runtime/simple-${crypto.randomUUID()}/`,import.meta.url));
  await mkdir(directory,{recursive:true});
  const local=await createLocalEnvironment(directory,'https://example.test');
  const worker=createWorker(async()=>new Response('site')), pending=[];
  const call=async(path,{method='GET',data,body,headers={},admin=false}={})=>worker.fetch(new Request(`https://example.test${path}`,{method,headers:{Origin:'https://example.test',...(data?{'Content-Type':'application/json'}:{}),...(admin?{'oai-authenticated-user-id':'local-owner'}:{}),...headers},body:data?JSON.stringify(data):body}),local.env,{waitUntil:p=>pending.push(p)});
  t.after(async()=>{await Promise.all(pending);local.close();});
  return {call,local};
}

test('simple quote accepts neighborhood and phone without collecting a name or full address',async t=>{
  const {call}=await fixture(t), data=valid();
  const response=await call('/api/quotes',{method:'POST',data});
  assert.equal(response.status,201);const quote=await response.json();const headers={'X-Quote-Token':data.uploadToken};
  assert.equal((await call(`/api/quotes/${quote.id}/photos/door-0`,{method:'PUT',body:png,headers:{...headers,'Content-Type':'image/png'}})).status,201);
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',data:{slots:['door-0']},headers})).status,201);
  const record=(await(await call(`/api/admin/quotes/${quote.id}`,{admin:true})).json()).inquiry;
  assert.equal(record.district,'광주 북구 용봉동');assert.equal(record.phone,'01000000000');
  assert.equal(record.customer_name,'');assert.equal(record.address,'');assert.equal(record.address_detail,'');
  assert.equal(record.service,'도어락 견적 문의');assert.equal(record.space,'');assert.equal(record.details,'');
  assert.equal(record.consent_version,'2026-10-20-v2');
});

test('simple quote rejects invalid neighborhood, phone, consent, and product fields',async t=>{
  const {call}=await fixture(t);
  for(const change of [{district:''},{district:' '.repeat(5)},{district:'가'.repeat(81)},{phone:'123'},{consent:false},{consentVersion:'unknown'},{desiredProduct:'x'.repeat(1001)},{desiredProduct:7},{website:'bot'}]) {
    const response=await call('/api/quotes',{method:'POST',data:{...valid(),...change}});
    assert.equal(response.status,400,JSON.stringify(change));
  }
});

test('new form cannot finish without a verified door photo, even with a product photo',async t=>{
  const {call}=await fixture(t),data={...valid(),desiredProduct:'푸시풀 지문형'},headers={'X-Quote-Token':data.uploadToken};
  const response=await call('/api/quotes',{method:'POST',data});assert.equal(response.status,201);const quote=await response.json();
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',data:{slots:[]},headers})).status,400);
  assert.equal((await call(`/api/quotes/${quote.id}/photos/product-0`,{method:'PUT',body:png,headers:{...headers,'Content-Type':'image/png'}})).status,201);
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',data:{slots:['product-0']},headers})).status,400);
  assert.equal((await(await call('/api/admin/quotes',{admin:true})).json()).inquiries.length,0);
  assert.equal((await call(`/api/quotes/${quote.id}/photos/door-0`,{method:'PUT',body:png,headers:{...headers,'Content-Type':'image/png'}})).status,201);
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',data:{slots:['door-0','product-0']},headers})).status,201);
  const record=(await(await call(`/api/admin/quotes/${quote.id}`,{admin:true})).json()).inquiry;assert.equal(record.details,'푸시풀 지문형');
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,{method:'POST',data:{slots:['door-0','product-0']},headers})).status,200);
});

test('legacy submissions retain their service and space validation',async t=>{
  const {call}=await fixture(t);
  const response=await call('/api/quotes',{method:'POST',data:{...valid(),consentVersion:'2026-09-28-v1'}});
  assert.equal(response.status,400);
});
