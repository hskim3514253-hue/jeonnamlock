// One indexable page per catalog product (/products/<id>), plus the sitemap that lists them.
// Pages are built from the catalog when the server starts, so they never drift from it.
import { priceAnswer, SHOP_PHONE } from '../src/prices.mjs';

const ORIGIN = 'https://jeonnamlock.com';
const TEL = SHOP_PHONE.replace(/\D/g, '');
const e = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ld = object => `<script type="application/ld+json">${JSON.stringify(object).replace(/</g, '\\u003c')}</script>`;

export const productPath = product => `/products/${product.id}`;

export function renderProductPage(product, products) {
  const url = ORIGIN + productPath(product);
  const title = `${product.name} 설치 · 가격문의 | 광주 전남열쇠`;
  const summary = `${product.name}(${product.type}) 광주·전남 설치 상담. ${product.tagline} 설치비 포함 가격은 전화 ${SHOP_PHONE} 또는 가격문의로 안내합니다.`;
  const images = product.images || [];
  const cover = images[0] ? `${ORIGIN}/${images[0].src}` : `${ORIGIN}/og-image.jpg`;
  const siblings = products.filter(other => other.brandKey === product.brandKey && other.id !== product.id);
  const sameKind = products.filter(other => other.category === product.category && other.brandKey !== product.brandKey).slice(0, 6);
  const link = other => `<li><a href="${productPath(other)}">${e(other.name)}<span>${e(other.type)}</span></a></li>`;
  const data = [
    { '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product', name: product.name, description: product.description, category: product.type,
      brand: { '@type': 'Brand', name: product.brand }, model: product.model, url, ...(images.length ? { image: images.map(image => `${ORIGIN}/${image.src}`) } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '전남열쇠', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: '도어락 제품', item: ORIGIN + '/#products' },
      { '@type': 'ListItem', position: 3, name: product.name, item: url }] }
  ];
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)}</title>
  <meta name="description" content="${e(summary)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="product"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="전남열쇠">
  <meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(summary)}">
  <meta property="og:url" content="${url}"><meta property="og:image" content="${cover}">
  ${data.map(ld).join('\n  ')}
  <meta name="theme-color" content="#111111">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/redesign.css"><link rel="stylesheet" href="/conversion.css"><link rel="stylesheet" href="/product-page.css">
  <script src="/analytics.js" defer></script>
