/* Price chat: a "가격문의" button opens a small chat that asks the server for this product's
   price. The conversation lives only in this page; nothing is stored on the server. */
(() => {
  'use strict';
  const FIRST_QUESTION = '이 제품 가격이 얼마인가요?';
  const MAX_TURNS = 12;
  let dialog = null, log, form, input, send, title, status;
  let productId = '', messages = [], busy = false, restoreOverflow = null;

  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };

  function build() {
    dialog = node('dialog', 'price-chat');
    dialog.setAttribute('aria-labelledby', 'price-chat-title');
    const top = node('div', 'price-chat-top');
    const heading = node('div');
    title = node('h2', null, '가격문의'); title.id = 'price-chat-title';
    heading.append(node('span', null, '가격 안내 채팅'), title);
    const close = node('button', 'price-chat-close', '닫기 ×'); close.type = 'button'; close.setAttribute('aria-label', '가격 안내 채팅 닫기');
    close.addEventListener('click', () => dialog.close());
    top.append(heading, close);

    log = node('div', 'price-chat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    status = node('p', 'price-chat-status'); status.hidden = true;

    form = node('form', 'price-chat-form');
    const label = node('label', 'sr-only', '질문 입력'); label.htmlFor = 'price-chat-input';
    input = node('input'); input.id = 'price-chat-input'; input.type = 'text'; input.maxLength = 500; input.autocomplete = 'off';
    input.placeholder = '예: 타공하면 얼마 추가되나요?';
    send = node('button', 'button', '보내기'); send.type = 'submit';
    form.append(label, input, send);
    form.addEventListener('submit', event => { event.preventDefault(); const text = input.value.trim(); if (text) { input.value = ''; ask(text); } });

    const foot = node('div', 'price-chat-foot');
    const call = node('a', null, '전화 상담 010-9284-5963'); call.href = 'tel:01092845963';
    foot.append(node('p', null, '최종 금액은 상담 후 확정됩니다. 질문 내용은 답변을 만들기 위해 AI 서비스로 전송되니 전화번호 같은 개인정보는 적지 마세요.'), call);

    dialog.append(top, log, status, form, foot);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { if (restoreOverflow !== null) { document.body.style.overflow = restoreOverflow; restoreOverflow = null; } });
    document.body.append(dialog);
  }

  function bubble(role, text) {
    const item = node('p', `price-chat-bubble is-${role}`, text);
    log.append(item); log.scrollTop = log.scrollHeight;
    return item;
  }
  function setBusy(value) {
    busy = value; send.disabled = value; input.disabled = value || messages.length >= MAX_TURNS - 1;
    status.hidden = !value; status.textContent = value ? '답변을 쓰는 중입니다…' : '';
    if (!value && !input.disabled) input.focus();
  }

  async function ask(text) {
    if (busy) return;
    bubble('user', text);
    messages.push({ role: 'user', content: text });
    setBusy(true);
    const asked = productId;
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, messages }) });
      const result = await response.json().catch(() => ({}));
      if (asked !== productId) return; // the customer moved on to another product
      if (!response.ok || !result.reply) throw new Error(result.error || '');
      messages.push({ role: 'assistant', content: result.reply });
      bubble('bot', result.reply);
    } catch (error) {
      if (asked !== productId) return;
      messages.pop();
      bubble('bot', error.message || '지금은 답변을 불러오지 못했습니다. 전화로 문의해주시면 바로 안내해드립니다.').classList.add('is-error');
    } finally {
      if (asked === productId) {
        setBusy(false);
        if (messages.length >= MAX_TURNS - 1) { input.placeholder = '더 궁금한 점은 전화로 문의해주세요.'; }
      }
    }
  }

  function open(id, name) {
    if (!dialog) build();
    productId = id; messages = []; busy = false;
    title.textContent = name || '가격문의';
    log.replaceChildren(); input.value = ''; input.placeholder = '예: 타공하면 얼마 추가되나요?';
    if (!dialog.open) {
      // Keep the page from scrolling behind the chat unless another dialog already locked it.
      if (document.body.style.overflow !== 'hidden') { restoreOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
      dialog.showModal();
    }
    ask(FIRST_QUESTION);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-price-chat]');
    if (!button || !button.dataset.priceChat) return;
    event.preventDefault();
    open(button.dataset.priceChat, button.dataset.priceChatName);
  });
})();
