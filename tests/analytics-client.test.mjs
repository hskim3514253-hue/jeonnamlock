import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function browser({hidden=false,path='/',replies=[204]}={}) {
  const document=new EventTarget(); document.visibilityState=hidden?'hidden':'visible';
  const window=new EventTarget(),requests=[],timers=[];
  const context={document,window,location:{pathname:path},crypto,JSON,setTimeout:fn=>timers.push(fn),fetch:async(url,options)=>{requests.push({url,options});const status=replies[Math.min(requests.length-1,replies.length-1)];if(status==='throw')throw new Error('offline');return {ok:status<400,status};}};
  vm.runInNewContext(await readFile(new URL('../dist/analytics.js',import.meta.url),'utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  const show=persisted=>{const event=new Event('pageshow');event.persisted=persisted;window.dispatchEvent(event);};
  const visible=value=>{document.visibilityState=value?'visible':'hidden';document.dispatchEvent(new Event('visibilitychange'));};
  await tick();return {requests,timers,show,visible,tick};
}
test('one collection per visible document display, not anchors or ordinary tab switches',async()=>{
  const b=await browser();assert.equal(b.requests.length,1);b.show(false);b.visible(false);b.visible(true);await b.tick();assert.equal(b.requests.length,1);
  b.show(true);await b.tick();assert.equal(b.requests.length,2);
  assert.notEqual(JSON.parse(b.requests[0].options.body).eventId,JSON.parse(b.requests[1].options.body).eventId);
  assert.deepEqual(Object.keys(JSON.parse(b.requests[0].options.body)),['eventId']);
  assert.equal(b.requests[0].options.credentials,'same-origin');assert.equal(b.requests[0].options.keepalive,true);
});
test('hidden initial load and hidden BFCache restore each wait for visibility',async()=>{
  const b=await browser({hidden:true});b.show(false);assert.equal(b.requests.length,0);b.visible(true);await b.tick();assert.equal(b.requests.length,1);
  b.visible(false);b.show(true);await b.tick();assert.equal(b.requests.length,1);b.visible(true);await b.tick();assert.equal(b.requests.length,2);
});
test('transient failures retry the same event once and never escape to the form',async()=>{
  for(const replies of [[503,204],['throw','throw']]){const b=await browser({replies});assert.equal(b.timers.length,1);b.timers.shift()();await b.tick();assert.equal(b.requests.length,2);assert.equal(b.requests[0].options.body,b.requests[1].options.body);assert.equal(b.timers.length,0);}
  const limited=await browser({replies:[429]});assert.equal(limited.timers.length,0);
});
test('admin and non-home paths are never collected',async()=>{for(const path of ['/admin','/privacy','/api/session'])assert.equal((await browser({path})).requests.length,0);});
