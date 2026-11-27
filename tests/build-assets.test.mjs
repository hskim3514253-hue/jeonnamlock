import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
const {default:worker}=await import('../dist/server/index.js');
test('homepage head serves both requested Naver verification tags without removing the existing one',async()=>{
  const page=await worker.fetch(new Request('https://jeonnamlock.com/'),{});
  assert.equal(page.status,200);
  const html=await page.text();
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head,'The response has a document head');
  const values=[...head.matchAll(/<meta\b[^>]*name="naver-site-verification"[^>]*content="([^"]+)"[^>]*>/g)].map(match=>match[1]);
  assert.deepEqual(values,['db3c24b75f4fa5d8aaa4aa6baa45ed04682deac3','8acfc9d039f60de18d1d6283891cacc9a56f4747']);
});
test('homepage canonical and Open Graph URL identify the official domain',async()=>{
  const page=await worker.fetch(new Request('https://jeonnamlock.com/'),{});
  assert.equal(page.status,200);
  const html=await page.text();
  assert.deepEqual([...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/g)].map(match=>match[1]),['https://jeonnamlock.com/']);
  assert.deepEqual([...html.matchAll(/<meta\b[^>]*property="og:url"[^>]*content="([^"]+)"[^>]*>/g)].map(match=>match[1]),['https://jeonnamlock.com/']);
});
test('business structured data keeps one identity on the official domain',async()=>{
  const page=await worker.fetch(new Request('https://jeonnamlock.com/'),{});
  const html=await page.text();
  const blocks=[...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
  const business=blocks.find(value=>value['@type']==='Locksmith');
  assert.ok(business,'Locksmith structured data is present and valid JSON');
  assert.equal(business.url,'https://jeonnamlock.com/');
  assert.equal(business['@id'],'https://jeonnamlock.com/#business');
  assert.equal(business['@context'],'https://schema.org');
  assert.deepEqual(business.sameAs,['https://map.naver.com/p/entry/place/1788549016']);
});
test('crawler discovery links stay on the official domain and retain admin restrictions',async()=>{
  const robots=await worker.fetch(new Request('https://jeonnamlock.com/robots.txt'),{});
  assert.equal(robots.status,200);
  assert.match(robots.headers.get('Content-Type'),/^text\/plain/);
  const directives=await robots.text();
  const sitemapUrl=directives.match(/^Sitemap:\s*(\S+)$/m)?.[1];
  assert.equal(sitemapUrl,'https://jeonnamlock.com/sitemap.xml');
  for(const path of ['/admin','/api/','/signin-with-chatgpt'])assert.ok(directives.split(/\r?\n/).includes(`Disallow: ${path}`));
  const sitemap=await worker.fetch(new Request(sitemapUrl),{});
  assert.equal(sitemap.status,200);
  assert.match(sitemap.headers.get('Content-Type'),/^application\/xml/);
  const xml=await sitemap.text();
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]),['https://jeonnamlock.com/']);
});
test('partner downloads keep exact PDF and PNG bytes and correct media types',async()=>{
  for(const [ext,mime] of [['pdf','application/pdf'],['png','image/png']]){
    const file=`jeonnam-lock-partner-introduction.${ext}`;
    const response=await worker.fetch(new Request(`https://example.test/${file}`),{});
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),mime);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL(`../dist/${file}`,import.meta.url)));
  }
  assert.equal((await worker.fetch(new Request('https://example.test/conversion.css'),{})).status,200);
});
test('every catalog gallery image and interaction module survives worker packaging',async()=>{
  const {products}=await import('../src/catalog.mjs');
  for(const file of [...new Set(products.flatMap(p=>p.images.map(image=>image.src)))]) {
    const response=await worker.fetch(new Request(`https://example.test/${file}`),{});
    assert.equal(response.status,200,file);
    assert.equal(response.headers.get('Content-Type'),file.endsWith('.webp')?'image/webp':file.endsWith('.jpg')?'image/jpeg':'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL(`../dist/${file}`,import.meta.url)));
  }
  for(const file of ['products.js','catalog-rotation.js','catalog-tools.js','products.css'])assert.equal((await worker.fetch(new Request(`https://example.test/${file}`),{})).status,200,file);
});
test('previous product photos without reuse permission are not served',async()=>{
  for(const file of ['aqara-k100.png','aqara-l100.png']) {
    const response=await worker.fetch(new Request(`https://example.test/${file}`),{});
    assert.equal(response.status,404,file);
  }
});
test('YouTube embedding is restricted to the customer page and privacy-enhanced host',async()=>{
  const page=await worker.fetch(new Request('https://example.test/'),{});
  assert.match(page.headers.get('Content-Security-Policy'),/frame-src https:\/\/www.youtube-nocookie.com;/);
  assert.equal(page.headers.get('Referrer-Policy'),'strict-origin-when-cross-origin');
  const admin=await worker.fetch(new Request('https://example.test/admin'),{});
  assert.equal(admin.headers.get('Content-Security-Policy').includes('youtube'),false);
});
test('published review photos are served as the exact local JPEG bytes',async()=>{
  for(const file of ['aqara-installation.jpg','bathroom-installation.jpg','doorlock-replacement.jpg']) {
    const response=await worker.fetch(new Request(`https://example.test/${file}`),{});
    assert.equal(response.status,200,file);assert.equal(response.headers.get('Content-Type'),'image/jpeg');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL(`../dist/${file}`,import.meta.url)));
  }
});
test('published admin view module and homepage render without leaking server internals',async()=>{
  const module=await worker.fetch(new Request('https://example.test/quote-view.js'),{});assert.equal(module.status,200);assert.match(await module.text(),/export function inquiryFields/);
  const page=await worker.fetch(new Request('https://example.test/'),{});assert.equal(page.status,200);assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');
  const denied=await worker.fetch(new Request('https://example.test/src/worker.mjs'),{});assert.equal(denied.status,404);
});
test('scene assets are packaged and the scenes carry no inline styles',async()=>{
  for(const [file,mime] of [['teal.css','text/css'],['chat.css','text/css'],['chat.js','text/javascript'],['scenes.js','text/javascript'],['scene-door.jpg','image/jpeg'],['product-bestin-idl-400m.png','image/png']]){
    const response=await worker.fetch(new Request(`https://example.test/${file}`),{});
    assert.equal(response.status,200,file);assert.match(response.headers.get('Content-Type'),new RegExp('^'+mime));
  }
  const html=await (await worker.fetch(new Request('https://jeonnamlock.com/'),{})).text();
  const scenes=html.match(/<section class="pb-hero"[\s\S]*?<section class="pb-steps"[\s\S]*?<\/section>/)?.[0];
  assert.ok(scenes,'The hero, opening and steps scenes are present');
  assert.match(scenes,/우리 집 문에 맞는/);assert.match(scenes,/href="tel:01092845963"/);assert.match(scenes,/연출 이미지 · 실제 설치 모습은 다를 수 있습니다/);
  assert.equal(/style=/.test(scenes),false,'No inline styles, so the CSP stays unchanged');
  assert.match(html,/<body class="customer-page pb no-motion">/,'Scenes start in their finished state until the script enables motion');
  assert.equal([...html.matchAll(/<h1\b/g)].length,1);
});

test('the picture-rail gallery lists real catalog products and its files are served', async () => {
  const { railItems, railBlock } = await import('../scripts/rail-gallery.mjs');
  const { products } = await import('../src/catalog.mjs');
  const html=await (await worker.fetch(new Request('https://jeonnamlock.com/'),{})).text();
  assert.ok(html.includes(railBlock()),'Run "node scripts/rail-gallery.mjs" after changing the catalog');
  const items=railItems();assert.ok(items.length>=6);
  for(const item of items){
    assert.ok(products.some(product=>product.id===item.id&&product.name===item.title),item.id);
    assert.equal((await worker.fetch(new Request('https://jeonnamlock.com'+item.image),{})).status,200,item.image);
    assert.equal(item.href,'/products/'+item.id);
    assert.equal(/원|\$/.test(item.tag),false,'No prices on the wall labels');
  }
  for(const [file,mime] of [['rail-gallery.js','text/javascript'],['rail-gallery.css','text/css']]){
    const response=await worker.fetch(new Request('https://jeonnamlock.com/'+file),{});
    assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),new RegExp(mime));
  }
});
