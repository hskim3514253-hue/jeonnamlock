// Production server for a Node host (Render). The same request handler as the Cloudflare Worker
// build runs here on top of SQLite and a photo folder kept on the host's persistent disk.
//   DATA_DIR        folder on the persistent disk (database, photos, push keys)
//   SITE_ORIGIN     the address visitors use; defaults to the host's own address
//   ADMIN_PASSWORD, SESSION_SECRET, RATE_LIMIT_SALT, CONFIG_ENCRYPTION_KEY   secrets set on the host
import { generateCatalog, products } from './scripts/catalog.mjs';
import { publicFiles } from './scripts/public-files.mjs';
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
const worker = createWorker(async pathname => {
  const name = pathname === '/admin/login' ? 'login.html' : pathname.slice(1);
  if (!served.has(name)) return new Response('찾을 수 없는 페이지입니다.', { status: 404 });
  const extension = name.split('.').pop();
  return new Response(await readFile(path.join(directory, 'dist', name)), { headers: { 'Content-Type': types[extension], 'Cache-Control': /^(png|jpg|webp|pdf)$/.test(extension) ? 'public,max-age=86400' : 'no-cache' } });
}, { identify: passwordIdentity, signInUrl: '/admin/login' });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('ok'); return; }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      // Identity and client-address headers are set here, never taken from the visitor.
      if (key.startsWith('oai-authenticated-') || key === 'host' || key === 'cf-connecting-ip' || key === 'cf-access-jwt-assertion') continue;
      if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
    headers.set('CF-Connecting-IP', String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown');
    const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req), duplex: 'half' });
    const response = url.pathname === '/api/login' && req.method === 'POST' ? await passwordLogin(request, env)
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
