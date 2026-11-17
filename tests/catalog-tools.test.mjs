import test from 'node:test';
import assert from 'node:assert/strict';

const sample=[
  {id:'k100',name:'아카라 K100',brand:'아카라',brandKey:'aqara',category:'main',type:'푸시풀',model:'KL-D01D',tags:['지문'],aliases:['Aqara']},
  {id:'s70',name:'코콤 KDL-S70',brand:'코콤',brandKey:'kocom',category:'auxiliary',type:'보조키',model:'KDL-S70',tags:['카드'],aliases:['KOCOM']},
  {id:'s50',name:'코콤 KDL-S50',brand:'코콤',brandKey:'kocom',category:'glass',type:'유리문',model:'KDL-S50',tags:['카드'],aliases:['KOCOM']},
];
test('catalog search combines brand, type and normalized model without mutating data',async()=>{
  const {filterProducts}=await import('../dist/catalog-tools.js');
  assert.deepEqual(filterProducts(sample,{brand:'kocom',category:'auxiliary',query:'코콤 S-70'}).map(p=>p.id),['s70']);
  assert.deepEqual(filterProducts(sample,{query:'aqara k 100'}).map(p=>p.id),['k100']);
  assert.equal(filterProducts(sample,{brand:'aqara',category:'glass'}).length,0);
  assert.equal(filterProducts(sample,{query:'없는모델'}).length,0);
  assert.equal(filterProducts(sample,{}).length,3);
  assert.equal(sample.length,3);
});
test('large catalog pagination clamps stale pages and has no gaps or duplicate entries',async()=>{
  const {paginate}=await import('../dist/catalog-tools.js');
  const data=Array.from({length:417},(_,id)=>({id}));
  const seen=[];
  for(let page=1;page<=35;page++)seen.push(...paginate(data,page,12).items.map(p=>p.id));
  assert.deepEqual(seen,data.map(p=>p.id));
  assert.equal(paginate(data,99,12).page,35);
  assert.equal(paginate(data,0,12).page,1);
  assert.deepEqual(paginate([],3,12),{items:[],page:1,pages:0,total:0});
});
test('video URLs only use the original YouTube privacy-enhanced player',async()=>{
  const {videoEmbedUrl}=await import('../dist/catalog-tools.js');
  assert.equal(videoEmbedUrl('vKfQLjVWjpo'),'https://www.youtube-nocookie.com/embed/vKfQLjVWjpo?rel=0');
  for(const bad of ['//evil.test','abc','vKfQLjVWjpo?autoplay=1','<script>'])assert.throws(()=>videoEmbedUrl(bad));
});

test('two-row showroom advances through distinct columns and reaches the final products',async()=>{
  const {carouselStops}=await import('../dist/catalog-tools.js');
  assert.deepEqual(carouselStops([4,4,244,244,484,484,724],510),[0,240,480,510]);
  assert.deepEqual(carouselStops([4,4],0),[0]);
  assert.deepEqual(carouselStops([],0),[0]);
});
