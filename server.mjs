// Production server for a Node host (Render). The same request handler as the Cloudflare Worker
// build runs here on top of SQLite and a photo folder kept on the host's persistent disk.
//   DATA_DIR        folder on the persistent disk (database, photos, push keys)
//   SITE_ORIGIN     the address visitors use; defaults to the host's own address
//   ADMIN_PASSWORD, SESSION_SECRET, RATE_LIMIT_SALT, CONFIG_ENCRYPTION_KEY   secrets set on the host
import { generateCatalog, products } from './scripts/catalog.mjs';
import { publicFiles } from './scripts/public-files.mjs';
import { productPages, renderSitemap } from './scripts/product-pages.mjs';
import { ensureVisitTable, validVisit, recordVisit, readReport, reportAllowed } from './src/report.mjs';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from './src/worker.mjs';
import { createLocalEnvironment } from './scripts/local-adapters.mjs';
import { passwordIdentity, passwordLogin, passwordLogout, passwordLoginReady } from './src/password-login.mjs';

await generateCatalog();
const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(directory, '.local-data'));
const origin = (process.env.SITE_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 4173}`).replace(/\/+$/, '');
await mkdir(dataDir, { recursive: true });
const storage = await createLocalEnvironment(dataDir, origin);

// The wedding invitation and gift ledger app keeps its files in its own folder on the disk.
// Until WEDDING_HOST names its own domain it lives under /wedding/; after that it is served at
// that domain's root and /wedding/ here forwards visitors there.
const weddingHosts = (process.env.WEDDING_HOST || '').toLowerCase().split(',').map(host => host.trim()).filter(host => /^[a-z0-9.-]+$/.test(host));
process.env.WEDDING_DATA_DIR = path.join(dataDir, 'wedding');
process.env.WEDDING_ORIGIN = weddingHosts.length ? `https://${weddingHosts[0]}` : `${origin}/wedding`;
const { default: wedding } = await import('./wedding/server.cjs');

// Web Push keys are created once and kept on the disk, so phones stay subscribed across deploys.
async function pushKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_JWK) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateJwk: process.env.VAPID_PRIVATE_JWK };
  const file = path.join(dataDir, 'push-keys.json');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = { publicKey: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'), privateJwk: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)) };
  await writeFile(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}
const secret = name => { const value = process.env[name]; if (!value) console.error(`CONFIG_MISSING ${name}`); return value || ''; };
const encryptionKey = secret('CONFIG_ENCRYPTION_KEY');
const vapid = await pushKeys();
const env = {
  DB: storage.env.DB, BUCKET: storage.env.BUCKET, SITE_ORIGIN: origin,
  ADMIN_USER_IDS: 'owner', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '', SESSION_SECRET: secret('SESSION_SECRET'),
  RATE_LIMIT_SALT: secret('RATE_LIMIT_SALT'),
  // The app expects 64 hex characters; any other secret text is turned into that form.
  CONFIG_ENCRYPTION_KEY: /^[a-f0-9]{64}$/i.test(encryptionKey) ? encryptionKey : encryptionKey ? createHash('sha256').update(encryptionKey).digest('hex') : '',
  VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_JWK: vapid.privateJwk,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '', CHAT_MODEL: process.env.CHAT_MODEL || ''
};
if (!passwordLoginReady(env)) console.error('ADMIN_LOGIN_DISABLED set ADMIN_PASSWORD (10+ characters) and SESSION_SECRET');

const served = new Set([...publicFiles(products), 'login.html', 'login.js', 'login.css']);
const types = { html: 'text/html; charset=utf-8', txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', pdf: 'application/pdf', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
await ensureVisitTable(storage.env.DB);
const productIds = new Set(products.map(product => product.id));
const reportToken = process.env.REPORT_TOKEN || '';
const visitLimits = new Map();
const plain = (status, body = null, type) => new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...(type ? { 'Content-Type': type } : {}) } });

