import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
const valid=()=>({requestKey:crypto.randomUUID(),uploadToken:'d'.repeat(64),district:'광주 북구',phone:'010-0000-0000',consent:true,consentVersion:'2026-10-27-v3',inquiryType:'home'});
async function fixture(t){
 const directory=fileURLToPath(new URL(`../.sites-runtime/intents-${crypto.randomUUID()}/`,import.meta.url));await mkdir(directory,{recursive:true});
 const local=await createLocalEnvironment(directory,'https://example.test'),worker=createWorker(async()=>new Response('site')),pending=[];
 const call=(path,{method='GET',data,headers={},admin=false}={})=>worker.fetch(new Request(`https://example.test${path}`,{method,headers:{Origin:'https://example.test',...(data?{'Content-Type':'application/json'}:{}),...(admin?{'oai-authenticated-user-id':'local-owner'}:{}),...headers},body:data?JSON.stringify(data):undefined}),local.env,{waitUntil:p=>pending.push(p)});
 t.after(async()=>{await Promise.all(pending);local.close();});return {call,local};
}
test('photo-free home and repair inquiries are durable, private and idempotent',async t=>{
 const {call,local}=await fixture(t);
 for(const [inquiryType,service] of [['home','우리 집 도어락 상담'],['repair','고장 · 교체 상담']]){
  const data={...valid(),inquiryType,desiredProduct:'작동이 불안정해요'};
  const response=await call('/api/quotes',{method:'POST',data});assert.equal(response.status,201);const quote=await response.json();
  const submit={method:'POST',data:{slots:[]},headers:{'X-Quote-Token':data.uploadToken}};
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,submit)).status,201);
  assert.equal((await call(`/api/quotes/${quote.id}/submit`,submit)).status,200);
  assert.equal((await call(`/api/admin/quotes/${quote.id}`)).status,401);
  const body=await(await call(`/api/admin/quotes/${quote.id}`,{admin:true})).json();
  assert.equal(body.inquiry.service,service);assert.equal(body.inquiry.details,'작동이 불안정해요');assert.equal(body.inquiry.customer_name,'');assert.equal(body.photos.length,0);
 }
 assert.equal((await(await call('/api/admin/quotes',{admin:true})).json()).inquiries.length,2);
});
test('business inquiry preserves company, unit count and desired timing for administrator',async t=>{
 const {call}=await fixture(t),data={...valid(),inquiryType:'business',companyName:'테스트 인테리어',businessType:'인테리어',quantity:'18',preferredDate:'2026-11-10',desiredProduct:'검정색 푸시풀. 기존 제품 철거 상담'};
 const response=await call('/api/quotes',{method:'POST',data});assert.equal(response.status,201);const q=await response.json();
 assert.equal((await call(`/api/quotes/${q.id}/submit`,{method:'POST',data:{slots:[]},headers:{'X-Quote-Token':data.uploadToken}})).status,201);
 const {inquiry}=await(await call(`/api/admin/quotes/${q.id}`,{admin:true})).json();
 assert.equal(inquiry.service,'업체 · 다량 설치 견적');assert.equal(inquiry.space,'인테리어');
 for(const value of ['테스트 인테리어','18개','2026-11-10','기존 제품 철거 상담'])assert.ok(inquiry.details.includes(value),value);
});
test('new inquiry validates optional business fields and consent before persisting',async t=>{
 const {call}=await fixture(t);
 for(const change of [{inquiryType:'unknown'},{consent:false},{inquiryType:'business',companyName:'가'.repeat(81)},{inquiryType:'business',businessType:'unknown'},{inquiryType:'business',quantity:'-1'},{inquiryType:'business',quantity:'1.5'},{inquiryType:'business',quantity:'100001'},{inquiryType:'business',preferredDate:'2026-02-30'},{inquiryType:'business',preferredDate:'tomorrow'}])assert.equal((await call('/api/quotes',{method:'POST',data:{...valid(),...change}})).status,400,JSON.stringify(change));
});
test('home inquiries do not retain hidden business metadata',async t=>{
 const {call}=await fixture(t),data={...valid(),companyName:'이전 업체명',quantity:'4'};
 const q=await(await call('/api/quotes',{method:'POST',data})).json();assert.ok(q.id);
 await call(`/api/quotes/${q.id}/submit`,{method:'POST',data:{slots:[]},headers:{'X-Quote-Token':data.uploadToken}});
 const {inquiry}=await(await call(`/api/admin/quotes/${q.id}`,{admin:true})).json();assert.equal(inquiry.details,'');assert.equal(inquiry.space,'');
});
test('selected catalog product is validated, stored and delivered in owner list/detail',async t=>{
 const {call}=await fixture(t),data={...valid(),selectedProductId:'k100',desiredProduct:'검은색 요청',selectedProduct:{name:'forged',image:'https://evil.test/x'}};
 const response=await call('/api/quotes',{method:'POST',data});assert.equal(response.status,201);const q=await response.json();
 await call(`/api/quotes/${q.id}/submit`,{method:'POST',data:{slots:[]},headers:{'X-Quote-Token':data.uploadToken}});
 const {inquiry}=await(await call(`/api/admin/quotes/${q.id}`,{admin:true})).json();
 assert.equal(inquiry.details,'검은색 요청');assert.equal(inquiry.selected_product.id,'k100');assert.equal(inquiry.selected_product.name,'아카라 K100');assert.equal(inquiry.selected_product.image,'product-k100.webp');
 const list=await(await call('/api/admin/quotes',{admin:true})).json();assert.deepEqual(list.inquiries[0].selected_product,inquiry.selected_product);
 assert.equal((await call('/api/quotes',{method:'POST',data:{...valid(),selectedProductId:'not-a-product'}})).status,400);
});

test('customer JSON text cannot masquerade as a catalog snapshot',async t=>{
 const {call}=await fixture(t),data={...valid(),desiredProduct:JSON.stringify({format:'product-inquiry-v1',product:{id:'fake',name:'fake',brand:'fake',image:''},notes:'hidden'})};
 const q=await(await call('/api/quotes',{method:'POST',data})).json();
 await call(`/api/quotes/${q.id}/submit`,{method:'POST',data:{slots:[]},headers:{'X-Quote-Token':data.uploadToken}});
 const {inquiry}=await(await call(`/api/admin/quotes/${q.id}`,{admin:true})).json();
 assert.equal(inquiry.details,data.desiredProduct);assert.equal(inquiry.selected_product,undefined);
 assert.equal((await call('/api/quotes',{method:'POST',data:{...valid(),desiredProduct:'\u001e'+data.desiredProduct}})).status,400);
});
