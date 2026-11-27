// Writes the picture-rail gallery block into dist/index.html from the catalog.
// One product per brand, in catalog order: no ranking is implied. Run again after the catalog changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { products } from '../src/catalog.mjs';

const BRANDS = ['아카라', '베스틴', '솔리티', '유니코', '락프로', '직방', '게이트맨', '경동나비엔'];
const LOOKS = [
  { frame: 'white', mat: true, aspect: 0.8, drop: 0.04 }, { frame: 'black', mat: false, aspect: 1, drop: 0.12 },
  { frame: 'white', mat: true, aspect: 0.8, drop: -0.02 }, { frame: 'black', mat: false, aspect: 1, drop: 0.14 },
  { frame: 'black', mat: true, aspect: 0.8, drop: 0.06 }, { frame: 'white', mat: true, aspect: 1, drop: 0 },
  { frame: 'white', mat: false, aspect: 0.8, drop: 0.1 }, { frame: 'black', mat: true, aspect: 1, drop: 0.03 },
];
const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function railItems() {
  return BRANDS.map((brand, i) => {
    const product = products.find(p => p.brand === brand && p.images?.[0]?.src);
    if (!product) return null;
    return { id: product.id, title: product.name, artist: product.brand, tag: product.type, image: `/${product.images[0].src}`, details: (product.tags || []).slice(0, 4), href: `/products/${product.id}`, ...LOOKS[i % LOOKS.length] };
  }).filter(Boolean);
}

export function railBlock() {
  const items = railItems();
  const links = items.map(item => `<li><a href="${item.href}">${escape(item.title)}</a></li>`).join('');
  const json = JSON.stringify(items).replace(/</g, '\\u003c');
  return `<!-- rail:start -->
<div class="pb-rail" id="gallery"><div id="rail-gallery"><ul class="pb-rail-list">${links}</ul></div><script type="application/json" id="rail-gallery-items">${json}</script></div>
<!-- rail:end -->`;
}

export function writeRail(file = fileURLToPath(new URL('../dist/index.html', import.meta.url))) {
  const html = readFileSync(file, 'utf8');
  const start = html.indexOf('<!-- rail:start -->'), end = html.indexOf('<!-- rail:end -->');
  const anchor = html.indexOf('<!-- catalog:start -->');
  if (anchor < 0) throw new Error('catalog marker not found');
  const next = start >= 0 && end > start ? html.slice(0, start) + railBlock() + html.slice(end + '<!-- rail:end -->'.length) : html.slice(0, anchor) + railBlock() + '\n' + html.slice(anchor);
  writeFileSync(file, next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { writeRail(); console.log('rail gallery written:', railItems().map(item => item.id).join(', ')); }
