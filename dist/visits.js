/* Counts which kind of site a visit came from and which page was opened. Totals only:
   the referring address itself is never sent, just one of a few categories. */
(() => {
  const path = location.pathname;
  const page = path === '/' || path === '/index.html' ? 'home' : path.startsWith('/products/') ? 'product:' + path.slice(10) : '';
  if (!page) return;
  function source() {
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
    if (!host) return 'direct';
    if (host === location.hostname) return 'internal';
    const has = (...names) => names.some(name => host === name || host.endsWith('.' + name));
    if (has('chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'copilot.microsoft.com') || host === 'gemini.google.com') return 'ai';
    if (has('naver.com', 'naver.me')) return 'naver';
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
    if (has('daangn.com', 'karrotmarket.com')) return 'daangn';
    if (has('kakao.com', 'daum.net')) return 'kakao';
    if (has('bing.com')) return 'bing';
    if (has('instagram.com', 'facebook.com', 'youtube.com', 'threads.net')) return 'social';
    return 'other';
  }
  let pending = true;
  function send() {
    if (!pending || document.visibilityState !== 'visible') return;
    pending = false;
    try {
      fetch('/api/visit', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: source(), page }) }).catch(() => {});
    } catch { /* Counting never gets in the way of the page. */ }
  }
  document.addEventListener('visibilitychange', send);
  send();
})();
