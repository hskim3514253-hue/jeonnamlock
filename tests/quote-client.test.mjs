import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
function adapter(fetch) {
  const nodes=new Map(), elements=[];
  function node(id='') {
    const n={id,value:'',checked:false,disabled:false,hidden:false,open:false,textContent:'',children:[],attributes:new Map(),events:{},classList:{add(){},remove(){},toggle(){}},files:[],
      addEventListener(event,handler){this.events[event]=handler;},setAttribute(key,value){this.attributes.set(key,value);},removeAttribute(key){this.attributes.delete(key);},focus(){this.focused=true;},scrollIntoView(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelector(selector){return get(id+selector);},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;},contains(){return false;}};
    return n;
  }
  function get(id){if(!nodes.has(id)){const n=node(id);nodes.set(id,n);elements.push(n);}return nodes.get(id);}
  const form=get('quote-form');const service=Object.assign([{value:'새 도어락 설치'},{value:'도어락 교체'},{value:'고장 · 잠김 상담'}],{value:'새 도어락 설치'});form.elements={service};
  form.querySelectorAll=selector=>selector==='[aria-invalid]'?elements.filter(n=>n.attributes.has('aria-invalid')):elements;
  form.reset=()=>{for(const n of elements){n.value='';n.checked=false;}};
  const productLinks=['아카라 K100','아카라 L100'].map(product=>Object.assign(node(product),{dataset:{product}}));
  const document={getElementById:get,createElement:()=>node(),querySelector:selector=>get(selector.startsWith('#')?selector.slice(1):selector),querySelectorAll:selector=>selector==='[data-catalog-name]'?productLinks.map(link=>({dataset:{catalogName:link.dataset.product}})):selector==='[data-product]'?productLinks:selector==='.form-step'?[get('step0'),get('step1'),get('step2')]:selector==='.form-progress li'?[node(),node(),node()]:[]};
  get('catalog-data').textContent=JSON.stringify([{id:'k100',name:'아카라 K100',brand:'아카라',images:[{src:'product-k100.webp'}]},{id:'l100',name:'아카라 L100',brand:'아카라',images:[{src:'product-l100.webp'}]}]);
  get('district').value='광주 북구 용봉동';get('customer-phone').value='010-0000-0000';get('privacy-consent').checked=true;
  const urls=[];vm.runInNewContext(source,{document,window:{addEventListener(){}},crypto,fetch,AbortController,AbortSignal,URL:{createObjectURL:()=>{const url='blob:'+urls.length;urls.push(url);return url;},revokeObjectURL(){}},Image:class{async decode(){}},matchMedia:()=>({matches:true})});
  const submit=()=>form.events.submit({preventDefault(){}});
  const addDoor=async()=>{const input=get('door-photos');input.files=[new File([new Uint8Array([137,80,78,71,13,10,26,10,1])],'door.png',{type:'image/png',lastModified:1})];input.events.change();await new Promise(resolve=>setImmediate(resolve));};
  return {get,form,submit,addDoor,chooseProduct:index=>productLinks[index].events.click?.({preventDefault(){}})};
}
function responses(requests) { return async(url,options)=>{requests.push({url,options});return Response.json(url==='/api/quotes'?{id:'quote-test',status:'draft'}:url.endsWith('/submit')?{receipt:'JN-TEST',submitted:true}:{uploaded:true});}; }

test('one submit sends only the simple quote fields and completes private photo upload',async()=>{
  const requests=[],dom=adapter(responses(requests));await dom.addDoor();await dom.submit();
  assert.deepEqual(requests.map(x=>x.url),['/api/quotes','/api/quotes/quote-test/photos/door-0','/api/quotes/quote-test/submit']);
  const data=JSON.parse(requests[0].options.body);assert.equal(data.district,'광주 북구 용봉동');assert.equal(data.phone,'01000000000');assert.equal(data.desiredProduct,'');assert.equal(data.consentVersion,'2026-10-27-v3');assert.equal(data.inquiryType,'home');
  for(const field of ['customerName','address','addressDetail','space','service'])assert.equal(field in data,false,field);
  assert.equal(dom.get('success-dialog').open,true);assert.match(dom.get('receipt-number').textContent,/JN-TEST/);
  await dom.submit();assert.equal(requests.length,3,'repeated submit must not create duplicate requests');
});

test('the single page blocks missing neighborhood, invalid phone, or missing consent',async()=>{
  for(const [field,value,message] of [['district','','동네'],['customer-phone','123','연락처'],['privacy-consent',false,'동의']]) {
    const requests=[],dom=adapter(responses(requests));if(field!=='door-photos')await dom.addDoor();if(field==='privacy-consent')dom.get(field).checked=value;else if(value!==null)dom.get(field).value=value;
    await dom.submit();assert.equal(requests.length,0);assert.ok(dom.get('form-error').textContent.includes(message),`${field}: ${dom.get('form-error').textContent}`);
  }
});

test('customer can request a callback without taking a photo',async()=>{
  const requests=[],dom=adapter(responses(requests));await dom.submit();
  assert.deepEqual(requests.map(x=>x.url),['/api/quotes','/api/quotes/quote-test/submit']);
  assert.deepEqual(JSON.parse(requests[1].options.body),{slots:[]});assert.equal(dom.get('success-dialog').open,true);
});

