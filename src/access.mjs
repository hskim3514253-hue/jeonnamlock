// Admin identity for the owner's own Cloudflare account: Cloudflare Access (email one-time code)
// sits in front of /admin and /api/admin and hands the Worker a signed JWT. The identity is taken
// only from a token whose signature, issuer, audience and expiry all check out; no request header
// set by a browser is trusted. ADMIN_USER_IDS then lists the allowed email addresses.
const ACCESS_KEY_TTL = 3600000, ACCESS_REFETCH_GAP = 60000;
const accessKeys = new Map(); // team domain -> { keys: Map<kid, CryptoKey>, at }

const fromBase64Url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));
const readJson = text => JSON.parse(new TextDecoder().decode(fromBase64Url(text)));

async function accessKey(team, kid, env) {
  let entry = accessKeys.get(team);
  const now = Date.now();
  if (!entry || now - entry.at > ACCESS_KEY_TTL || (!entry.keys.has(kid) && now - entry.at > ACCESS_REFETCH_GAP)) {
    const response = await (env.ACCESS_FETCH || fetch)(`${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('ACCESS_KEYS_UNAVAILABLE');
    const keys = new Map();
    for (const jwk of (await response.json()).keys || []) {
      if (jwk.kty === 'RSA' && jwk.kid) keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    entry = { keys, at: now };
    accessKeys.set(team, entry);
  }
  return entry.keys.get(kid) || null;
}

export async function accessIdentity(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, ''), audience = String(env.ACCESS_AUD || '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience) return null;
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1];
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie;
  if (!token || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = readJson(parts[0]), payload = readJson(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== team || !audiences.includes(audience)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now || (typeof payload.nbf === 'number' && payload.nbf > now + 60)) return null;
    const key = await accessKey(team, header.kid, env);
    if (!key) return null;
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!valid || !email || email.length > 254) return null;
    return { id: email, email };
  } catch (error) {
    if (error?.message === 'ACCESS_KEYS_UNAVAILABLE' || error?.name === 'TimeoutError') throw error;
    return null;
  }
}
