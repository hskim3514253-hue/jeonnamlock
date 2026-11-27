/* Customer side of a consultation chat. The private key lives after "#" in the address and is only sent as a header. */
import { renderTalk, keepFresh } from './talk-view.js';
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const match = location.hash.match(/^#([a-f0-9-]{36})\.([a-f0-9]{64})$/i);
  const status = el('talk-status'), form = el('talk-form'), input = el('talk-input'), list = el('talk-list'), problem = el('talk-error');
  if (!match) { status.textContent = '채팅 주소가 올바르지 않습니다. 받은 주소를 다시 확인하거나 전화로 문의해주세요.'; return; }
  const [, id, key] = match;
  async function call(method, data) {
    const response = await fetch(`/api/talk/${id}`, { method, cache: 'no-store', headers: { 'X-Talk-Key': key.toLowerCase(), ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(result.error || '잠시 후 다시 시도해주세요.'); error.status = response.status; throw error; }
    return result;
  }
  let stop = null;
  async function load() {
    try {
      const result = await call('GET');
      el('talk-receipt').textContent = `${result.service} · 접수번호 ${result.receipt}`;
      status.hidden = true; form.hidden = false;
      renderTalk(list, result.messages, 'customer', '아직 대화가 없습니다. 궁금한 점을 남겨주시면 전남열쇠에서 확인하고 답변드립니다.');
    } catch (error) {
      if (error.status === 404) { stop?.(); form.hidden = true; list.replaceChildren(); status.hidden = false; status.textContent = error.message; }
      throw error;
    }
  }
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; input.style.overflowY = input.scrollHeight > 140 ? 'auto' : 'hidden'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(pointer:fine)').matches) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = input.value.trim(); if (!body) return;
    el('talk-send').disabled = true; problem.textContent = '';
    try { await call('POST', { body }); input.value = ''; grow(); list.dataset.seen = ''; await load(); }
    catch (error) { problem.textContent = error.message; }
    finally { el('talk-send').disabled = false; input.focus(); }
  });
  stop = keepFresh(load);
})();