test('business intake sends structured details without making them compulsory',async()=>{
  const requests=[],dom=adapter(responses(requests));dom.get('inquiry-type').value='business';dom.get('company-name').value='테스트 업체';dom.get('business-type').value='인테리어';dom.get('quantity').value='15';dom.get('preferred-date').value='2026-11-15';await dom.submit();
  assert.equal(requests.length,2);const data=JSON.parse(requests[0].options.body);assert.equal(data.inquiryType,'business');assert.equal(data.companyName,'테스트 업체');assert.equal(data.quantity,'15');assert.equal(data.preferredDate,'2026-11-15');
});

test('business quantity validation does not start an unrecoverable submission',async()=>{
  const requests=[],dom=adapter(responses(requests));dom.get('inquiry-type').value='business';dom.get('quantity').value='-1';await dom.submit();assert.equal(requests.length,0);assert.match(dom.get('form-error').textContent,/수량/);
});

test('leading zero quantity is normalized before server submission and does not freeze on a 400',async()=>{
  const requests=[],good=responses(requests),dom=adapter(async(url,options)=>{
    if(url==='/api/quotes' && JSON.parse(options.body).quantity.length>6) return Response.json({error:'설치 수량을 확인해주세요.'},{status:400});
    return good(url,options);
  });
  dom.get('inquiry-type').value='business';dom.get('quantity').value='0000001';await dom.submit();
  assert.equal(dom.get('success-dialog').open,true);
  assert.equal(JSON.parse(requests[0].options.body).quantity,'1');
});

test('retry keeps the same idempotency key and frozen photos, then reset permits a new quote',async()=>{
  const requests=[];let fail=true;const good=responses(requests);const dom=adapter(async(url,options)=>{if(url.includes('/photos/')&&fail){fail=false;requests.push({url,options});throw Error('offline');}return good(url,options);});
  await dom.addDoor();await dom.submit();assert.equal(dom.get('success-dialog').open,false);assert.match(dom.get('form-error').textContent,/다시 시도/);
  await dom.submit();const creates=requests.filter(x=>x.url==='/api/quotes').map(x=>JSON.parse(x.options.body));assert.equal(creates.length,2);assert.equal(creates[0].requestKey,creates[1].requestKey);assert.equal(creates[0].uploadToken,creates[1].uploadToken);assert.equal(dom.get('success-dialog').open,true);
  dom.get('start-over').events.click();assert.equal(dom.get('success-dialog').open,false);assert.equal(dom.get('customer-phone').disabled,false);assert.equal(dom.get('door-previews').children.length,0);
});

test('product inquiry keeps customer notes, replaces the selected model, and submits that model',async()=>{
  const requests=[],dom=adapter(responses(requests));
  dom.get('desired-product').value='검은색 제품으로 설치하고 싶어요.';
  dom.chooseProduct(0);
  assert.equal(dom.get('desired-product').value,'[문의 제품: 아카라 K100]\n검은색 제품으로 설치하고 싶어요.');
  dom.chooseProduct(1);dom.chooseProduct(1);
  assert.equal(dom.get('desired-product').value,'[문의 제품: 아카라 L100]\n검은색 제품으로 설치하고 싶어요.');
  assert.equal(requests.length,0,'selecting a product does not submit a quote');
  await dom.addDoor();await dom.submit();
  assert.equal(JSON.parse(requests[0].options.body).desiredProduct,'[문의 제품: 아카라 L100]\n검은색 제품으로 설치하고 싶어요.');
});

test('product selection never truncates a full customer message',()=>{
  const dom=adapter(responses([]));dom.get('desired-product').value='가'.repeat(1000);
  dom.chooseProduct(0);
  assert.equal(dom.get('desired-product').value,'가'.repeat(1000));
  assert.match(dom.get('form-error').textContent,/1000/);
});

test('product buttons preserve the frozen inquiry when retrying a failed upload',async()=>{
  const dom=adapter(async()=>{throw Error('offline');});
  dom.chooseProduct(0);await dom.addDoor();await dom.submit();
  const original=dom.get('desired-product').value;dom.chooseProduct(1);
  assert.equal(dom.get('desired-product').value,original);
  assert.match(dom.get('form-error').textContent,/현재 문의/);
});

test('product selection includes durable ID and visible removable card',async()=>{
 const requests=[],dom=adapter(responses(requests));dom.chooseProduct(0);
 assert.equal(dom.get('selected-product').hidden,false);assert.equal(dom.get('selected-product-name').textContent,'아카라 K100');
 await dom.submit();assert.equal(JSON.parse(requests[0].options.body).selectedProductId,'k100');
 dom.get('start-over').events.click();assert.equal(dom.get('selected-product').hidden,true);
 const second=[],d=adapter(responses(second));d.chooseProduct(1);d.get('clear-selected-product').events.click();await d.submit();
 assert.equal(d.get('selected-product').hidden,true);assert.equal(JSON.parse(second[0].options.body).selectedProductId,undefined);
});
