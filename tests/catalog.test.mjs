import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

test('catalog expands from data without dropping product details or inquiry names',async()=>{
  const {products,renderCatalog}=await import('../scripts/catalog.mjs');
  assert.ok(products.some(p=>p.id==='k100')&&products.some(p=>p.id==='l100'));
  assert.ok(new Set(products.map(p=>p.brandKey)).size>=6);
  for(const product of products){
    assert.ok(product.images.length===0||['owner','licensed'].includes(product.mediaPermission));
    assert.ok(product.features.length>=3);
    assert.ok(product.specs.length>=5);
    for(const image of product.images)await access(new URL('../dist/'+image.src,import.meta.url));
  }
  const many=Array.from({length:24},(_,i)=>({...products[i%2],id:'product-'+i,name:'도어락 '+i}));
  const html=renderCatalog(many);
  assert.equal((html.match(/data-product-detail=/g)||[]).length,36);
  assert.match(html,/"name":"도어락 23"/);
  const escaped=renderCatalog([{...products[0],name:'테스트 <제품> & "상담"',description:'</script><script>alert(1)</script>'}]);
  assert.match(escaped,/테스트 &lt;제품&gt; &amp; &quot;상담&quot;/);
  assert.equal(escaped.includes('</script><script>alert'),false);
});

test('unlicensed photos and missing detail sources cannot enter the catalog',async()=>{
  const {products,validateCatalog}=await import('../scripts/catalog.mjs');
  assert.throws(()=>validateCatalog([{...products[0],mediaPermission:'official-link',images:[{src:'photo.jpg'}]}]),/permission/);
  assert.throws(()=>validateCatalog([{...products[0],source:''}]),/Incomplete/);
  // The owner subsequently authorized supplier photos. Keep their source and
  // permission record explicit instead of treating a public URL as permission.
  for(const p of products.filter(p=>new URL(p.source).hostname==='keynet.kr')){
    assert.equal(p.mediaPermission,'licensed');
    assert.match(p.sourceLabel,/키넷/);
    assert.match(p.imageCredit,/키넷/);
    for(const image of p.images){
      assert.ok(image.sourceUrl.startsWith('https://keynet.kr/'));
      assert.match(image.rightsSource,/^docs\/product-photo-permission\.md#/);
      await access(new URL('../'+image.rightsSource.split('#')[0],import.meta.url));
    }
  }
});

test('rotation stops for every pause reason, resumes safely, and cancels on disposal',async()=>{
  const {createRotation}=await import('../dist/catalog-rotation.js');
  const timers=new Map();let id=0,advances=0;
  const rotation=createRotation(()=>advances++,{setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key)});
  const tick=()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();};
  assert.equal(timers.size,1);tick();assert.equal(advances,1);assert.equal(timers.size,1);
  rotation.setPaused('hover',true);rotation.setPaused('dialog',true);assert.equal(timers.size,0);
  rotation.setPaused('hover',false);assert.equal(timers.size,0);
  rotation.setPaused('dialog',false);assert.equal(timers.size,1);
  for(const reason of ['reduced-motion','hidden','offscreen','focus','user']){
    rotation.setPaused(reason,true);assert.equal(timers.size,0,reason);
    rotation.setPaused(reason,false);assert.equal(timers.size,1,reason);
  }
  rotation.restart();rotation.restart();assert.equal(timers.size,1);
  rotation.dispose();assert.equal(timers.size,0);rotation.setPaused('user',false);assert.equal(timers.size,0);
});

test('service journeys precede the full catalog and no price is published',async()=>{
  const {generateCatalog}=await import('../scripts/catalog.mjs');await generateCatalog();
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('class="service-hero"')<html.indexOf('id="products"'));
  assert.match(html,/data-intent="repair"/);assert.match(html,/data-intent="business"/);
  assert.equal((html.match(/id="products"/g)||[]).length,1);
  assert.doesNotMatch(html,/d{2,3},000|1만원|가격표|id="prices"/);
  assert.match(html,/id="product-dialog"/);assert.match(html,/id="product-gallery"/);
});
