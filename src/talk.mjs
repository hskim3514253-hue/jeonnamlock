// Consultation chat between the owner and one customer, attached to a submitted inquiry.
// The customer opens it with a private link; the link's key is derived from a server secret,
// so nothing extra is stored and the owner can show the same link again at any time.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
export const TALK_MAX = 1000;
export const TALK_LIMIT = 500; // messages kept per inquiry

export async function talkKey(env, inquiryId) {
  if (!/^[a-f0-9]{64}$/i.test(env.CONFIG_ENCRYPTION_KEY || '')) throw new Error('TALK_NOT_CONFIGURED');
  // A separate key from the one that encrypts push endpoints.
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`talk-link:${env.CONFIG_ENCRYPTION_KEY}`));
  const key = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`talk:${inquiryId}`)));
}
export async function talkKeyMatches(env, inquiryId, given) {
  if (typeof given !== 'string' || !/^[a-f0-9]{64}$/.test(given)) return false;
  const expected = await talkKey(env, inquiryId);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return difference === 0;
}
// The key sits after "#", so it never reaches server logs or other sites.
export const talkLink = async (env, inquiryId) => `/talk#${inquiryId}.${await talkKey(env, inquiryId)}`;

export function talkBody(value) {
  if (typeof value !== 'string') return null;
  const body = value.replace(/\r\n?/g, '\n').trim();
  if (!body || body.length > TALK_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)) return null;
  return body;
}
export async function talkMessages(db, inquiryId) {
  const rows = await db.all('SELECT id,sender,body,created_at FROM talk_messages WHERE inquiry_id=? ORDER BY created_at,id LIMIT ?', inquiryId, TALK_LIMIT);
  return rows.map(row => ({ id: row.id, from: row.sender, body: row.body, at: row.created_at }));
}
export async function addTalkMessage(db, inquiryId, sender, body, now = Date.now()) {
  const id = crypto.randomUUID();
  const result = await db.run('INSERT INTO talk_messages (id,inquiry_id,sender,body,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM talk_messages WHERE inquiry_id=?)<?', id, inquiryId, sender, body, now, inquiryId, TALK_LIMIT);
  if (!result.meta.changes) return null;
  return { id, from: sender, body, at: now };
}