</head>
<body class="customer-page product-page">
<svg class="svg-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c0 3-2 4-4 4C9 20 4 15 3 7c0-2 1-4 4-4Z"/></symbol>
</defs></svg>
<a href="#main" class="skip-link">본문 바로가기</a>
<header class="header"><div class="container nav-row"><a class="brand" href="/" aria-label="전남열쇠 홈"><span>전남열쇠<span class="brand-sub">광주 도어락 설치 · 교체</span></span></a><nav aria-label="주 메뉴"><a href="/#products">제품 보기</a><a href="/#prices">설치 가격</a><a href="/#business">업체 · 다량 설치</a><a href="/#quote">상담 문의</a><a href="/#contact">매장 안내</a></nav><a class="header-phone" href="tel:${TEL}"><svg><use href="#i-phone"/></svg><span>${SHOP_PHONE}</span></a></div></header>
<main id="main" class="container product-main">
  <nav class="product-crumbs" aria-label="현재 위치"><a href="/">전남열쇠</a><span aria-hidden="true">/</span><a href="/#products">도어락 제품</a><span aria-hidden="true">/</span><span>${e(product.brand)}</span></nav>
  <div class="product-top">
    <div class="product-photos">${images.length ? images.map((image, index) => `<figure><img src="/${e(image.src)}" width="${image.width || 900}" height="${image.height || 900}" alt="${e(image.alt || product.name)}"${index ? ' loading="lazy"' : ''}>${image.caption ? `<figcaption>${e(image.caption)}</figcaption>` : ''}</figure>`).join('') : ''}</div>
    <div class="product-summary">
      <p class="product-kind">${e(product.brand)} · ${e(product.type)}</p>
      <h1>${e(product.name)}</h1>
      <p class="product-tagline">${e(product.tagline)}</p>
      <p class="product-description">${e(product.description)}</p>
      ${product.tags?.length ? `<ul class="product-tags">${product.tags.map(tag => `<li>${e(tag)}</li>`).join('')}</ul>` : ''}
      <section class="product-price" aria-labelledby="price-title"><h2 id="price-title">설치 가격</h2><p>${e(priceAnswer(product))}</p></section>
      <div class="product-actions"><a href="tel:${TEL}" class="button">전화 상담 ${SHOP_PHONE}</a><a href="/#quote" class="button secondary">온라인 상담 남기기</a></div>
      <p class="product-area">광주 북구·광산구·서구·남구·동구에서 설치합니다. 담양·장성 등 인근 전남 지역은 전화로 일정을 확인해 드립니다.</p>
    </div>
  </div>
  <section class="product-block" aria-labelledby="features-title"><h2 id="features-title">주요 기능</h2><dl class="product-features">${product.features.map(feature => `<div><dt>${e(feature.title)}</dt><dd>${e(feature.text)}</dd></div>`).join('')}</dl></section>
  <section class="product-block" aria-labelledby="specs-title"><h2 id="specs-title">제품 정보</h2><table class="product-specs"><tbody>${product.specs.map(([name, value]) => `<tr><th scope="row">${e(name)}</th><td>${e(value)}</td></tr>`).join('')}</tbody></table>
    <p class="product-source">${product.installation ? e(product.installation) + ' ' : ''}자료 출처: <a href="${e(product.source)}" target="_blank" rel="noopener noreferrer nofollow">${e(product.sourceLabel || '제품 정보')}</a>${product.verifiedAt ? ` (${e(product.verifiedAt)} 확인)` : ''}. 사진의 색상과 구성품은 실제와 다를 수 있습니다.</p></section>
  ${siblings.length ? `<section class="product-block" aria-labelledby="siblings-title"><h2 id="siblings-title">${e(product.brand)}의 다른 모델</h2><ul class="product-links">${siblings.map(link).join('')}</ul></section>` : ''}
  ${sameKind.length ? `<section class="product-block" aria-labelledby="kind-title"><h2 id="kind-title">같은 종류의 다른 브랜드</h2><ul class="product-links">${sameKind.map(link).join('')}</ul></section>` : ''}
  <p class="product-back"><a href="/#products">전체 ${products.length}개 도어락 보기</a></p>
</main>
<footer><div class="container footer-row"><a class="brand" href="/"><span>전남열쇠</span></a><p>일상의 시작과 끝, 안심을 지키다.</p><span>© 2026 JEONNAM LOCK</span></div><div class="container footer-note"><a href="/privacy.html">개인정보 처리 안내</a> · 긴급 문의는 전화로 연락해주세요.</div></footer>
<div class="mobile-bar"><a href="tel:${TEL}"><svg><use href="#i-phone"/></svg>전화 상담</a><a class="button" href="/#quote">상담 남기기 <svg><use href="#i-arrow"/></svg></a></div>
</body>
</html>
`;
}

export function productPages(products) {
  return new Map(products.map(product => [productPath(product), renderProductPage(product, products)]));
}

export function renderSitemap(products, lastmod) {
  const entry = location => `  <url>\n    <loc>${location}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[ORIGIN + '/', ...products.map(product => ORIGIN + productPath(product))].map(entry).join('\n')}\n</urlset>\n`;
}

// Crawlable list of every model for the homepage, grouped by brand.
export function renderModelIndex(products) {
  const brands = [...new Map(products.map(product => [product.brandKey, product.brand])).entries()];
  return `<details class="model-index"><summary>전체 ${products.length}개 모델 목록</summary>${brands.map(([key, brand]) => `<div><h4>${e(brand)}</h4><ul>${products.filter(product => product.brandKey === key).map(product => `<li><a href="${productPath(product)}">${e(product.name)}</a></li>`).join('')}</ul></div>`).join('')}</details>`;
}
