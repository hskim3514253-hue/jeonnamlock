const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4000;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.WEDDING_DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.json');

fs.mkdirSync(UPLOADS, { recursive: true });

let db = { settings: { fee: 30000, adminToken: null }, planners: [], weddings: [], guests: [], entries: [], payouts: [] };
if (fs.existsSync(DB_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));

const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
if (/^[a-f0-9]{32,}$/.test(process.env.WEDDING_ADMIN_TOKEN || '')) db.settings.adminToken = process.env.WEDDING_ADMIN_TOKEN;
if (!db.settings.adminToken) db.settings.adminToken = rid();
save();
const ORIGIN = (process.env.WEDDING_ORIGIN || `http://localhost:${PORT}`).replace(/\/+$/, '');
fs.writeFileSync(path.join(DATA, 'admin-link.txt'), `${ORIGIN}/admin.html#t=${db.settings.adminToken}\n`);

const MAX = { weddings: 300, planners: 300, guests: 20000, entries: 50000, uploadBytes: 150 * 1024 * 1024 };
const full = (list, max) => { if (list.length >= max) bad(507, '지금은 더 받을 수 없습니다. 운영자에게 문의해 주세요.'); };
const uploadBytes = () => fs.readdirSync(UPLOADS).reduce((sum, name) => sum + fs.statSync(path.join(UPLOADS, name)).size, 0);

const hits = new Map();
function limit(req, key, max) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const k = key + ':' + ip;
  const t = Date.now();
  const list = (hits.get(k) || []).filter((x) => t - x < 3600000);
  if (list.length >= max) bad(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  list.push(t);
  hits.set(k, list);
}
setInterval(() => hits.clear(), 6 * 3600000).unref();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (status, message) => { throw new HttpError(status, message); };

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const side = (v) => (v === 'bride' ? 'bride' : 'groom');
const sideLabel = (s) => (s === 'bride' ? '신부' : '신랑');
const now = () => new Date().toISOString();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, '요청이 너무 큽니다')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, '잘못된 요청 형식입니다')); }
    });
    req.on('error', reject);
  });
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

function authWedding(req) {
  const t = bearer(req);
  if (t) {
    for (const w of db.weddings) {
      if (w.adminToken === t) return { w, role: 'admin' };
      if (w.deskToken === t) return { w, role: 'desk' };
    }
  }
  bad(401, '접근 권한이 없습니다. 링크를 다시 확인해 주세요.');
}

function touch(w) {
  w.v = (w.v || 0) + 1;
  save();
}

function kakaoLink(v) {
  const s = str(v, 200);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' && (u.hostname === 'kakaopay.com' || u.hostname.endsWith('.kakaopay.com'))) return u.toString();
  } catch {}
  bad(400, '카카오페이 링크는 https://qr.kakaopay.com/ 으로 시작하는 주소만 넣을 수 있습니다');
}

function plannerBrand(w) {
  const p = w.plannerId && db.planners.find((x) => x.id === w.plannerId);
  return p ? { company: p.company, name: p.name } : null;
}

function weddingForAdmin(w) {
  return {
    ...w,
    planner: plannerBrand(w),
    guests: db.guests.filter((g) => g.weddingId === w.id),
    entries: db.entries.filter((e) => e.weddingId === w.id),
  };
}

function weddingForDesk(w) {
  return {
    groom: w.groom, bride: w.bride, date: w.date, v: w.v || 0,
    guests: db.guests.filter((g) => g.weddingId === w.id)
      .map(({ id, name, side, count, attending, meal }) => ({ id, name, side, count, attending, meal })),
    entries: db.entries.filter((e) => e.weddingId === w.id),
  };
}

function weddingPublic(w) {
  return {
    groom: w.groom, bride: w.bride, date: w.date, time: w.time, venue: w.venue, address: w.address,
    greeting: w.greeting, groomParents: w.groomParents, brideParents: w.brideParents, photo: w.photo,
    accounts: w.showAccounts ? w.accounts : [],
    planner: plannerBrand(w), published: !!w.published,
  };
}

function plannerMonths(p) {
  const months = {};
  for (const w of db.weddings) {
    if (w.plannerId !== p.id || !w.publishedAt) continue;
    const m = w.publishedAt.slice(0, 7);
    months[m] = months[m] || { month: m, count: 0, amount: 0, paidAt: null };
    months[m].count += 1;
    months[m].amount += w.fee || 0;
  }
  for (const pay of db.payouts) {
    if (pay.plannerId === p.id && months[pay.month]) months[pay.month].paidAt = pay.paidAt;
  }
  return Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
}

function weddingStatus(w) {
  if (!w.published) return '가입';
  if (w.date && w.date < now().slice(0, 10)) return '예식 완료';
  return '청첩장 공개';
}

