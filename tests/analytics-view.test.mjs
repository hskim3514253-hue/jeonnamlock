import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsModel,mountAnalytics} from '../dist/admin-analytics.js';
const fixture=()=>({date:'2026-10-08',timeZone:'Asia/Seoul',collectionStartedAt:Date.parse('2026-10-08T00:00:00Z'),asOf:Date.parse('2026-10-08T05:00:00Z'),status:'collected',daily:{visitors:0,pageviews:0},hours:Array.from({length:24},(_,hour)=>({hour,visitors:0,pageviews:0,pending:hour>14}))});
test('zero, pending, before-collection and peak have distinct visible labels',()=>{
  let data=fixture();let model=analyticsModel(data);assert.equal(model.dailyVisitors,'0');assert.equal(model.peak,'아직 방문 없음');assert.equal(model.hours[15].visitors,'집계 전');assert.equal(model.hours[14].visitors,'0');assert.equal(model.minDate,'2026-10-08');
  data.status='before_collection';model=analyticsModel(data);assert.equal(model.dailyVisitors,'—');assert.equal(model.hours[0].visitors,'수집 전');
  data=fixture();data.daily={visitors:4,pageviews:8};data.hours[10]={hour:10,visitors:4,pageviews:8,pending:false};model=analyticsModel(data);assert.equal(model.peak,'10시');assert.equal(model.hours[10].height,100);
});
test('calendar limits and labels use server Korean time',()=>{
  const data=fixture();data.asOf=Date.parse('2026-10-08T15:01:00Z');data.date='2026-10-09';data.collectionStartedAt=Date.parse('2025-01-01T00:00:00Z');
  const model=analyticsModel(data);assert.equal(model.maxDate,'2026-10-09');assert.equal(model.minDate,'2026-07-12');
});

// A small DOM adapter exercises the actual controller; browser QA covers layout and native inputs.
function domAdapter() {
  const nodes=new Map();
  const node=()=>({style:{},hidden:false,disabled:false,value:'',textContent:'',children:[],setAttribute(){},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}});
  const root=node();root.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  return {root,createElement:node,get:id=>root.querySelector('#'+id)};
}
test('both refresh controls retry the failed selected date instead of the last success',async t=>{
  const original=globalThis.document;t.after(()=>globalThis.document=original);
  for(const refreshFrom of ['panel','header']){
    const dom=domAdapter();globalThis.document={createElement:dom.createElement};const requests=[];let fail=true;
    const api=async path=>{requests.push(path);if(path.includes('2026-10-07')&&fail){fail=false;throw Error('temporary failure');}return {...fixture(),date:path.includes('2026-10-07')?'2026-10-07':'2026-10-08'};};
    const controller=mountAnalytics({root:dom.root,api});await controller.open();
    dom.get('analytics-date').value='2026-10-07';dom.get('analytics-date').onchange({target:dom.get('analytics-date')});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(dom.get('analytics-results').hidden,true);
    if(refreshFrom==='panel')await dom.get('analytics-refresh').onclick();else await controller.refresh();
    assert.equal(requests.at(-1),'/api/admin/analytics?date=2026-10-07');assert.equal(dom.get('analytics-date').value,'2026-10-07');assert.equal(dom.get('analytics-results').hidden,false);
  }
});
test('retrying a failed Today request still asks the server for today',async t=>{
  const original=globalThis.document;t.after(()=>globalThis.document=original);const dom=domAdapter();globalThis.document={createElement:dom.createElement};const requests=[];let failToday=false;
  const controller=mountAnalytics({root:dom.root,api:async path=>{requests.push(path);if(failToday&&!path.includes('?')){failToday=false;throw Error('offline');}return {...fixture(),date:path.includes('2026-10-07')?'2026-10-07':'2026-10-08'};}});
  await controller.open();dom.get('analytics-date').value='2026-10-07';dom.get('analytics-date').onchange({target:dom.get('analytics-date')});await new Promise(resolve=>setImmediate(resolve));
  failToday=true;await dom.get('analytics-today').onclick();await controller.refresh();assert.equal(requests.at(-1),'/api/admin/analytics');
});