// Totals of where visits come from and which page was opened. Bots, the owner and other sites are left out.
async function visit(request) {
  const minute = Math.floor(Date.now() / 60000), address = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (visitLimits.size > 5000) visitLimits.clear();
  const used = visitLimits.get(address);
  visitLimits.set(address, used?.minute === minute ? { minute, count: used.count + 1 } : { minute, count: 1 });
  if (visitLimits.get(address).count > 60) return plain(429);
  if (request.headers.get('Origin') !== origin || Number(request.headers.get('Content-Length') || 0) > 512) return plain(204);
  if (/bot|crawler|spider|headless|lighthouse|preview|facebookexternalhit/i.test(request.headers.get('User-Agent') || '')) return plain(204);
  if (await passwordIdentity(request, env)) return plain(204);
  let body = null;
  try { body = JSON.parse((await request.text()).slice(0, 512)); } catch {}
  const cleaned = validVisit(body, productIds);
  if (cleaned) await recordVisit(storage.env.DB, Date.now(), cleaned);
  return plain(204);
}
// Summary numbers for the owner's weekly report. Opens only with the report key; holds no customer details.
async function report(request, url) {
  if (!reportToken) return plain(404, '찾을 수 없는 페이지입니다.', 'text/plain; charset=utf-8');
  if (!await reportAllowed(request, reportToken)) return plain(401, '보고용 열쇠가 필요합니다.', 'text/plain; charset=utf-8');
  return plain(200, JSON.stringify(await readReport(storage.env.DB, url.searchParams.get('days') || 7, Date.now())), 'application/json; charset=utf-8');
}

const pages = productPages(products);
const sitemap = renderSitemap(products, new Date().toISOString().slice(0, 10));
const worker = createWorker(async pathname => {
  if (pages.has(pathname)) return new Response(pages.get(pathname), { headers: { 'Content-Type': types.html, 'Cache-Control': 'no-cache' } });
  if (pathname === '/sitemap.xml') return new Response(sitemap, { headers: { 'Content-Type': types.xml, 'Cache-Control': 'no-cache' } });
  const name = pathname === '/admin/login' ? 'login.html' : pathname.slice(1);
  if (!served.has(name)) return new Response('찾을 수 없는 페이지입니다.', { status: 404 });
  const extension = name.split('.').pop();
  return new Response(await readFile(path.join(directory, 'dist', name)), { headers: { 'Content-Type': types[extension], 'Cache-Control': /^(png|jpg|webp|pdf)$/.test(extension) ? 'public,max-age=86400' : 'no-cache' } });
}, { identify: passwordIdentity, signInUrl: '/admin/login' });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('ok'); return; }
    if (weddingHosts.includes(String(req.headers.host || '').toLowerCase().replace(/:\d+$/, ''))) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      await wedding.handle(req, res, url.pathname);
      return;
    }
    if (url.pathname === '/wedding' || url.pathname.startsWith('/wedding/')) {
      const rest = url.pathname.slice('/wedding'.length) || '/';
      if (weddingHosts.length) { res.writeHead(308, { Location: `https://${weddingHosts[0]}${rest}${url.search}` }); res.end(); return; }
      if (url.pathname === '/wedding') { res.writeHead(308, { Location: '/wedding/' }); res.end(); return; }
      await wedding.handle(req, res, rest);
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      // Identity and client-address headers are set here, never taken from the visitor.
      if (key.startsWith('oai-authenticated-') || key === 'host' || key === 'cf-connecting-ip' || key === 'cf-access-jwt-assertion') continue;
      if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    headers.set('CF-Connecting-IP', String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown');
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req), duplex: 'half' });
    const response = url.pathname === '/api/login' && req.method === 'POST' ? await passwordLogin(request, env)
      : url.pathname === '/api/visit' && req.method === 'POST' ? await visit(request)
      : url.pathname === '/api/report' && req.method === 'GET' ? await report(request, url)
      : url.pathname === '/api/logout' && req.method === 'POST' ? passwordLogout(request, env)
      : await worker.fetch(request, env, { waitUntil: promise => promise.catch(() => console.error('BACKGROUND_TASK_FAILED')) });
    const out = {};
    response.headers.forEach((value, key) => { if (key !== 'set-cookie') out[key] = value; });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out['Set-Cookie'] = cookies;
    if (url.protocol === 'https:') out['Strict-Transport-Security'] = 'max-age=31536000';
    res.writeHead(response.status, out);
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) {
    console.error('REQUEST_FAILED', error?.name || 'Error');
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('잠시 문제가 있습니다. 전화로 문의해주세요.');
  }
});
const port = Number(process.env.PORT) || 4173;
server.listen(port, process.env.RENDER ? '0.0.0.0' : '127.0.0.1', () => console.log(`Listening on ${port} for ${origin}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { storage.close(); process.exit(0); }));
