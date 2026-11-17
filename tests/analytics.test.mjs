import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {createWorker} from '../src/worker.mjs';

test('hourly analytics preserves counts, privacy, boundaries and owner access', async t => {
  const dir=fileURLToPath(new URL(`../.sites-runtime/analytics-${crypto.randomUUID()}/`,import.meta.url));
  let local=await createLocalEnvironment(dir,'https://example.test');
  const worker=createWorker(async()=>new Response('home'));
  let now=Date.parse('2026-10-08T01:00:00Z');
  const originalNow=Date.now;Date.now=()=>now;
  t.after(()=>{Date.now=originalNow;local.close();});
  const call=(path,{method='GET',body,headers={},admin=false,cookie,origin='https://example.test'}={})=>worker.fetch(new Request('https://example.test'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(admin?{'oai-authenticated-user-id':'local-owner'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}),local.env);
  const post=(cookie,eventId=crypto.randomUUID(),options={})=>call('/api/analytics/pageview',{method:'POST',body:{eventId},cookie,...options});
  const read=(date='2026-10-08')=>call('/api/admin/analytics?date='+date,{admin:true});
  let a,b,firstId=crypto.randomUUID();
  await t.test('real homepage collection returns a daily secure cookie and persists',async()=>{
    const response=await post(undefined,firstId);assert.equal(response.status,204);
    const set=response.headers.get('set-cookie');assert.match(set,/__Host-jn-visit=/);assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);assert.match(set,/Path=\//);
    a=set.split(';')[0];
    const result=await(await read()).json();assert.deepEqual(result.daily,{visitors:1,pageviews:1});assert.equal(result.timeZone,'Asia/Seoul');assert.equal(result.hours.length,24);
    assert.deepEqual(result.hours[10],{hour:10,visitors:1,pageviews:1,pending:false});assert.equal(result.hours[11].pending,true);
  });
  await t.test('replays deduplicate while repeat visits and distinct browsers count',async()=>{
    assert.equal((await post(a,firstId)).status,204);await post(a);
    now=Date.parse('2026-10-08T02:00:00Z');await post(a);const response=await post();b=response.headers.get('set-cookie')?.split(';')[0];
    const result=await(await read()).json();assert.deepEqual(result.daily,{visitors:2,pageviews:4});
    assert.deepEqual(result.hours[10],{hour:10,visitors:1,pageviews:2,pending:false});assert.deepEqual(result.hours[11],{hour:11,visitors:2,pageviews:2,pending:false});
    local.close();local=await createLocalEnvironment(dir,'https://example.test');assert.deepEqual((await(await read()).json()).daily,{visitors:2,pageviews:4});
  });
  await t.test('admin and obvious bots are excluded; anonymous reads and foreign writes fail',async()=>{
    await post(a,crypto.randomUUID(),{admin:true});await post(a,crypto.randomUUID(),{headers:{'User-Agent':'Googlebot/2.1'}});await post(a,crypto.randomUUID(),{headers:{Purpose:'prefetch'}});
    assert.deepEqual((await(await read()).json()).daily,{visitors:2,pageviews:4});
    assert.equal((await call('/api/admin/analytics')).status,401);assert.equal((await call('/api/admin/analytics',{headers:{'oai-authenticated-user-id':'other'}})).status,403);
    assert.equal((await post(a,crypto.randomUUID(),{origin:'https://other.test'})).status,403);
    assert.equal((await post(a,'not-a-uuid')).status,400);
    assert.equal((await call('/api/analytics/pageview',{method:'POST',body:'x'.repeat(1100)})).status,413);
  });
  await t.test('invalid, future and expired query dates are rejected, before-collection is explicit',async()=>{
    for(const date of ['2026-02-30','2026-10-09','2026-07-10','2026-10-08 OR 1=1',''])assert.equal((await read(encodeURIComponent(date))).status,400,date);
    const messages=[];
    for(const date of ['2026-02-30','2026-10-09','2026-07-10'])messages.push((await(await read(date)).json()).error);
    assert.equal(new Set(messages).size,3,'invalid calendar, future and expired dates explain different causes');
    const prior=await(await read('2026-10-07')).json();assert.equal(prior.status,'before_collection');assert.deepEqual(prior.daily,{visitors:0,pageviews:0});
    const today=await(await call('/api/admin/analytics',{admin:true})).json();assert.equal(today.date,'2026-10-08');
  });
  await t.test('Korean midnight rotates visitor cookie; retry cannot move an old event',async()=>{
    now=Date.parse('2026-10-08T14:59:59.999Z');const id=crypto.randomUUID();await post(a,id);
    now=Date.parse('2026-10-08T15:00:00Z');await post(a,id);const response=await post(a);assert.ok(response.headers.get('set-cookie'));
    assert.deepEqual((await(await read('2026-10-08')).json()).daily,{visitors:2,pageviews:5});
    const next=await(await read('2026-10-09')).json();assert.deepEqual(next.daily,{visitors:1,pageviews:1});assert.equal(next.hours[0].pageviews,1);
  });
  await t.test('corrupt cookie recovers and analytics is independent of photo storage',async()=>{
    const bucket=local.env.BUCKET;local.env.BUCKET=undefined;
    const response=await post('__Host-jn-visit=broken');assert.equal(response.status,204);assert.ok(response.headers.get('set-cookie'));
    assert.equal((await read('2026-10-09')).status,200);local.env.BUCKET=bucket;
  });
  await t.test('rate limit bounds abusive new events without storing raw contact/IP data',async()=>{
    now=Date.parse('2026-10-09T01:00:00Z');let last;
    for(let i=0;i<121;i++)last=await post(b,crypto.randomUUID(),{headers:{'CF-Connecting-IP':'192.0.2.55'}});
    assert.equal(last.status,429);
    const row=local.sqlite.prepare('SELECT * FROM analytics_events LIMIT 1').get();assert.deepEqual(Object.keys(row).sort(),['day','event_id','hour','received_at','visitor_key']);
    assert.equal(JSON.stringify(local.sqlite.prepare('SELECT * FROM analytics_events').all()).includes('192.0.2.55'),false);
  });
  await t.test('retention discards expired raw events but keeps collection start',async()=>{
    now=Date.parse('2027-01-06T01:00:00Z');const response=await read('2027-01-06');assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.collectionStartedAt,Date.parse('2026-10-08T01:00:00Z'));
    assert.equal(local.sqlite.prepare("SELECT COUNT(*) n FROM analytics_events WHERE day < '2026-10-09'").get().n,0);
  });
  await t.test('concurrent deliveries of one event remain exactly one pageview',async()=>{
    const id=crypto.randomUUID();
    const responses=await Promise.all(Array.from({length:5},()=>post(undefined,id)));
    assert.deepEqual(responses.map(r=>r.status),[204,204,204,204,204]);
    assert.deepEqual((await(await read('2027-01-06')).json()).daily,{visitors:1,pageviews:1});
  });
});
