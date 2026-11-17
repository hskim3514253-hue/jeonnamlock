/* Admin sign-in page: posts the password to the server, which answers with an HttpOnly cookie. */
(() => {
  'use strict';
  const form = document.getElementById('login-form'), input = document.getElementById('login-password');
  const submit = document.getElementById('login-submit'), error = document.getElementById('login-error');
  const say = message => { error.textContent = message; error.hidden = !message; };
  async function post(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '잠시 후 다시 시도해주세요.');
    return result;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    say(''); submit.disabled = true;
    try { await post('/api/login', { password: input.value }); location.replace('/admin'); }
    catch (problem) { say(problem.message); input.select(); submit.disabled = false; }
  });
  document.getElementById('logout').addEventListener('click', async () => {
    try { await post('/api/logout'); say('이 기기에서 로그아웃했습니다.'); } catch (problem) { say(problem.message); }
  });
  input.focus();
})();
