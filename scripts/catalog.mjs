import {renderModelIndex} from './product-pages.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {products,videos} from '../src/catalog.mjs';
import {categories,escapeHtml as e,renderProductCard,videoEmbedUrl} from '../dist/catalog-tools.js';
export {products,videos};
export function validateCatalog(items){
  const ids=new Set();
  for(const p of items){
    if(!/^[a-z0-9-]+$/.test(p.id)||ids.has(p.id)||!p.name||p.name.length>100||/[\[\]\r\n]/.test(p.name))throw Error('Invalid catalog product');
    if(!p.description||!p.features?.length||!p.specs?.length||!p.source?.startsWith('https://')||!categories.some(([id])=>id===p.category))throw Error('Incomplete product details');
    ids.add(p.id);
    if(p.images?.length&&!['owner','licensed'].includes(p.mediaPermission))throw Error('Product photo permission missing');
    for(const image of p.images||[])if(!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(image.src)||!image.rightsSource)throw Error('Invalid product image rights');
  }
}
function videoCard(v){videoEmbedUrl(v.id);return `<article class="video-card"><div class="video-stage" data-video-stage="${e(v.id)}"><button type="button" class="video-load" data-video-load="${e(v.id)}" aria-label="${e(v.title)} 재생"><span class="video-play-icon" aria-hidden="true">▷</span><span>${e(v.label)}</span><strong>${e(v.title)}</strong><small>누르면 YouTube 영상이 로드됩니다</small></button></div><div class="video-caption"><p>${e(v.description)}</p><a href="https://www.youtube.com/watch?v=${e(v.id)}" target="_blank" rel="noopener noreferrer">YouTube에서 보기 ↗</a></div></article>`;}
export function renderCatalog(items){
  validateCatalog(items);
  const photographed=items.filter(p=>p.images?.length);
  const showcase=photographed.length?photographed:items;
  const firstModels=['k100','l100','bestin-idl-400r','bestin-idl-312r','kocom-kdl-ip730','kocom-kdl-s9900','locpro-h5000sfh','solity-p6000-bf','unicor-ai-8700fp','gateman-g-suit-touch-plus'];
  const featured=[...showcase.filter(p=>firstModels.includes(p.id)).sort((a,b)=>firstModels.indexOf(a.id)-firstModels.indexOf(b.id)),...showcase.filter(p=>!firstModels.includes(p.id))];
  const brands=[...new Map(items.map(p=>[p.brandKey,p.brand])).entries()];
  const brandButtons=[['all','전체 브랜드'],...brands].map(([key,label])=>`<button type="button" data-brand="${e(key)}" aria-pressed="${key==='all'}">${e(label)}</button>`).join('');
  return `<section id="products" class="catalog-section" aria-labelledby="products-title">
  <div class="container"><div class="catalog-heading"><div><p class="catalog-kicker">JEONNAM LOCK · DOOR LOCK COLLECTION</p><h2 id="products-title">도어락, 한눈에 둘러보세요.</h2></div><p><strong>${items.length}개 상품 · ${brands.length}개 브랜드</strong><br>마음에 드는 제품을 눌러 자세히 살펴보세요.</p></div>
  <div class="catalog-track" id="catalog-track" tabindex="0" role="region" aria-roledescription="캐러셀" aria-label="${featured.length}개 도어락 전시. 좌우 방향키 또는 손가락으로 넘겨보세요.">
  ${featured.map((p,i)=>renderProductCard(p,{featured:true,index:i,total:featured.length})).join('\n')}
  </div><div class="catalog-footer"><p>모든 상품 가격문의 · 제품 수급과 설치 가능 여부는 상담 후 안내</p><div class="catalog-controls"><span id="catalog-position" aria-live="off">${featured.length?1:0} / ${featured.length}</span><button type="button" id="catalog-prev" aria-label="이전 상품" aria-controls="catalog-track">←</button><button type="button" id="catalog-play" aria-label="상품 자동 넘김 일시정지">일시정지</button><button type="button" id="catalog-next" aria-label="다음 상품" aria-controls="catalog-track">→</button></div></div>
  <div id="catalog-browser" class="catalog-browser"><div class="catalog-browser-heading"><div><span class="catalog-kicker">FIND YOUR DOOR LOCK</span><h3>도어락 찾아보기</h3></div><label class="catalog-search"><span class="sr-only">제품명 또는 모델명 검색</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input type="search" id="catalog-search" placeholder="브랜드 · 모델명 검색" autocomplete="off"><button type="button" id="catalog-search-clear" aria-label="검색어 지우기" hidden>×</button></label></div>
  <div class="catalog-filter-row"><span id="catalog-kind-label">종류</span><div class="catalog-filter-options" role="group" aria-labelledby="catalog-kind-label">${categories.filter(([id])=>id==='all'||items.some(p=>p.category===id)).map(([id,label])=>`<button type="button" data-category="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div></div>
  <div class="catalog-filter-row brand-filter"><span id="catalog-brand-label">브랜드</span><div class="catalog-filter-options" role="group" aria-labelledby="catalog-brand-label">${brandButtons}</div></div>
  <div class="catalog-results-line"><p id="catalog-results" aria-live="polite">전체 ${items.length}개 제품</p><button type="button" id="catalog-reset">필터 초기화 ↺</button></div>
  <div id="catalog-grid" class="catalog-grid">${items.slice(0,12).map(p=>renderProductCard(p)).join('')}</div>
  <div id="catalog-empty" class="catalog-empty" hidden><h4>조건에 맞는 제품이 없어요.</h4><p>검색어를 줄이거나 다른 브랜드·종류를 선택해보세요.<br>찾는 모델이 없어도 사진 견적으로 문의할 수 있습니다.</p><a href="#quote" class="text-button">원하는 모델 사진으로 문의 ↗</a></div>
  <div class="catalog-pagination" id="catalog-pagination"><button type="button" id="catalog-page-prev" aria-label="이전 제품 목록" disabled>← 이전</button><span id="catalog-page-status">1 / ${Math.ceil(items.length/12)}</span><button type="button" id="catalog-page-next" aria-label="다음 제품 목록" ${items.length<=12?'disabled':''}>다음 →</button></div>
  <p class="catalog-source-note">제품 사진과 제조사 자료를 함께 안내합니다. 사진의 색상·구성품은 설치 조건에 따라 달라질 수 있으니 상담 시 확인해주세요.</p>
  ${renderModelIndex(items)}
  <noscript><p>전체 검색·상세 설명은 자바스크립트가 필요합니다. <a href="tel:01092845963">전화로 제품 상담하기</a></p></noscript></div>
  <div class="catalog-videos"><div class="catalog-video-heading"><span class="catalog-kicker">WATCH & DISCOVER</span><h3>영상으로 먼저 만나보세요.</h3><p>제조사 공식 광고와 사용 안내를 원본 영상으로 확인하세요.</p></div><div class="catalog-video-grid">${videos.map(videoCard).join('')}</div></div></div>
  <script type="application/json" id="catalog-data">${JSON.stringify(items).replace(/</g,'\\u003c')}</script><script type="application/json" id="catalog-videos-data">${JSON.stringify(videos).replace(/</g,'\\u003c')}</script>
</section>
<dialog id="product-dialog" class="product-dialog" aria-labelledby="product-detail-title"><div class="product-dialog-top"><span>상품 상세</span><button type="button" id="product-detail-close" aria-label="상품 상세 닫기" autofocus>닫기 <span aria-hidden="true">×</span></button></div><div class="product-detail-layout"><div id="product-gallery" class="product-gallery"><div id="product-art-detail"></div><a id="product-full-image" target="_blank" rel="noopener noreferrer" aria-label="현재 제품 사진 크게 보기 새 창" hidden><img id="product-main-image" width="1000" height="1000" alt=""><span>사진 크게 보기 ↗</span></a><div class="gallery-navigation" hidden><button type="button" id="gallery-prev" aria-label="이전 제품 사진">←</button><p id="gallery-caption" aria-live="polite"></p><button type="button" id="gallery-next" aria-label="다음 제품 사진">→</button></div><div id="product-thumbnails" class="product-thumbnails" aria-label="제품 사진 선택" hidden></div><p class="gallery-credit" id="product-image-credit"></p><a id="product-official-photos" class="official-photos" target="_blank" rel="noopener noreferrer">공식 제품 사진·상세정보 보기 ↗</a><div id="product-detail-video" class="detail-video" hidden></div></div><div class="product-detail-copy"><p id="product-detail-type" class="catalog-kicker"></p><h2 id="product-detail-title"></h2><p id="product-detail-description"></p><div class="detail-price"><button type="button" id="product-detail-price-chat" class="price-chat-open" data-price-chat="" data-price-chat-name="">가격문의 <span aria-hidden="true">↗</span></button><span>누르면 가격 안내 채팅이 열립니다. 가격은 상담 후 안내합니다.</span></div><div id="product-detail-features" class="product-detail-features"></div><h3 class="detail-spec-title">확인된 제품 정보</h3><dl id="product-detail-specs"></dl><div class="detail-installation"><h3>설치 전 확인해주세요</h3><p id="product-detail-installation"></p><p>제품 수급과 현장 조건을 확인한 뒤 견적을 안내합니다.</p></div><a id="product-detail-source" class="detail-source" target="_blank" rel="noopener noreferrer">제조사 제품 정보 확인 ↗</a><p id="product-verified" class="detail-verified"></p></div></div><div class="product-dialog-actions"><a href="tel:01092845963" class="button secondary">전화 상담</a><a href="#quote" id="product-detail-quote" data-product="" class="button">이 제품으로 상담하기 <span aria-hidden="true">↗</span></a></div></dialog>`;
}
export async function generateCatalog(){
  await writeFile(new URL('../src/product-index.mjs',import.meta.url),`export const inquiryProducts=${JSON.stringify(Object.fromEntries(products.map(p=>[p.id,{id:p.id,name:p.name,brand:p.brand,image:p.images?.[0]?.src||''}])))};\nexport const priceProducts=${JSON.stringify(Object.fromEntries(products.map(p=>[p.id,{name:p.name,brand:p.brand,type:p.type,category:p.category,fingerprint:/지문/.test([p.type,...p.tags].join(' '))}])))};\n`);
  const url=new URL('../dist/index.html',import.meta.url),html=await readFile(url,'utf8');
  const pattern=/<!-- catalog:start -->[\s\S]*?<!-- catalog:end -->/;
  if(!pattern.test(html))throw Error('Catalog markers missing');
  const updated=html.replace(pattern,`<!-- catalog:start -->\n${renderCatalog(products)}\n<!-- catalog:end -->`);
  if(updated!==html)await writeFile(url,updated);
}