const WEDDING_TEXT = { groom: 20, bride: 20, venue: 60, address: 120, greeting: 1000, groomParents: 60, brideParents: 60, thanksTemplate: 500 };

function applyWedding(w, b) {
  for (const [k, max] of Object.entries(WEDDING_TEXT)) if (k in b) w[k] = str(b[k], max);
  if (!w.groom || !w.bride) bad(400, '신랑과 신부 이름은 비워둘 수 없습니다');
  if ('date' in b) {
    const d = str(b.date, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) bad(400, '예식일 형식이 올바르지 않습니다');
    w.date = d;
  }
  if ('time' in b) {
    const t = str(b.time, 5);
    if (t && !/^\d{2}:\d{2}$/.test(t)) bad(400, '예식 시간 형식이 올바르지 않습니다');
    w.time = t;
  }
  if ('showAccounts' in b) w.showAccounts = !!b.showAccounts;
  if (Array.isArray(b.accounts)) {
    w.accounts = b.accounts.slice(0, 6).map((a) => ({
      side: side(a.side),
      label: str(a.label, 20),
      bank: str(a.bank, 20),
      number: str(a.number, 30).replace(/[^0-9-]/g, ''),
      holder: str(a.holder, 20),
      kakaoLink: kakaoLink(a.kakaoLink),
    })).filter((a) => a.bank && a.number);
  }
  if ('published' in b) {
    w.published = !!b.published;
    if (w.published && !w.publishedAt) {
      w.publishedAt = now();
      w.fee = w.plannerId ? db.settings.fee : 0;
    }
  }
}

function applyEntry(e, b, role) {
  if ('guestName' in b) e.guestName = str(b.guestName, 30);
  if (!e.guestName) bad(400, '하객명을 입력해 주세요');
  if ('amount' in b) e.amount = int(b.amount, 0, 1000000000, null);
  if (e.amount === null || e.amount === undefined) bad(400, '금액을 확인해 주세요');
  if ('tickets' in b) e.tickets = int(b.tickets, 0, 99, 0);
  if ('memo' in b) e.memo = str(b.memo, 100);
  if ('guestId' in b) e.guestId = db.guests.some((g) => g.id === b.guestId && g.weddingId === e.weddingId) ? b.guestId : null;
  if (role === 'admin' && 'thanked' in b) {
    e.thanked = !!b.thanked;
    e.thankedAt = e.thanked ? now() : null;
  }
}

function applyGuest(g, b) {
  if ('name' in b) g.name = str(b.name, 30);
  if (!g.name) bad(400, '이름을 입력해 주세요');
  if ('side' in b) g.side = side(b.side);
  if ('group' in b) g.group = str(b.group, 20);
  if ('phone' in b) g.phone = str(b.phone, 20).replace(/[^0-9-]/g, '');
  if ('attending' in b) g.attending = ['yes', 'no'].includes(b.attending) ? b.attending : 'unknown';
  if ('count' in b) g.count = int(b.count, 1, 20, 1);
  if ('meal' in b) g.meal = !!b.meal;
  if ('message' in b) g.message = str(b.message, 300);
}

