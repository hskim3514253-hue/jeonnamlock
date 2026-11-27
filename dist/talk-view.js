// Shared by the customer chat page and the owner's inbox: draws a conversation and keeps it fresh.
const time = value => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(value));

// `mine` is the sender shown on the right: 'customer' on the customer page, 'owner' in the inbox.
export function renderTalk(list, messages, mine, emptyText) {
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const known = list.dataset.count === String(messages.length) && list.dataset.last === (messages.at(-1)?.id || '');
  if (known) return false;
  list.replaceChildren();
  if (!messages.length) { const empty = document.createElement('p'); empty.className = 'talk-empty'; empty.textContent = emptyText; list.append(empty); }
  for (const message of messages) {
    const item = document.createElement('div'); item.className = `talk-message ${message.from === mine ? 'is-mine' : 'is-theirs'}`;
    const who = document.createElement('small'); who.textContent = `${message.from === 'owner' ? '전남열쇠' : '손님'} · ${time(message.at)}`;
    const body = document.createElement('p'); body.textContent = message.body;
    item.append(body, who); list.append(item);
  }
  list.dataset.count = String(messages.length); list.dataset.last = messages.at(-1)?.id || '';
  if (atBottom || !list.dataset.seen) list.scrollTop = list.scrollHeight;
  list.dataset.seen = '1';
  return true;
}

// Calls `load` now and every few seconds while the page is visible. Returns a function that stops it.
export function keepFresh(load, everyMs = 5000) {
  let stopped = false, timer = 0, running = false;
  const tick = async () => {
    if (stopped) return;
    if (!document.hidden && !running) { running = true; try { await load(); } catch { /* shown by the caller on the next manual action */ } finally { running = false; } }
    timer = setTimeout(tick, everyMs);
  };
  const wake = () => { if (!document.hidden && !stopped) { clearTimeout(timer); tick(); } };
  document.addEventListener('visibilitychange', wake);
  tick();
  return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
}
