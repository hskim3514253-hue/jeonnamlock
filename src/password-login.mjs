// Admin sign-in for the self-hosted Node server (Render): one owner password, checked on the
// server, and a signed, HttpOnly session cookie. Nothing a browser can set by itself is trusted.
// ADMIN_PASSWORD and SESSION_SECRET come from the host's secret settings, never from the repo.
const SESSION_COOKIE = '__Host-jn-admin', SESSION_MS = 30 * 86400000;
const LOGIN_WINDOW_MS = 15 * 60000, LOGIN_ATTEMPTS = 8;
const encoder = new TextEncoder();
const toHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const digest = async text => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export const passwordLoginReady = env => String(env.ADMIN_PASSWORD || '').length >= 10 && String(env.SESSION_SECRET || '').length >= 16;
async function sessionSignature(env, expires) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // The password is part of the signed text, so changing it signs every device out.
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`admin:${expires}:${await digest(env.ADMIN_PASSWORD)}`)));
}

export async function passwordIdentity(request, env) {
  if (!passwordLoginReady(env)) return null;
  const value = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(request.headers.get('Cookie') || '')?.[1] || '';
  const [expires, signature] = value.split('.');
  if (!/^\d{13}$/.test(expires || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
  if (Number(expires) <= Date.now() || Number(expires) > Date.now() + SESSION_MS + 60000) return null;
  return sameText(signature, await sessionSignature(env, expires)) ? { id: 'owner', email: '' } : null;
}

const fromSite = (request, env) => request.headers.get('Origin') === env.SITE_ORIGIN && request.headers.get('Sec-Fetch-Site') !== 'cross-site';

export async function passwordLogin(request, env) {
  if (!fromSite(request, env)) return reply({ error: '홈페이지에서 다시 시도해주세요.' }, 403);
  if (!passwordLoginReady(env)) return reply({ error: '관리자 비밀번호가 아직 설정되지 않았습니다.' }, 503);
  if (!env.RATE_LIMIT_SALT) return reply({ error: '로그인을 처리할 수 없습니다.' }, 503);
  const window = Math.floor(Date.now() / LOGIN_WINDOW_MS);
  const key = await digest(`${env.RATE_LIMIT_SALT}:login:${request.headers.get('CF-Connecting-IP') || 'unknown'}:${window}`);
  const attempts = await env.DB.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, (window + 2) * LOGIN_WINDOW_MS).first();
  if (attempts.count > LOGIN_ATTEMPTS) return reply({ error: '로그인 시도가 많습니다. 15분 뒤 다시 시도해주세요.' }, 429);
  let password = '';
  try {
    const text = await request.text();
    if (text.length <= 2048) password = String(JSON.parse(text)?.password ?? '');
  } catch {}
  if (!password || !sameText(await digest(password), await digest(env.ADMIN_PASSWORD))) return reply({ error: '비밀번호가 맞지 않습니다.' }, 401);
  const expires = String(Date.now() + SESSION_MS);
  return reply({ signedIn: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=${expires}.${await sessionSignature(env, expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}` });
}

export function passwordLogout(request, env) {
  if (!fromSite(request, env)) return reply({ error: '홈페이지에서 다시 시도해주세요.' }, 403);
  return reply({ signedIn: false }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}