async function api(req, res, seg) {
  const m = req.method;
  const [a, b, c] = seg;

  if (a === 'ref' && m === 'GET') {
    const p = db.planners.find((x) => x.code === str(b, 10).toUpperCase());
    return p ? send(res, 200, { company: p.company, name: p.name }) : bad(404, '소개 코드를 찾을 수 없습니다');
  }

  if (a === 'planners' && m === 'POST') {
    limit(req, 'planner', 10);
    full(db.planners, MAX.planners);
    const body = await readBody(req);
    const p = {
      id: rid(8), token: rid(), code: rid(3).toUpperCase(),
      name: str(body.name, 20), company: str(body.company, 40), phone: str(body.phone, 20).replace(/[^0-9-]/g, ''),
      createdAt: now(),
    };
    if (!p.name || !p.company) bad(400, '이름과 업체명을 입력해 주세요');
    db.planners.push(p);
    save();
    return send(res, 201, { token: p.token });
  }

  if (a === 'planner' && m === 'GET') {
    const p = db.planners.find((x) => x.token === bearer(req)) || bad(401, '접근 권한이 없습니다');
    const couples = db.weddings.filter((w) => w.plannerId === p.id)
      .map((w) => ({ groom: w.groom, bride: w.bride, date: w.date, status: weddingStatus(w), fee: w.fee || 0, joinedAt: w.createdAt }))
      .sort((x, y) => (y.joinedAt || '').localeCompare(x.joinedAt || ''));
    return send(res, 200, { name: p.name, company: p.company, code: p.code, fee: db.settings.fee, couples, months: plannerMonths(p) });
  }

  if (a === 'weddings' && m === 'POST') {
    limit(req, 'wedding', 10);
    full(db.weddings, MAX.weddings);
    const body = await readBody(req);
    const planner = body.ref ? db.planners.find((x) => x.code === str(body.ref, 10).toUpperCase()) : null;
    const w = {
      id: rid(8), slug: rid(5), adminToken: rid(), deskToken: rid(), plannerId: planner ? planner.id : null,
      groom: '', bride: '', date: '', time: '', venue: '', address: '', greeting: '', groomParents: '', brideParents: '',
      photo: '', accounts: [], showAccounts: true, published: false, publishedAt: null, fee: 0,
      thanksTemplate: '{이름}님, 바쁘신 중에도 저희 결혼식에 함께해 주셔서 진심으로 감사드립니다. 보내주신 마음 잊지 않고 잘 살겠습니다.',
      seq: {}, v: 0, createdAt: now(),
    };
    applyWedding(w, { groom: body.groom, bride: body.bride, date: body.date || '' });
    db.weddings.push(w);
    save();
    return send(res, 201, { adminToken: w.adminToken });
  }

  if (a === 'i') {
    const w = db.weddings.find((x) => x.slug === b) || bad(404, '청첩장을 찾을 수 없습니다');
    if (!w.published && bearer(req) !== w.adminToken) bad(404, '아직 공개되지 않은 청첩장입니다');
    if (!c && m === 'GET') return send(res, 200, weddingPublic(w));
    if (c === 'rsvp' && m === 'POST') {
      if (!w.published) bad(403, '공개 전에는 참석 응답을 받을 수 없습니다');
      limit(req, 'rsvp', 30);
      full(db.guests, MAX.guests);
      const body = await readBody(req);
      const mine = db.guests.filter((g) => g.weddingId === w.id);
      if (mine.length >= 3000) bad(429, '응답을 더 받을 수 없습니다');
      const phone = str(body.phone, 20).replace(/[^0-9-]/g, '');
      const name = str(body.name, 30);
      let g = phone ? mine.find((x) => x.source === 'rsvp' && x.name === name && x.phone === phone) : null;
      if (!g) {
        g = { id: rid(8), weddingId: w.id, source: 'rsvp', group: '', createdAt: now() };
        db.guests.push(g);
      }
      applyGuest(g, { name, phone, side: body.side, attending: body.attending === 'no' ? 'no' : 'yes', count: body.count, meal: body.meal, message: body.message });
      touch(w);
      return send(res, 201, { ok: true });
    }
  }

  if (a === 'w') {
    const { w, role } = authWedding(req);
    const adminOnly = () => role === 'admin' || bad(403, '접수대 링크로는 할 수 없는 작업입니다');

    if (!b && m === 'GET') return send(res, 200, { role, wedding: role === 'admin' ? weddingForAdmin(w) : weddingForDesk(w) });
    if (b === 'v' && m === 'GET') return send(res, 200, { v: w.v || 0 });

    if (!b && m === 'PUT') {
      adminOnly();
      const draft = structuredClone(w);
      applyWedding(draft, await readBody(req));
      Object.assign(w, draft);
      touch(w);
      return send(res, 200, { ok: true });
    }

    if (b === 'photo' && m === 'POST') {
      adminOnly();
      limit(req, 'photo', 20);
      const body = await readBody(req);
      const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
      if (!match) bad(400, '사진 형식이 올바르지 않습니다');
      const buf = Buffer.from(match[1], 'base64');
      if (buf.length > 2.5 * 1024 * 1024) bad(413, '사진이 너무 큽니다');
      if (uploadBytes() + buf.length > MAX.uploadBytes) bad(507, '사진 저장 공간이 가득 찼습니다. 운영자에게 문의해 주세요.');
      const name = rid(12) + '.jpg';
      fs.writeFileSync(path.join(UPLOADS, name), buf);
      if (/^uploads\/[a-f0-9]+\.jpg$/.test(w.photo)) fs.rmSync(path.join(UPLOADS, path.basename(w.photo)), { force: true });
      w.photo = 'uploads/' + name;
      touch(w);
      return send(res, 200, { photo: w.photo });
    }

    if (b === 'guests') {
      adminOnly();
      if (!c && m === 'POST') {
        full(db.guests, MAX.guests);
        const g = { id: rid(8), weddingId: w.id, source: 'manual', side: 'groom', group: '', phone: '', attending: 'unknown', count: 1, meal: true, message: '', createdAt: now() };
        applyGuest(g, await readBody(req));
        db.guests.push(g);
        touch(w);
        return send(res, 201, g);
      }
      const g = db.guests.find((x) => x.id === c && x.weddingId === w.id) || bad(404, '하객을 찾을 수 없습니다');
      if (m === 'PUT') { applyGuest(g, await readBody(req)); touch(w); return send(res, 200, g); }
      if (m === 'DELETE') {
        db.guests = db.guests.filter((x) => x !== g);
        for (const e of db.entries) if (e.guestId === g.id) e.guestId = null;
        touch(w);
        return send(res, 200, { ok: true });
      }
    }

    if (b === 'entries') {
      if (!c && m === 'POST') {
        full(db.entries, MAX.entries);
        const body = await readBody(req);
        const s = side(body.side);
        const method = body.method === 'transfer' ? 'transfer' : 'cash';
        const e = { id: rid(8), weddingId: w.id, side: s, method, guestName: '', amount: 0, tickets: 0, memo: '', guestId: null, thanked: false, thankedAt: null, role, by: str(body.by, 20), createdAt: now() };
        applyEntry(e, body, role);
        const key = s + (method === 'transfer' ? 'T' : '');
        w.seq = w.seq || {};
        w.seq[key] = (w.seq[key] || 0) + 1;
        e.envelopeNumber = `${sideLabel(s)}-${method === 'transfer' ? '계좌' : ''}${String(w.seq[key]).padStart(3, '0')}`;
        db.entries.push(e);
        touch(w);
        return send(res, 201, e);
      }
      const e = db.entries.find((x) => x.id === c && x.weddingId === w.id) || bad(404, '접수 내역을 찾을 수 없습니다');
      if (role === 'desk' && e.role !== 'desk') bad(403, '접수대에서 입력한 내역만 고칠 수 있습니다');
      if (m === 'PUT') {
        const draft = { ...e };
        applyEntry(draft, await readBody(req), role);
        Object.assign(e, draft);
        touch(w);
        return send(res, 200, e);
      }
      if (m === 'DELETE') { db.entries = db.entries.filter((x) => x !== e); touch(w); return send(res, 200, { ok: true }); }
    }
  }

  if (a === 'admin') {
    if (bearer(req) !== db.settings.adminToken) bad(401, '운영자 권한이 없습니다');
    if (!b && m === 'GET') {
      return send(res, 200, {
        fee: db.settings.fee,
        planners: db.planners.map((p) => ({
          id: p.id, name: p.name, company: p.company, phone: p.phone, code: p.code,
          couples: db.weddings.filter((w) => w.plannerId === p.id).length,
          published: db.weddings.filter((w) => w.plannerId === p.id && w.publishedAt).length,
          months: plannerMonths(p),
        })),
        weddings: db.weddings.length,
        direct: db.weddings.filter((w) => !w.plannerId).length,
      });
    }
    if (b === 'settings' && m === 'PUT') {
      const body = await readBody(req);
      db.settings.fee = int(body.fee, 0, 10000000, db.settings.fee);
      save();
      return send(res, 200, { fee: db.settings.fee });
    }
    if (b === 'payouts' && m === 'POST') {
      const body = await readBody(req);
      const p = db.planners.find((x) => x.id === body.plannerId) || bad(404, '플래너를 찾을 수 없습니다');
      const month = plannerMonths(p).find((x) => x.month === body.month) || bad(404, '정산할 내역이 없습니다');
      if (!month.paidAt) {
        db.payouts.push({ plannerId: p.id, month: month.month, amount: month.amount, paidAt: now() });
        save();
      }
      return send(res, 200, { ok: true });
    }
  }

  bad(404, '없는 주소입니다');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('찾을 수 없습니다'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

function serveStatic(res, p) {
  if (/^\/uploads\/[a-f0-9]+\.jpg$/.test(p)) return serveFile(res, path.join(UPLOADS, path.basename(p)));
  const file = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); res.end(); return; }
  serveFile(res, file);
}

async function handle(req, res, pathname) {
  try {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (pathname.startsWith('/api/')) await api(req, res, pathname.split('/').slice(2).map(decodeURIComponent));
    else serveStatic(res, decodeURIComponent(pathname));
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else if (e instanceof URIError) send(res, 400, { error: '잘못된 주소입니다' });
    else {
      console.error('WEDDING_REQUEST_FAILED', e?.name || 'Error');
      if (!res.headersSent) send(res, 500, { error: '서버 오류가 발생했습니다' }); else res.end();
    }
  }
}

module.exports = { handle };

if (require.main === module) {
  http.createServer((req, res) => handle(req, res, new URL(req.url, 'http://localhost').pathname))
    .listen(PORT, () => console.log('웨딩 플랫폼 서버: http://localhost:' + PORT));
}
