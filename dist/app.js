/* Customer quote form: durable server receipt with separate, private photo uploads. */
(() => {
  'use strict';
  const form = document.querySelector('#quote-form');
  const next = document.querySelector('#next-step');
  const error = document.querySelector('#form-error');
  const dialog = document.querySelector('#success-dialog');
  const photos = { door: [], product: [] };
  const serviceNames = ['새 도어락 설치', '도어락 교체', '고장 · 잠김 상담'];
  let uploadsPending = 0;
  let photoId = 0;
  let sending = false;
  let selectedProduct = null;
  let attempt = null;
  const receipt = document.querySelector('#receipt-number');
  const uploadProgress = document.querySelector('#upload-progress');
  const byId = id => document.getElementById(id);
  const intentNames = { home: '우리 집 도어락 상담', repair: '고장 · 교체 상담', business: '업체 · 다량 설치 견적' };
  const inquiryType = () => byId('inquiry-type').value || 'home';
  function updateIntent() {
    const business = inquiryType() === 'business';
    byId('business-fields').hidden = !business;
    byId('business-fields').querySelectorAll('input,select').forEach(input => input.disabled = !business || Boolean(attempt));
    byId('form-heading').textContent = intentNames[inquiryType()] || intentNames.home;
    if (!attempt) next.querySelector('span').textContent = business ? '업체 견적 문의하기' : '상담 요청하기';
  }
  byId('inquiry-type').addEventListener('change', updateIntent);
  document.querySelectorAll('[data-intent]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('#quote').scrollIntoView({ block: 'start', behavior: 'instant' });
    if (sending || attempt) return fail('현재 문의 접수를 완료해주세요.');
    byId('inquiry-type').value = link.dataset.intent;
    showForm(false);
    document.querySelector('.form-card').scrollIntoView({ block: 'start', behavior: 'instant' });
    byId('district').focus({ preventScroll: true });
  }));
  const catalogProducts = JSON.parse(byId('catalog-data').textContent);
  function showSelectedProduct() {
    byId('selected-product').hidden = !selectedProduct;
    byId('selected-product-name').textContent = selectedProduct?.name || '';
    byId('selected-product-brand').textContent = selectedProduct?.brand || '';
    const image = byId('selected-product-image');
    image.hidden = !selectedProduct?.images?.[0]?.src;
    if (!image.hidden) { image.src = '/' + selectedProduct.images[0].src; image.alt = selectedProduct.name; }
    else image.removeAttribute('src');
  }
  byId('clear-selected-product').addEventListener('click', () => {
    if (sending || attempt) return;
    selectedProduct = null;
    byId('desired-product').value = byId('desired-product').value.replace(/^\[문의 제품: [^\]\r\n]+\]\n?/, '');
    showSelectedProduct();
  });
  showSelectedProduct();
  function clearError() {
    error.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach(input => {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    });
  }
  function fail(message, input) {
    error.textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'form-error');
      input.focus();
    }
    return false;
  }
  function summary(target) {
    const title = document.createElement('strong');
    title.textContent = `${byId('district').value.trim()} · ${intentNames[inquiryType()]}`;
    const product = document.createElement('div');
    product.textContent = byId('desired-product').value.trim() || '원하는 제품은 상담 후 결정';
    const counts = document.createElement('div');
    counts.textContent = `문 사진 ${photos.door.length}장${photos.product.length ? ` · 제품 사진 ${photos.product.length}장` : ''}`;
    target.replaceChildren(title, product, counts);
  }
  function showForm(focus = true) {
    clearError();
    updateIntent();
    if (focus) byId('district').focus();
  }
  function startQuote(service) {
    if (sending || attempt) return { blocked: true, message: '현재 문의 접수를 완료해주세요.' };
    if (!serviceNames.includes(service)) throw new Error('지원하지 않는 서비스입니다.');
    byId('inquiry-type').value = service === '고장 · 잠김 상담' ? 'repair' : 'home';
    if (dialog.open) dialog.close();
    showForm(false);
    document.querySelector('#quote').scrollIntoView({ block: 'start', behavior: 'instant' });
    return { form: '사진 견적 문의', service, submitted: false };
  }
  document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
    startQuote(link.dataset.service);
  }));
  document.querySelectorAll('[data-product]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const productDialog = document.querySelector('#product-dialog');
    if (productDialog?.open) productDialog.close();
    document.querySelector('#quote').scrollIntoView({ block: 'start', behavior: 'instant' });
    if (sending || attempt) return fail('현재 문의 접수를 완료한 뒤 새 제품을 선택해주세요.');
    const product = link.dataset.product;
    const available = [...document.querySelectorAll('[data-catalog-name]')].map(card => card.dataset.catalogName);
    if (!available.includes(product)) return;
    const input = byId('desired-product');
    const notes = input.value.replace(/^\[문의 제품: [^\]\r\n]+\]\n?/, '');
    const value = `[문의 제품: ${product}]${notes ? `\n${notes}` : ''}`;
    if (value.length > 1000) return fail('원하는 제품 내용은 1000자까지 입력할 수 있어요. 내용을 조금 줄인 뒤 제품을 다시 선택해주세요.', input);
    showForm(false);
    input.value = value;
    selectedProduct = catalogProducts.find(item => item.name === product) || null;
    showSelectedProduct();
    document.querySelector('.form-card').scrollIntoView({ block: 'start', behavior: 'instant' });
    byId('district').focus({ preventScroll: true });
  }));
  form.addEventListener('input', clearError);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearError();
    if (sending) return;
    if (attempt?.complete) return dialog.showModal();
    if (uploadsPending) return fail('사진을 확인하고 있어요. 잠시 후 다시 눌러주세요.');
    if (!byId('district').value.trim()) return fail('설치할 동네를 입력해주세요.', byId('district'));
    const phone = byId('customer-phone');
    const digits = phone.value.replace(/[\s-]/g, '');
    if (!/^0(?:1[016789]\d{7,8}|2\d{7,8}|[3-6]\d{8,9}|70\d{8})$/.test(digits)) return fail('연락처를 다시 확인해주세요. 예: 010-1234-5678', phone);
    const business = inquiryType() === 'business';
    const quantity = byId('quantity').value.trim();
    if (business && quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 100000)) return fail('설치 수량은 1~100000 사이의 정수로 입력해주세요.', byId('quantity'));
    const date = byId('preferred-date').value;
    if (business && date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) return fail('희망 일정을 확인해주세요.', byId('preferred-date'));
    if (!byId('privacy-consent').checked) return fail('개인정보 수집·이용에 동의해주세요.', byId('privacy-consent'));
    if (!attempt) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
      attempt = { requestKey: crypto.randomUUID(), token, done: new Set(), id: null, complete: false,
        files: Object.entries(photos).flatMap(([kind,list]) => list.map((photo,index)=>({slot:`${kind}-${index}`,file:photo.file}))) };
    }
    sending = true;
    form.setAttribute('aria-busy','true');
    form.querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=true);
    next.querySelector('span').textContent = '문의 내용 저장 중…';
    try {
      const saved = await request('/api/quotes', { method: 'POST', json: {
        requestKey:attempt.requestKey,uploadToken:attempt.token,
        district:byId('district').value.trim(),phone:digits,desiredProduct:byId('desired-product').value.trim(),
        inquiryType:inquiryType(),
        ...(selectedProduct ? {selectedProductId:selectedProduct.id} : {}),
        ...(business ? {companyName:byId('company-name').value.trim(),businessType:byId('business-type').value,quantity:quantity ? String(Number(quantity)) : '',preferredDate:date} : {}),
        website:byId('website').value,consent:true,consentVersion:'2026-10-27-v3'
      }});
      attempt.id = saved.id;
      let result = saved;
      if (saved.status === 'draft') {
        for (const item of attempt.files) {
          if (attempt.done.has(item.slot)) continue;
          uploadProgress.textContent = `사진 전송 중 ${attempt.done.size + 1} / ${attempt.files.length}장`;
          next.querySelector('span').textContent = '사진 전송 중…';
          await request(`/api/quotes/${saved.id}/photos/${item.slot}`,{ method:'PUT',body:item.file,headers:{'Content-Type':item.file.type,'X-Quote-Token':attempt.token} });
          attempt.done.add(item.slot);
        }
        next.querySelector('span').textContent = '접수 확인 중…';
        result = await request(`/api/quotes/${saved.id}/submit`,{method:'POST',json:{slots:attempt.files.map(item=>item.slot)},headers:{'X-Quote-Token':attempt.token}});
      }
      attempt.complete = true;
      summary(byId('success-summary'));
      receipt.textContent = `접수번호 ${result.receipt}`;
      const talk = typeof result.talk === 'string' && /^\/talk#[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(result.talk) ? result.talk : '';
      byId('open-talk').hidden = byId('open-talk-help').hidden = !talk;
      if (talk) byId('open-talk').href = talk;
      uploadProgress.textContent = '문의가 정상적으로 접수되었습니다.';
      next.querySelector('span').textContent = '접수 완료 확인';
      dialog.showModal();
    } catch (error) {
      attempt.done.clear();
      fail(`${error.message} 입력 내용과 사진은 유지됩니다. 같은 내용으로 다시 시도해주세요.`);
      next.querySelector('span').textContent = '같은 문의 다시 접수하기';
      uploadProgress.textContent = '';
    } finally { sending = false; next.disabled = false; form.removeAttribute('aria-busy'); }
  });
  async function request(url, options) {
    const headers = {...options.headers};
    if (options.json) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await fetch(url,{method:options.method,headers,body:options.json?JSON.stringify(options.json):options.body,credentials:'same-origin',signal:AbortSignal.timeout(90000)}); }
    catch { throw new Error('연결이 끊겼거나 전송 시간이 초과되었습니다.'); }
    let result; try {result=await response.json();}catch {throw new Error('서버 응답을 확인할 수 없습니다.');}
    if (!response.ok) throw new Error(result.error || '문의 접수에 실패했습니다.');
    return result;
  }
  function releasePhotos() {
    Object.values(photos).forEach(list => {
      list.forEach(photo => URL.revokeObjectURL(photo.url));
      list.length = 0;
    });
  }
  function renderPhotos(kind) {
    const target = byId(`${kind}-previews`);
    target.replaceChildren();
    for (const photo of photos[kind]) {
      const item = document.createElement('div');
      item.className = 'photo-item';
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = `${kind === 'door' ? '문' : '제품'} 사진: ${photo.file.name}`;
      const label = document.createElement('p');
      label.textContent = photo.file.name;
      label.title = photo.file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${photo.file.name} 삭제`);
      remove.addEventListener('click', () => {
        if (sending || attempt) return;
        URL.revokeObjectURL(photo.url);
        photos[kind] = photos[kind].filter(entry => entry.id !== photo.id);
        renderPhotos(kind);
        byId(`${kind}-photos`).focus();
      });
      item.append(img, remove, label);
      target.append(item);
    }
  }
  async function addPhotos(kind, files) {
    if (sending || attempt) return;
    clearError();
    const problems = [];
    uploadsPending += 1;
    next.disabled = true;
    try {
      for (const file of Array.from(files)) {
        if (photos[kind].length >= 5) { problems.push('사진은 항목별 최대 5장까지 첨부할 수 있어요.'); break; }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { problems.push('JPG, PNG, WEBP 이미지 파일만 첨부할 수 있어요.'); continue; }
        if (file.size > 10 * 1024 * 1024) { problems.push('10MB보다 큰 사진은 크기를 줄여 다시 첨부해주세요.'); continue; }
        if (photos[kind].some(photo => photo.file.name === file.name && photo.file.size === file.size && photo.file.lastModified === file.lastModified)) { problems.push('같은 사진이 이미 첨부되어 있어요.'); continue; }
        const url = URL.createObjectURL(file);
        const probe = new Image();
        probe.src = url;
        try { await probe.decode(); }
        catch { URL.revokeObjectURL(url); problems.push('열 수 없는 이미지가 있어요. 다른 사진을 선택해주세요.'); continue; }
        if (photos[kind].length >= 5) { URL.revokeObjectURL(url); problems.push('사진은 항목별 최대 5장까지 첨부할 수 있어요.'); break; }
        photos[kind].push({ id: ++photoId, file, url });
      }
      renderPhotos(kind);
      if (problems.length) fail([...new Set(problems)].join(' '));
    } finally {
      uploadsPending -= 1;
      next.disabled = uploadsPending > 0;
    }
  }
  for (const kind of ['door', 'product']) {
    const input = byId(`${kind}-photos`);
    const zone = document.querySelector(`[data-upload="${kind}"]`);
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      void addPhotos(kind, files);
    });
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', event => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('dragover'); });
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragover'); void addPhotos(kind, event.dataTransfer.files); });
  }
  document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  byId('start-over').addEventListener('click', () => {
    dialog.close();
    form.reset();
    attempt = null;
    selectedProduct = null;
    showSelectedProduct();
    form.querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=false);
    uploadProgress.textContent = '';
    releasePhotos();
    renderPhotos('door');
    renderPhotos('product');
    showForm();
  });
  // A single optional browser tool opens the same visible consultation flow.
  const lifecycle = new AbortController();
  if (document.modelContext?.registerTool) {
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'start_quote',
        title: '견적 문의 작성 시작',
        description: '간단한 사진 견적 문의 양식을 엽니다. 문의를 실제로 전송하는 동작은 포함하지 않습니다.',
        inputSchema: { type: 'object', properties: { service: { type: 'string', enum: serviceNames } }, required: ['service'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'service') || typeof input.service !== 'string') throw new Error('서비스 하나를 선택해주세요.');
          return startQuote(input.service);
        }
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Standard form controls remain available. */ }
  }
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { lifecycle.abort(); releasePhotos(); }
  });
  updateIntent();
})();
