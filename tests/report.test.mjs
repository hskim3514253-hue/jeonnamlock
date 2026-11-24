import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {ensureVisitTable,validVisit,recordVisit,readReport,reportAllowed,SOURCES} from '../src/report.mjs';

async function database(t){
  const directory=fileURLToPath(new URL(`../.sites-runtime/report-${crypto.randomUUID()}/`,import.meta.url));
  await mkdir(directory,{recursive:true});
  const local=await createLocalEnvironment(directory,'https://example.test');
  t.after(()=>local.close());
  await ensureVisitTable(local.env.DB);await ensureVisitTable(local.env.DB);
  return local.env.DB;
}
test('only the categories and pages this site sends are counted',()=>{
  const ids=new Set(['k100']);
  assert.deepEqual(validVisit({source:'naver',page:'home'},ids),{source:'naver',page:'home'});
  assert.deepEqual(validVisit({source:'ai',page:'product:k100',extra:'https://example.com/?q=secret'},ids),{source:'ai',page:'product:k100'});
  for(const bad of [null,[],'x',{source:'naver'},{source:'https://search.naver.com/?query=x',page:'home'},{source:'naver',page:'product:unknown'},{source:'naver',page:'/admin'},{source:'naver',page:5}])
    assert.equal(validVisit(bad,ids),null);
  assert.ok(SOURCES.includes('daangn')&&SOURCES.includes('direct'));
});
test('visits add up per day and the report holds totals but no customer details',async t=>{
  const DB=await database(t),now=Date.parse('2026-11-24T03:00:00Z');
  for(const visit of [{source:'naver',page:'home'},{source:'naver',page:'product:k100'},{source:'ai',page:'home'}])await recordVisit(DB,now,visit);
  await recordVisit(DB,now-86400000,{source:'direct',page:'home'});
  const report=await readReport(DB,7,now);
  assert.equal(report.days.length,7);assert.equal(report.to,'2026-11-24');
  assert.deepEqual(report.sources,[{name:'naver',count:2},{name:'ai',count:1},{name:'direct',count:1}]);
  assert.equal(report.pages.find(page=>page.name==='home').count,3);
  assert.equal(report.days.at(-1).pageOpens,3);assert.equal(report.days.at(-2).pageOpens,1);
  assert.equal(report.inquiries,0);
  assert.equal(/phone|customer|address|visitor_key|cookie/i.test(JSON.stringify({...report,notes:[]})),false);
  assert.equal((await readReport(DB,9999,now)).days.length,90);assert.equal((await readReport(DB,'x',now)).days.length,7);
});
test('the report opens only with the exact key',async()=>{
  const ask=value=>new Request('https://example.test/api/report',{headers:value?{Authorization:value}:{}});
  const key='k'.repeat(40);
  assert.equal(await reportAllowed(ask('Bearer '+key),key),true);
  for(const wrong of ['', 'Bearer '+key+'x','Bearer '+key.slice(1),key.slice(0,10)])assert.equal(await reportAllowed(ask(wrong),key),false,wrong);
  assert.equal(await reportAllowed(ask('Bearer '),''),false,'no key configured');
  assert.equal(await reportAllowed(ask('Bearer short'),'short'),false,'keys under 24 characters are refused');
});
