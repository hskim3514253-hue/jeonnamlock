export const categories=[['all','전체'],['main','주키'],['auxiliary','보조키'],['glass','유리문'],['sash','샷시문'],['sliding','미닫이문'],['wood','목문'],['locker','락카키'],['hotel','호텔락'],['room','목문·락커'],['accessory','부자재']];
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
export function filterProducts(items,{category='all',brand='all',query=''}={}){
  const terms=query.trim().split(/\s+/).map(normalize).filter(Boolean);
  return items.filter(p=>(category==='all'||p.category===category)&&(brand==='all'||p.brandKey===brand)&&terms.every(t=>normalize([p.name,p.brand,p.model,p.type,...p.tags,...(p.aliases||[])].join(' ')).includes(t)));
}
export function paginate(items,page=1,size=12){
  size=Math.max(1,Math.floor(size)||12);const pages=Math.ceil(items.length/size);
  page=Math.max(1,Math.min(pages||1,Math.floor(page)||1));
  return {items:items.slice((page-1)*size,page*size),page,pages,total:items.length};
}
export function videoEmbedUrl(id){if(!/^[\w-]{11}$/.test(id))throw Error('Invalid YouTube video ID');return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;}
export function carouselStops(offsets,max){
  const end=Math.max(0,Math.round(max)),origin=offsets[0]||0;
  return [...new Set([0,...offsets.map(x=>Math.min(end,Math.max(0,Math.round(x-origin)))),end])].sort((a,b)=>a-b);
}
export function productArt(product){
  const label=escapeHtml(product.model),brand=escapeHtml(product.brandLatin||product.brand);
  return `<div class="product-art product-photo-pending"><span class="art-brand">${brand}</span><strong>${label}</strong><span class="art-caption">제품 외관은 상세창의 공식 사진으로 확인</span></div>`;
}
export function renderProductCard(p,{featured=false,index=0,total=1}={}){
  const e=escapeHtml,media=p.images?.length?`<img src="${e(p.images[0].src)}" width="${p.images[0].width||1000}" height="${p.images[0].height||1000}" loading="${featured&&index<10?'eager':'lazy'}" decoding="async" alt="${e(p.images[0].alt)}">${p.imageNotice?`<span class="catalog-photo-note">${e(p.imageNoticeShort||p.imageNotice)}</span>`:''}`:productArt(p);
  return `<article class="${featured?'catalog-slide':'catalog-grid-item'}"${featured?` role="group" aria-roledescription="슬라이드" aria-label="${index+1} / ${total} · ${e(p.name)}"`:''}><a class="${featured?'catalog-card':'product-tile'}" href="#products" data-product-detail="${e(p.id)}" data-catalog-name="${e(p.name)}" aria-label="${e(p.name)} 상세 설명과 사진 보기"><div class="catalog-image"><span class="catalog-type">${e(p.type)}</span>${media}</div><div class="catalog-copy"><span class="catalog-brand">${e(p.brand)}</span><h3>${e(p.name)}</h3><p>${e(p.tagline)}</p><ul>${p.tags.slice(0,3).map(t=>`<li>${e(t)}</li>`).join('')}</ul><div class="catalog-card-bottom"><strong class="price-chat-space" aria-hidden="true">가격문의</strong><span>상세 보기 <span aria-hidden="true">↗</span></span></div></div></a><button type="button" class="price-chat-card" data-price-chat="${e(p.id)}" data-price-chat-name="${e(p.name)}" aria-label="${e(p.name)} 가격문의 채팅 열기">가격문의</button></article>`;
}
