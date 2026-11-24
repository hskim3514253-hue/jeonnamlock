import test from 'node:test';
import assert from 'node:assert/strict';
import {products} from '../src/catalog.mjs';
import {productPages,productPath,renderSitemap,renderModelIndex} from '../scripts/product-pages.mjs';

test('every catalog product gets its own indexable page with unique head tags',()=>{
  const pages=productPages(products);
  assert.equal(pages.size,products.length);
  const titles=new Set(),canonicals=new Set();
  for(const product of products){
    const html=pages.get(productPath(product));
    assert.ok(html.includes(`<link rel="canonical" href="https://jeonnamlock.com/products/${product.id}">`),product.id);
    assert.equal((html.match(/<h1>/g)||[]).length,1);
    assert.equal(/ style=/.test(html),false,'No inline styles, so the CSP stays unchanged');
    assert.equal(/<script(?![^>]*(application\/ld\+json|src=))/.test(html),false,'No inline scripts');
    titles.add(html.match(/<title>([^<]+)/)[1]);canonicals.add(html.match(/rel="canonical" href="([^"]+)/)[1]);
    for(const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(block[1]);
    assert.equal(/"offers"|aggregateRating|"review"/.test(html),false,'No price or rating claims in structured data');
  }
  assert.equal(titles.size,products.length);assert.equal(canonicals.size,products.length);
});
test('product text is escaped and the sitemap and homepage list link every page',()=>{
  const html=productPages([{...products[0],id:'x',name:'<b>"A"&B</b>'}]).get('/products/x');
  assert.ok(html.includes('&lt;b&gt;&quot;A&quot;&amp;B&lt;/b&gt;'));assert.equal(html.includes('<b>"A"'),false);
  const locations=[...renderSitemap(products,'2026-11-24').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
  assert.equal(locations.length,products.length+1);assert.equal(locations[0],'https://jeonnamlock.com/');
  const index=renderModelIndex(products);
  for(const product of products)assert.ok(index.includes(`href="/products/${product.id}"`),product.id);
});
test('product pages give the same price answer as the chat and quote no amount',async()=>{
  const {priceProducts}=await import('../src/product-index.mjs');
  const {priceAnswer}=await import('../src/prices.mjs');
  const pages=productPages(products);
  for(const product of products){
    const html=pages.get(productPath(product)).replace(/&amp;/g,'&').replace(/&quot;/g,'"');
    assert.ok(html.includes(priceAnswer({id:product.id,...priceProducts[product.id]})),product.id);
  }
  assert.doesNotMatch(pages.get('/products/k100'),/d{2,3},000|설치비/);
});
