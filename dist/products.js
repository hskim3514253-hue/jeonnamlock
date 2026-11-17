import {createRotation} from './catalog-rotation.js';
import {filterProducts,paginate,renderProductCard,productArt,videoEmbedUrl,carouselStops} from './catalog-tools.js';

const section=document.querySelector('#products');
const track=document.querySelector('#catalog-track');
const slides=[...track.querySelectorAll('.catalog-slide')];
const products=JSON.parse(document.querySelector('#catalog-data').textContent);
const videos=JSON.parse(document.querySelector('#catalog-videos-data').textContent);
const dialog=document.querySelector('#product-dialog');
const byId=id=>document.getElementById(id);
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let current=0,selected=null,photoIndex=0,userPaused=false,scrollTimer=null,backgroundOverflow='';
const rotation=createRotation(()=>go(current+1));
function updatePlay(){
  const button=byId('catalog-play');
  button.disabled=reduce.matches||targets().length<2;
  button.textContent=reduce.matches?'자동 넘김 꺼짐':userPaused?'자동 넘김':'일시정지';
  button.setAttribute('aria-label',reduce.matches?'동작 줄이기 설정으로 자동 넘김 꺼짐':userPaused?'상품 자동 넘김 시작':'상품 자동 넘김 일시정지');
}
function pauseForUser(){userPaused=true;rotation.setPaused('user',true);updatePlay();}
function targets(){return carouselStops(slides.map(slide=>slide.offsetLeft),track.scrollWidth-track.clientWidth);}
function updatePosition(){
  const positions=targets();
  current=positions.reduce((best,x,i)=>Math.abs(x-track.scrollLeft)<Math.abs(positions[best]-track.scrollLeft)?i:best,0);
  byId('catalog-position').textContent=`${current+1} / ${positions.length} 보기`;
  byId('catalog-prev').disabled=byId('catalog-next').disabled=positions.length<2;
  rotation.setPaused('empty',positions.length<2);updatePlay();
}
function go(index,manual=false){
  if(!slides.length)return;
  const positions=targets();current=(index+positions.length)%positions.length;
  track.scrollTo({left:positions[current],behavior:reduce.matches?'instant':'smooth'});
  byId('catalog-position').textContent=`${current+1} / ${positions.length} 보기`;
  if(manual)pauseForUser();
}
byId('catalog-prev').addEventListener('click',()=>go(current-1,true));
byId('catalog-next').addEventListener('click',()=>go(current+1,true));
byId('catalog-play').addEventListener('click',()=>{userPaused=!userPaused;rotation.setPaused('user',userPaused);updatePlay();});
track.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(current+(event.key==='ArrowRight'?1:-1),true);}
});
track.addEventListener('pointerdown',pauseForUser,{passive:true});
track.addEventListener('wheel',pauseForUser,{passive:true});
track.addEventListener('scroll',()=>{
  clearTimeout(scrollTimer);
  scrollTimer=setTimeout(updatePosition,100);
},{passive:true});
track.addEventListener('focusin',()=>rotation.setPaused('focus',true));
track.addEventListener('focusout',event=>{if(!track.contains(event.relatedTarget))rotation.setPaused('focus',false);});
section.addEventListener('pointerenter',()=>{if(matchMedia('(hover: hover)').matches)rotation.setPaused('hover',true);});
section.addEventListener('pointerleave',()=>rotation.setPaused('hover',false));
document.addEventListener('visibilitychange',()=>rotation.setPaused('hidden',document.hidden));
const motionChanged=()=>{rotation.setPaused('reduced-motion',reduce.matches);updatePlay();};
reduce.addEventListener('change',motionChanged);motionChanged();
rotation.setPaused('hidden',document.hidden);rotation.setPaused('empty',slides.length<2);
if(slides.length<2){byId('catalog-prev').disabled=true;byId('catalog-next').disabled=true;}
const observer=new IntersectionObserver(entries=>rotation.setPaused('offscreen',!entries[0].isIntersecting),{threshold:0.15});observer.observe(track);
const showroomResize=new ResizeObserver(updatePosition);showroomResize.observe(track);updatePosition();

let filters={category:'all',brand:'all',query:''},page=1;
function updateCatalog(resetPage=true){
  if(resetPage)page=1;
  const filtered=filterProducts(products,filters),result=paginate(filtered,page);page=result.page;
  byId('catalog-grid').innerHTML=result.items.map(p=>renderProductCard(p)).join('');
  byId('catalog-results').textContent=`${filters.query?`“${filters.query}” 검색 · `:''}${result.total}개 제품`;
  byId('catalog-empty').hidden=result.total>0;
  byId('catalog-pagination').hidden=result.pages<2;
  byId('catalog-page-status').textContent=`${page} / ${result.pages}`;
  byId('catalog-page-prev').disabled=page<=1;
  byId('catalog-page-next').disabled=page>=result.pages;
  byId('catalog-search-clear').hidden=!filters.query;
  section.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===filters.category)));
  section.querySelectorAll('[data-brand]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brand===filters.brand)));
}
section.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{filters.category=b.dataset.category;updateCatalog();}));
section.querySelectorAll('[data-brand]').forEach(b=>b.addEventListener('click',()=>{filters.brand=b.dataset.brand;updateCatalog();}));
byId('catalog-search').addEventListener('input',event=>{if(event.isComposing)return;filters.query=event.target.value.slice(0,100);updateCatalog();});
byId('catalog-search').addEventListener('compositionend',event=>{filters.query=event.target.value.slice(0,100);updateCatalog();});
byId('catalog-search-clear').addEventListener('click',()=>{filters.query='';byId('catalog-search').value='';updateCatalog();byId('catalog-search').focus();});
byId('catalog-reset').addEventListener('click',()=>{filters={category:'all',brand:'all',query:''};byId('catalog-search').value='';updateCatalog();});
for(const [id,delta] of [['catalog-page-prev',-1],['catalog-page-next',1]])byId(id).addEventListener('click',()=>{page+=delta;updateCatalog(false);byId('catalog-browser').scrollIntoView({behavior:'instant',block:'start'});});
updateCatalog();

