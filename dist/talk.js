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
  let stop = null, alerts = null, alertsBusy = false;
  const decodeKey = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
  const endpointId = async endpoint => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))), x => x.toString(16).padStart(2, '0')).join('');
  const remember = async on => { try { const cache = await caches.open('jn-talk-v1'); if (on) await cache.put('/__talk-target', new Response(`/talk#${id}.${key.toLowerCase()}`)); else await cache.delete('/__talk-target'); } catch { /* alerts then open the inbox page instead */ } };
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Shows whether this device will be told when the owner answers, and what the customer can do about it.
  async function showAlerts() {
    const box = el('talk-alerts'), button = el('talk-alert-button'), help = el('talk-alert-help');
    if (!alerts?.publicKey || alertsBusy) return;
    box.hidden = false;
    const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) { button.hidden = true; help.textContent = apple ? '아이폰은 이 화면을 홈 화면에 추가해야 답변 알림을 받을 수 있습니다. 어렵다면 이 주소를 저장해 두고 나중에 다시 열어 확인해주세요.' : '이 브라우저는 답변 알림을 지원하지 않습니다. 이 주소를 저장해 두고 나중에 다시 열어 확인해주세요.'; return; }
    if (Notification.permission === 'denied') { button.hidden = true; help.textContent = '이 브라우저에서 알림이 차단되어 있습니다. 브라우저의 사이트 설정에서 알림을 허용하면 답변 알림을 받을 수 있습니다.'; return; }
    let on = false;
    try { const registration = await navigator.serviceWorker.getRegistration('/'); const subscription = await registration?.pushManager.getSubscription(); on = Boolean(subscription && Notification.permission === 'granted' && alerts.devices.includes(await endpointId(subscription.endpoint))); } catch { /* treated as off */ }
    button.hidden = false; button.dataset.on = on ? '1' : ''; button.textContent = on ? '답변 알림 끄기' : '답변 알림 받기';
    help.textContent = on ? '답변이 오면 이 기기에 알림이 옵니다.' : '켜 두면 화면을 닫아도 답변이 올 때 알림을 받습니다. 무료입니다.';
  }
  el('talk-alert-button').addEventListener('click', async () => {
    const button = el('talk-alert-button'), help = el('talk-alert-help'); alertsBusy = true; button.disabled = true; problem.textContent = '';
    try {
      if (button.dataset.on) {
        const registration = await navigator.serviceWorker.getRegistration('/'); const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await pushCall('DELETE', subscription.endpoint);
        await remember(false); alerts.devices = [];
      } else {
        // The permission prompt must come straight from this tap.
        if (await Notification.requestPermission() !== 'granted') throw new Error('알림을 허용해야 답변 알림을 받을 수 있습니다.');
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(alerts.publicKey) });
        const saved = await pushCall('PUT', subscription.endpoint); await remember(true); alerts.devices = [...alerts.devices, saved.id];
      }
    } catch (error) { help.textContent = ''; problem.textContent = error.message || '알림을 설정하지 못했습니다.'; }
    finally { alertsBusy = false; button.disabled = false; await showAlerts(); }
  });
  async function pushCall(method, endpoint) {
    const response = await fetch(`/api/talk/${id}/push`, { method, cache: 'no-store', headers: { 'X-Talk-Key': key.toLowerCase(), 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || '알림을 설정하지 못했습니다.'); return result;
  }
  async function load() {
    try {
      const result = await call('GET');
      el('talk-receipt').textContent = `${result.service} · 접수번호 ${result.receipt}`;
      status.hidden = true; form.hidden = false;
      renderTalk(list, result.messages, 'customer', '아직 대화가 없습니다. 궁금한 점을 남겨주시면 전남열쇠에서 확인하고 답변드립니다.');
      if (!alertsBusy) { const first = !alerts; alerts = result.alerts || null; if (first) await showAlerts(); }
    } catch (error) {
      if (error.status === 404) { stop?.(); await remember(false); el('talk-alerts').hidden = true; form.hidden = true; list.replaceChildren(); status.hidden = false; status.textContent = error.message; }
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
