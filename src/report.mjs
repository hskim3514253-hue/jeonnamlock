// Coarse visit counters and the owner's summary report (Node host only).
// Counters hold totals per day: which kind of site a visit came from and which page was opened.
// Nothing here identifies a visitor: no address, cookie, user agent or full referrer is stored.
import { analyticsBucket } from './analytics.mjs';

export const SOURCES = ['direct', 'internal', 'naver', 'google', 'daangn', 'ai', 'kakao', 'bing', 'social', 'other'];
const DAY = 86400000;
const all = async (DB, sql, ...args) => (await DB.prepare(sql).bind(...args).all()).results;

export async function ensureVisitTable(DB) {
  await DB.prepare('CREATE TABLE IF NOT EXISTS visit_counts (day TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, name))').bind().run();
}

// Returns the cleaned visit, or null when the body is not one this site's pages send.
export function validVisit(body, productIds) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { source, page } = body;
  if (!SOURCES.includes(source) || typeof page !== 'string') return null;
  if (page === 'home') return { source, page };
  const id = page.startsWith('product:') ? page.slice(8) : '';
  return productIds.has(id) ? { source, page } : null;
}

export async function recordVisit(DB, nowMs, visit) {
  const day = analyticsBucket(nowMs).date;
  const add = 'INSERT INTO visit_counts (day, kind, name, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, name) DO UPDATE SET count = count + 1';
  await DB.batch([DB.prepare(add).bind(day, 'source', visit.source), DB.prepare(add).bind(day, 'page', visit.page)]);
}

export async function readReport(DB, days, nowMs) {
  const span = Math.min(90, Math.max(1, Math.floor(Number(days)) || 7));
  const dates = Array.from({ length: span }, (_, i) => analyticsBucket(nowMs - (span - 1 - i) * DAY).date);
  const [from, to] = [dates[0], dates.at(-1)];
  const homepage = await all(DB, 'SELECT day, COUNT(*) pageviews, COUNT(DISTINCT visitor_key) visitors FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY day', from, to);
  const counts = await all(DB, 'SELECT day, kind, name, count FROM visit_counts WHERE day BETWEEN ? AND ?', from, to);
  const startMs = Date.parse(from + 'T00:00:00+09:00'), endMs = Date.parse(to + 'T00:00:00+09:00') + DAY;
  const inquiries = await all(DB, "SELECT submitted_at FROM inquiries WHERE submitted_at >= ? AND submitted_at < ? AND status != 'draft'", startMs, endMs);
  const total = kind => Object.entries(counts.filter(row => row.kind === kind).reduce((sum, row) => ({ ...sum, [row.name]: (sum[row.name] || 0) + Number(row.count) }), {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return {
    from, to, timeZone: 'Asia/Seoul',
    days: dates.map(date => {
      const row = homepage.find(item => item.day === date);
      return {
        date, homepageVisitors: Number(row?.visitors || 0), homepageViews: Number(row?.pageviews || 0),
        pageOpens: counts.filter(item => item.day === date && item.kind === 'page').reduce((sum, item) => sum + Number(item.count), 0),
        inquiries: inquiries.filter(item => analyticsBucket(Number(item.submitted_at)).date === date).length
      };
    }),
    sources: total('source'),
    pages: total('page').slice(0, 20),
    inquiries: inquiries.length,
    notes: ['homepageVisitors counts distinct browsers on the homepage per day', 'pageOpens, sources and pages are plain counts started 2026-11-24', 'phone calls are not measured']
  };
}

// Constant-time comparison of the report key sent as "Authorization: Bearer <key>".
export async function reportAllowed(request, token) {
  if (!token || token.length < 24) return false;
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([digest(given), digest(token)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