function loadVideo(button){
  const video=videos.find(v=>v.id===button.dataset.videoLoad);if(!video)return;
  const stage=button.closest('[data-video-stage]');if(!stage)return;
  const frame=document.createElement('iframe');frame.src=videoEmbedUrl(video.id);frame.title=video.title;
  frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='encrypted-media; picture-in-picture; web-share';frame.allowFullscreen=true;
  stage.replaceChildren(frame);frame.focus();
}
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-video-load]');if(button)loadVideo(button);});

function element(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
function showPhoto(index){
  if(!selected?.images?.length)return;
  photoIndex=(index+selected.images.length)%selected.images.length;
  const photo=selected.images[photoIndex],image=byId('product-main-image');
  image.src=photo.src;image.alt=photo.alt;
  byId('product-full-image').href=photo.src;
  byId('gallery-caption').textContent=`${photoIndex+1} / ${selected.images.length} · ${photo.caption}`;
  [...byId('product-thumbnails').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===photoIndex)));
}
function openProduct(id){
  const product=products.find(p=>p.id===id);if(!product)return;
  selected=product;
  byId('product-detail-title').textContent=product.name;
  byId('product-detail-type').textContent=`${product.brand} · ${product.type}`;
  byId('product-detail-description').textContent=product.description;
  byId('product-detail-installation').textContent=product.installation;
  byId('product-detail-source').href=product.source;
  byId('product-official-photos').href=product.source;
  byId('product-detail-source').textContent=product.sourceLabel||'제조사 제품 정보 확인 ↗';
  byId('product-verified').textContent=`자료 확인: ${product.verifiedAt} · 세부 옵션은 상담 시 확인해주세요.`;
  byId('product-detail-quote').dataset.product=product.name;
  byId('product-detail-price-chat').dataset.priceChat=product.id;byId('product-detail-price-chat').dataset.priceChatName=product.name;
  byId('product-detail-quote').setAttribute('aria-label',`${product.name} 제품으로 상담하기`);
  byId('product-detail-features').replaceChildren(...product.features.map(feature=>{const article=element('section');article.append(element('h3',feature.title),element('p',feature.text));return article;}));
  byId('product-detail-specs').replaceChildren(...product.specs.map(([label,value])=>{const row=element('div');row.append(element('dt',label),element('dd',value));return row;}));
  const hasPhotos=Boolean(product.images?.length);
  byId('product-art-detail').hidden=hasPhotos;
  byId('product-art-detail').innerHTML=hasPhotos?'':productArt(product);
  byId('product-full-image').hidden=!hasPhotos;
  byId('product-thumbnails').hidden=!hasPhotos;
  dialog.querySelector('.gallery-navigation').hidden=!hasPhotos||product.images.length<2;
  byId('product-image-credit').textContent=hasPhotos?[(product.imageCredit||'사용 허락을 받은 제품 이미지'),product.imageNotice].filter(Boolean).join(' · '):'실제 제품의 외관·색상은 아래 제조사 공식 페이지에서 확인해주세요.';
  byId('product-thumbnails').replaceChildren(...(product.images||[]).map((photo,i)=>{
    const button=element('button');button.type='button';button.setAttribute('aria-label',`${product.name} 사진 ${i+1}: ${photo.caption}`);
    const image=element('img');image.src=photo.src;image.alt='';image.width=100;image.height=100;image.loading='lazy';image.decoding='async';button.append(image);button.addEventListener('click',()=>showPhoto(i));return button;
  }));
  showPhoto(0);
  const video=videos.find(v=>v.products.includes(product.id)),videoArea=byId('product-detail-video');
  videoArea.replaceChildren();videoArea.hidden=!video;
  if(video){
    const title=element('h3',video.title),stage=element('div',null,'video-stage');stage.dataset.videoStage=video.id;
    const button=element('button',`▷ ${video.title} 재생`,'video-load');button.type='button';button.dataset.videoLoad=video.id;stage.append(button);
    const link=element('a','YouTube에서 보기 ↗');link.href=`https://www.youtube.com/watch?v=${video.id}`;link.target='_blank';link.rel='noopener noreferrer';
    videoArea.append(title,stage,element('p','재생 버튼을 누르면 YouTube 영상이 로드됩니다.'),link);
  }
  rotation.setPaused('dialog',true);
  backgroundOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.showModal();dialog.scrollTop=0;
}
section.addEventListener('click',event=>{const link=event.target.closest?.('[data-product-detail]');if(!link)return;event.preventDefault();openProduct(link.dataset.productDetail);});
byId('gallery-prev').addEventListener('click',()=>showPhoto(photoIndex-1));
byId('gallery-next').addEventListener('click',()=>showPhoto(photoIndex+1));
byId('product-detail-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
dialog.addEventListener('close',()=>{byId('product-detail-video').replaceChildren();document.body.style.overflow=backgroundOverflow;rotation.setPaused('dialog',false);});
window.addEventListener('pagehide',event=>{rotation.setPaused('page',true);if(!event.persisted){rotation.dispose();observer.disconnect();showroomResize.disconnect();clearTimeout(scrollTimer);}});
window.addEventListener('pageshow',()=>rotation.setPaused('page',false));
