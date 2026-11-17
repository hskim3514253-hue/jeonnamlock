/* First-party display counts only. This module never reads or waits on the quote form. */
(() => {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return;
  let pending = true;
  async function send(eventId, retry = true) {
    try {
      const response = await fetch('/api/analytics/pageview', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({eventId})
      });
      if (response.status >= 500 && retry) setTimeout(() => send(eventId, false), 1500);
    } catch {
      if (retry) setTimeout(() => send(eventId, false), 1500);
    }
  }
  function collect() {
    if (!pending || document.visibilityState !== 'visible') return;
    pending = false;
    try { void send(crypto.randomUUID()); } catch { /* Unsupported browser: quotes still work. */ }
  }
  document.addEventListener('visibilitychange', collect);
  window.addEventListener('pageshow', event => { if (event.persisted) pending = true; collect(); });
  collect();
})();
