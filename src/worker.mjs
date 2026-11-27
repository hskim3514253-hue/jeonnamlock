import {inquiryProducts,priceProducts} from './product-index.mjs';
import { chatMessages, chatReply } from './chat.mjs';
import { database } from './db.mjs';
import { pushStatus, savePushSubscription, removePushSubscription, sendInquiryPush, testPush, saveTalkSubscription, removeTalkSubscription, talkSubscriptionIds, sendTalkPush } from './push.mjs';
import { AnalyticsError, recordPageview, readAnalytics } from './analytics.mjs';
import { talkKeyMatches, talkLink, talkBody, talkMessages, addTalkMessage } from './talk.mjs';

const SERVICES = ['새 도어락 설치', '도어락 교체', '고장 · 잠김 상담'];
const SPACES = ['아파트 / 오피스텔', '빌라 / 단독주택', '상가 / 사무실', '기타 공간'];
const MAX_FILE = 10 * 1024 * 1024;
const DAY = 86400000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;
const SLOT = /^(door|product)-[0-4]$/;
const CONSENT = '2026-10-20-v2';
const INTENT_CONSENT = '2026-10-27-v3';
const INTENTS = { home: '우리 집 도어락 상담', repair: '고장 · 교체 상담', business: '업체 · 다량 설치 견적' };
const BUSINESS_TYPES = ['인테리어', '부동산 · 임대관리', '건설 · 현관문', '기관 · 시설', '기타'];
const LEGACY_CONSENT = '2026-09-28-v1';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const reject = (status, message) => { throw new HttpError(status, message); };
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
// Who is signed in is decided once per request by the host's identify function (see createWorker).
const identities = new WeakMap();
// ChatGPT Sites injects these headers itself and strips them from visitors' requests. On any other
// host they are attacker-controlled, so createWorker must be given a different identify function.
function sitesIdentity(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  return id ? { id, email: request.headers.get('oai-authenticated-user-email') || '' } : null;
}
function user(request) { return identities.get(request) || null; }
function isAdmin(request, env) {
  const id = user(request)?.id;
  return Boolean(id && String(env.ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean).includes(id));
}
function requireAdmin(request, env) { if (!isAdmin(request, env)) reject(user(request) ? 403 : 401, '사장님 계정으로 로그인해주세요.'); }
function mutationGuard(request, env) {
  if (request.headers.get('Origin') !== (env.SITE_ORIGIN || new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') reject(403, '홈페이지에서 다시 시도해주세요.');
}
async function boundedBody(request, max) {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) reject(413, '파일 또는 입력 내용이 너무 큽니다.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > max) { await reader.cancel(); reject(413, '파일 또는 입력 내용이 너무 큽니다.'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function readJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) reject(415, '지원하지 않는 요청 형식입니다.');
  let value;
  try { value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 16384))); }
  catch (error) { if (error instanceof HttpError) throw error; reject(400, '입력 내용을 확인해주세요.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, '입력 내용을 확인해주세요.');
  return value;
}
function textField(value, label, max, required = true) {
  if (typeof value !== 'string') { if (!required && value === undefined) return ''; reject(400, `${label}을 확인해주세요.`); }
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) reject(400, `${label}을 확인해주세요.`);
  return result;
}
function payload(value) {
  if (value.website) reject(400, '요청을 처리할 수 없습니다.');
  if (value.consent !== true || ![INTENT_CONSENT, CONSENT, LEGACY_CONSENT].includes(value.consentVersion)) reject(400, '개인정보 수집·이용에 동의해주세요.');
  if (!UUID.test(value.requestKey) || !TOKEN.test(value.uploadToken)) reject(400, '접수 정보를 새로 입력해주세요.');
  const intentForm = value.consentVersion === INTENT_CONSENT;
  const simplified = intentForm || value.consentVersion === CONSENT;
  if (intentForm && !Object.hasOwn(INTENTS, value.inquiryType)) reject(400, '상담 목적을 선택해주세요.');
  if (!simplified && (!SERVICES.includes(value.service) || !SPACES.includes(value.space))) reject(400, '설치 정보를 확인해주세요.');
  const phone = textField(value.phone, '전화번호', 20).replace(/[\s-]/g, '');
  if (!/^0(?:1[016789]\d{7,8}|2\d{7,8}|[3-6]\d{8,9}|70\d{8})$/.test(phone)) reject(400, '전화번호를 확인해주세요.');
  let details = textField(simplified ? value.desiredProduct : value.details, '문의 내용', 1000, false);
  let businessType = '';
  if (intentForm && value.inquiryType === 'business') {
    const company = textField(value.companyName, '업체명', 80, false);
    businessType = textField(value.businessType, '업종', 30, false);
    if (businessType && !BUSINESS_TYPES.includes(businessType)) reject(400, '업종을 확인해주세요.');
    const quantity = textField(value.quantity, '설치 수량', 6, false);
    if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 100000)) reject(400, '설치 수량은 1~100000 사이의 정수로 입력해주세요.');
    const date = textField(value.preferredDate, '희망 일정', 10, false);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) reject(400, '희망 일정을 확인해주세요.');
    details = [company && `업체명: ${company}`, quantity && `예상 수량: ${Number(quantity)}개`, date && `희망 일정: ${date}`, details && `문의 내용: ${details}`].filter(Boolean).join('\n');
  }
  if (value.selectedProductId) {
    const product = typeof value.selectedProductId === 'string' && Object.hasOwn(inquiryProducts, value.selectedProductId) ? inquiryProducts[value.selectedProductId] : null;
    if (!product) reject(400, '선택한 제품을 다시 확인해주세요.');
    details = '\u001e' + JSON.stringify({format:'product-inquiry-v1',product,notes:details});
  }
  return { ...value, phone, district: textField(value.district, '설치 동네', 80),
    service: intentForm ? INTENTS[value.inquiryType] : simplified ? '도어락 견적 문의' : (value.service || '도어락 견적 문의'), space: intentForm ? businessType : simplified ? '' : (value.space || ''),
    customerName: simplified ? '' : textField(value.customerName, '성함', 30, false),
    address: simplified ? '' : textField(value.address, '고객 주소', 150, false),
    addressDetail: simplified ? '' : textField(value.addressDetail, '상세 주소', 100, false),
    details };
}
function visibleInquiry(record) {
  try {
    if (!record.details?.startsWith('\u001e')) return record;
    const value = JSON.parse(record.details.slice(1));
    if (value?.format === 'product-inquiry-v1' && typeof value.notes === 'string' && value.product && /^[a-z0-9-]+$/.test(value.product.id) && typeof value.product.name === 'string' && value.product.name.length <= 100 && typeof value.product.brand === 'string' && (!value.product.image || /^[a-z0-9-]+\.(png|jpg|webp)$/.test(value.product.image))) return {...record,details:value.notes,selected_product:value.product};
  } catch {}
  return record;
}
async function rateLimit(request, env, db) {
  if (!env.RATE_LIMIT_SALT) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  const ip = request.headers.get('CF-Connecting-IP') || user(request)?.id || 'unknown';
  const window = Math.floor(Date.now() / 3600000);
  const key = await hash(`${env.RATE_LIMIT_SALT}:${ip}:${window}`);
  const result = await db.one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', key, (window + 2) * 3600000);
  if (result.count > 10) reject(429, '문의가 여러 번 접수되었습니다. 잠시 후 다시 시도하거나 전화로 문의해주세요.');
}
async function chatLimit(request, env, db) {
  if (!env.RATE_LIMIT_SALT) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  const window = Math.floor(Date.now() / 3600000);
  const key = await hash(`${env.RATE_LIMIT_SALT}:chat:${request.headers.get('CF-Connecting-IP') || 'unknown'}:${window}`);
  const result = await db.one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', key, (window + 2) * 3600000);
  if (result.count > 40) reject(429, '질문이 많아 잠시 쉬어갑니다. 급하시면 전화로 문의해주세요.');
}
async function cleanup(db, env) {
  const stale = await db.all('SELECT id FROM inquiries WHERE status IN (\'draft\',\'deleting\') AND expires_at < ? LIMIT 10', Date.now());
  for (const row of stale) await eraseInquiry(row.id, db, env);
  await db.run('DELETE FROM rate_limits WHERE expires_at < ?', Date.now());
}
async function eraseInquiry(id, db, env) {
  await db.run('UPDATE inquiries SET status=\'deleting\', expires_at=0 WHERE id=?', id);
  const files = await db.all('SELECT object_key FROM photos WHERE inquiry_id=?', id);
  if (files.length) await env.BUCKET.delete(files.map(file => file.object_key));
  await db.batch([['DELETE FROM talk_subscriptions WHERE inquiry_id=?', id], ['DELETE FROM talk_messages WHERE inquiry_id=?', id], ['DELETE FROM push_outbox WHERE inquiry_id=?', id], ['DELETE FROM sms_outbox WHERE inquiry_id=?', id], ['DELETE FROM photos WHERE inquiry_id=?', id], ['DELETE FROM inquiries WHERE id=?', id]]);
}
async function draft(request, db, id) {
  const token = request.headers.get('X-Quote-Token') || '';
  if (!UUID.test(id) || !TOKEN.test(token)) reject(404, '접수 정보를 찾을 수 없습니다.');
  const record = await db.one('SELECT * FROM inquiries WHERE id=? AND token_hash=?', id, await hash(token));
  if (!record || record.status === 'deleting' || (record.status === 'draft' && record.expires_at < Date.now())) reject(404, '접수 정보가 만료되었습니다. 새로 문의해주세요.');
  return record;
}
async function talkLimit(request, env, db) {
  if (!env.RATE_LIMIT_SALT) throw new Error('RATE_LIMIT_NOT_CONFIGURED');
  const window = Math.floor(Date.now() / 3600000);
  const key = await hash(`${env.RATE_LIMIT_SALT}:talk:${request.headers.get('CF-Connecting-IP') || 'unknown'}:${window}`);
  const result = await db.one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', key, (window + 2) * 3600000);
  if (result.count > 60) reject(429, '메시지를 너무 자주 보냈습니다. 잠시 후 다시 보내거나 전화로 문의해주세요.');
}
// The customer's side of a consultation chat: the inquiry id plus the private key from their link.
async function talkInquiry(request, env, db, id) {
  const record = UUID.test(id) && await talkKeyMatches(env, id, request.headers.get('X-Talk-Key') || '') ? await db.one('SELECT id,receipt,service,status FROM inquiries WHERE id=? AND status IN (\'new\',\'consulting\')', id) : null;
  if (!record) reject(404, '상담 채팅을 찾을 수 없습니다. 상담이 끝났거나 주소가 잘못되었습니다.');
  return record;
}
function imageType(bytes) {
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length > 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (bytes.length > 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
async function api(request, env, ctx, pathname, signInUrl) {
  if (pathname === '/api/session' && request.method === 'GET') return json({ user: user(request), isAdmin: isAdmin(request, env), adminConfigured: Boolean(env.ADMIN_USER_IDS), signInUrl });
  const db = database(env);
  if (['POST','PUT','PATCH','DELETE'].includes(request.method)) mutationGuard(request, env);
  if (pathname.startsWith('/api/admin/')) requireAdmin(request, env);
  if (pathname === '/api/analytics/pageview' && request.method === 'POST') return recordPageview(request,{db,salt:env.RATE_LIMIT_SALT,nowMs:Date.now(),isAdmin:isAdmin(request,env)});
  if (pathname === '/api/admin/analytics' && request.method === 'GET') return json(await readAnalytics(db,new URL(request.url).searchParams.get('date')??undefined,Date.now()));
  if (pathname === '/api/chat' && request.method === 'POST') {
    const value = await readJson(request);
    const product = typeof value.productId === 'string' && Object.hasOwn(priceProducts, value.productId) ? { id: value.productId, ...priceProducts[value.productId] } : null;
    if (!product) reject(400, '제품을 다시 선택해주세요.');
    let messages;
    try { messages = chatMessages(value.messages); } catch { reject(400, '질문은 500자 이내로 입력해주세요.'); }
    await chatLimit(request, env, db);
    return json(await chatReply(env, product, messages));
  }
  const talkRoute = pathname.match(/^\/api\/talk\/([^/]+)$/);
  if (talkRoute && request.method === 'GET') {
    const record = await talkInquiry(request, env, db, talkRoute[1]);
    return json({ receipt: record.receipt, service: record.service, messages: await talkMessages(db, record.id), alerts: { publicKey: env.VAPID_PRIVATE_JWK && env.VAPID_PUBLIC_KEY ? env.VAPID_PUBLIC_KEY : '', devices: await talkSubscriptionIds(db, record.id) } });
  }
  const talkPushRoute = pathname.match(/^\/api\/talk\/([^/]+)\/push$/);
  if (talkPushRoute && ['PUT','DELETE'].includes(request.method)) {
    const record = await talkInquiry(request, env, db, talkPushRoute[1]);
    const endpoint = String((await readJson(request)).endpoint || '');
    if (request.method === 'DELETE') { await removeTalkSubscription(db, record.id, endpoint); return json({ removed: true }); }
    await talkLimit(request, env, db);
    try { return json(await saveTalkSubscription(db, env, record.id, endpoint)); }
    catch (error) {
      if (error.message === 'INVALID_PUSH_ENDPOINT') reject(400, '이 브라우저에서는 알림을 켤 수 없습니다.');
      if (error.message === 'PUSH_DEVICE_LIMIT') reject(409, '알림은 기기 3대까지 켤 수 있습니다.');
      if (error.message === 'PUSH_NOT_CONFIGURED') reject(503, '알림을 준비하고 있습니다. 잠시 후 다시 시도해주세요.');
      throw error;
    }
  }
  if (talkRoute && request.method === 'POST') {
    const record = await talkInquiry(request, env, db, talkRoute[1]);
    const body = talkBody((await readJson(request)).body);
    if (!body) reject(400, '메시지는 1000자 이내로 입력해주세요.');
    await talkLimit(request, env, db);
    const previous = await db.one('SELECT max(created_at) AS at FROM talk_messages WHERE inquiry_id=? AND sender=\'customer\'', record.id);
    const message = await addTalkMessage(db, record.id, 'customer', body);
    if (!message) reject(409, '메시지가 너무 많습니다. 전화로 문의해주세요.');
    // One alert per burst of messages; the alert itself carries no customer details.
    if (!previous?.at || message.at - previous.at > 60000) {
      await db.run('INSERT INTO push_outbox (id,inquiry_id,subscription_id,status,attempts,updated_at) SELECT ? || \':\' || id,?,id,\'pending\',0,? FROM push_subscriptions WHERE enabled=1 ON CONFLICT(id) DO NOTHING', message.id, record.id, message.at);
      ctx.waitUntil(sendInquiryPush(db, env, record.id).catch(() => console.error('PUSH_DISPATCH_FAILED')));
    }
    return json({ message }, 201);
  }
  const adminTalkRoute = pathname.match(/^\/api\/admin\/quotes\/([^/]+)\/talk$/);
  if (adminTalkRoute) {
    const id = adminTalkRoute[1];
    const record = UUID.test(id) ? await db.one('SELECT id,status FROM inquiries WHERE id=? AND status IN (\'new\',\'consulting\')', id) : null;
    if (!record) reject(404, '문의가 없거나 삭제되었습니다.');
    if (request.method === 'GET') {
      await db.run('UPDATE inquiries SET talk_read_at=? WHERE id=?', Date.now(), id);
      return json({ messages: await talkMessages(db, id), link: (env.SITE_ORIGIN || new URL(request.url).origin) + await talkLink(env, id), customerAlerts: (await talkSubscriptionIds(db, id)).length });
    }
    if (request.method === 'POST') {
      const body = talkBody((await readJson(request)).body);
      if (!body) reject(400, '메시지는 1000자 이내로 입력해주세요.');
      const message = await addTalkMessage(db, id, 'owner', body);
      if (!message) reject(409, '이 문의의 메시지가 너무 많습니다.');
      await db.run('UPDATE inquiries SET status=\'consulting\',talk_read_at=?,updated_at=? WHERE id=?', message.at, message.at, id);
      ctx.waitUntil(sendTalkPush(db, env, id).catch(() => console.error('TALK_PUSH_FAILED')));
      return json({ message }, 201);
    }
  }
  if (!env.BUCKET?.put) throw new Error('STORAGE_UNAVAILABLE');
  if (pathname === '/api/quotes' && request.method === 'POST') {
    const value = payload(await readJson(request)); const tokenHash = await hash(value.uploadToken);
    const old = await db.one('SELECT id,token_hash,status,receipt,expires_at FROM inquiries WHERE request_key=?', value.requestKey);
    if (old) {
      if (old.token_hash !== tokenHash) reject(409, '이미 사용된 접수 정보입니다. 새로 문의해주세요.');
      if (old.status === 'deleting' || (old.status === 'draft' && old.expires_at < Date.now())) reject(410, '접수 정보가 만료되었습니다. 새로고침 후 다시 문의해주세요.');
      return json({ id: old.id, receipt: old.receipt, status: old.status });
    }
    await rateLimit(request, env, db);
    const id = crypto.randomUUID(), now = Date.now();
    const receipt = `JN-${new Date(now).toISOString().slice(0,10).replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`;
    try { await db.run('INSERT INTO inquiries (id,request_key,token_hash,receipt,service,space,district,customer_name,phone,address,address_detail,details,status,consent_version,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, value.requestKey, tokenHash, receipt, value.service, value.space, value.district, value.customerName, value.phone, value.address, value.addressDetail, value.details, 'draft', value.consentVersion, now, now, now + DAY); }
    catch (error) { const existing = await db.one('SELECT id,receipt,status,token_hash FROM inquiries WHERE request_key=?', value.requestKey); if (existing?.token_hash === tokenHash) return json({ id: existing.id, receipt: existing.receipt, status: existing.status }); throw error; }
    ctx.waitUntil(cleanup(db, env).catch(() => console.error('DRAFT_CLEANUP_FAILED')));
    return json({ id, receipt, status: 'draft' }, 201);
  }
  const photoRoute = pathname.match(/^\/api\/quotes\/([^/]+)\/photos\/([^/]+)$/);
  if (photoRoute && request.method === 'PUT') {
    const [, id, slot] = photoRoute;
    if (!SLOT.test(slot)) reject(400, '사진은 항목별 5장까지 첨부할 수 있습니다.');
    if ((await draft(request, db, id)).status !== 'draft') reject(409, '이미 접수된 문의입니다.');
    const bytes = await boundedBody(request, MAX_FILE), mime = imageType(bytes);
    if (!mime || request.headers.get('Content-Type') !== mime) reject(415, 'JPG, PNG, WEBP 사진만 첨부해주세요.');
    const photoId = `${id}:${slot}`, previous = await db.one('SELECT object_key FROM photos WHERE id=?', photoId), key = `inquiries/${id}/${slot}/${crypto.randomUUID()}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      const result = await db.run('INSERT INTO photos (id,inquiry_id,kind,object_key,mime,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM inquiries WHERE id=? AND status=\'draft\' AND expires_at>?) ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key,mime=excluded.mime,size=excluded.size,created_at=excluded.created_at', photoId, id, slot.split('-')[0], key, mime, bytes.length, Date.now(), id, Date.now());
      if (result.meta.changes === 0) reject(409, '접수가 완료되었거나 만료되었습니다.');
    } catch (error) { await env.BUCKET.delete(key); throw error; }
    if (previous) ctx.waitUntil(env.BUCKET.delete(previous.object_key).catch(() => console.error('REPLACED_PHOTO_CLEANUP_FAILED')));
    return json({ slot, uploaded: true }, 201);
  }
  const submitRoute = pathname.match(/^\/api\/quotes\/([^/]+)\/submit$/);
  if (submitRoute && request.method === 'POST') {
    const record = await draft(request, db, submitRoute[1]);
    if (record.status !== 'draft') return json({ receipt: record.receipt, submitted: true, talk: await talkLink(env, record.id).catch(() => null) });
    const value = await readJson(request);
    if (!Array.isArray(value.slots) || value.slots.length > 10 || value.slots.some(slot => !SLOT.test(slot)) || new Set(value.slots).size !== value.slots.length) reject(400, '첨부 사진 정보를 확인해주세요.');
    if (record.consent_version === CONSENT && !value.slots.some(slot => slot.startsWith('door-'))) reject(400, '설치할 문 사진을 한 장 이상 첨부해주세요.');
    const files = await db.all('SELECT id,object_key FROM photos WHERE inquiry_id=?', record.id);
    if (files.length !== value.slots.length || files.some(file => !value.slots.includes(file.id.split(':')[1]))) reject(409, '사진 전송이 끝나지 않았습니다. 다시 시도해주세요.');
    for (const file of files) if (!await env.BUCKET.head(file.object_key)) reject(503, '첨부 사진을 확인할 수 없습니다. 다시 시도해주세요.');
    await db.batch([
      ['UPDATE inquiries SET status=\'new\',submitted_at=?,updated_at=? WHERE id=? AND status=\'draft\'', Date.now(), Date.now(), record.id],
      ['INSERT INTO push_outbox (id,inquiry_id,subscription_id,status,attempts,updated_at) SELECT ? || \':\' || id,?,id,\'pending\',0,? FROM push_subscriptions WHERE enabled=1 ON CONFLICT(id) DO NOTHING', record.id, record.id, Date.now()]
    ]);
    ctx.waitUntil(sendInquiryPush(db, env, record.id).catch(() => console.error('PUSH_DISPATCH_FAILED')));
    return json({ receipt: record.receipt, submitted: true, talk: await talkLink(env, record.id).catch(() => null) }, 201);
  }
  if (pathname === '/api/admin/push' && request.method === 'GET') return json(await pushStatus(db, env, user(request).id));
  if (pathname === '/api/admin/push' && ['PUT','DELETE'].includes(request.method)) {
    const value=await readJson(request);
    try {
      if(request.method==='DELETE'){await removePushSubscription(db,user(request).id,String(value.endpoint||''));return json({removed:true});}
      return json(await savePushSubscription(db,env,user(request).id,value.endpoint));
    } catch(error) {
      if(error.message==='INVALID_PUSH_ENDPOINT')reject(400,'이 브라우저의 알림을 등록할 수 없습니다. 아이폰은 홈 화면에 추가한 전남열쇠 앱에서, 안드로이드는 Chrome에서 다시 시도해주세요.');
      if(error.message==='PUSH_DEVICE_LIMIT')reject(409,'알림은 최대 5개 기기에 등록할 수 있습니다. 사용하지 않는 기기에서 알림을 꺼주세요.');throw error;
    }
  }
  if (pathname === '/api/admin/push/test' && request.method === 'POST') {
    const value=await readJson(request);
    try{return json(await testPush(db,env,user(request).id,String(value.id||'')));}catch(error){if(error.message==='PUSH_DEVICE_MISSING')reject(404,'먼저 이 기기의 알림을 켜주세요.');if(error.message==='PUSH_TEST_RATE_LIMIT')reject(429,'30초 후 다시 시험해주세요.');throw error;}
  }
  if (pathname === '/api/admin/push/retry' && request.method === 'POST') {await sendInquiryPush(db,env,null,user(request).id);return json(await pushStatus(db,env,user(request).id));}
  if (pathname === '/api/admin/quotes' && request.method === 'GET') {
    ctx.waitUntil(cleanup(db, env).catch(() => console.error('DRAFT_CLEANUP_FAILED')));
    const offset = Math.max(0, Math.min(100000, Number(new URL(request.url).searchParams.get('offset')) || 0));
    const rows = await db.all('SELECT id,receipt,service,district,customer_name,phone,address,address_detail,details,status,submitted_at,(SELECT count(*) FROM photos WHERE inquiry_id=inquiries.id) AS photo_count,(SELECT count(*) FROM talk_messages WHERE inquiry_id=inquiries.id AND sender=\'customer\' AND created_at>COALESCE(inquiries.talk_read_at,0)) AS unread_messages FROM inquiries WHERE status IN (\'new\',\'consulting\') ORDER BY submitted_at DESC LIMIT 51 OFFSET ?', Math.floor(offset));
    return json({ inquiries: rows.slice(0,50).map(visibleInquiry), hasMore: rows.length > 50, offset });
  }
  const detailRoute = pathname.match(/^\/api\/admin\/quotes\/([^/]+)$/);
  if (detailRoute) {
    const id = detailRoute[1]; if (!UUID.test(id)) reject(404, '문의가 없습니다.');
    const record = await db.one('SELECT * FROM inquiries WHERE id=? AND status IN (\'new\',\'consulting\')', id);
    if (!record) reject(404, '문의가 없거나 삭제되었습니다.');
    if (request.method === 'GET') {
      const files = await db.all('SELECT id,kind,mime,size FROM photos WHERE inquiry_id=? ORDER BY kind,id', id);
      const { token_hash, request_key, ...safeRecord } = record;
      const unread = await db.one('SELECT count(*) AS count FROM talk_messages WHERE inquiry_id=? AND sender=\'customer\' AND created_at>?', id, record.talk_read_at || 0);
      return json({ inquiry: { ...visibleInquiry(safeRecord), unread_messages: unread.count }, photos: files.map(file => ({ ...file, url: `/api/admin/photos/${encodeURIComponent(file.id)}` })) });
    }
    if (request.method === 'PATCH') { const value = await readJson(request); if (!['new','consulting'].includes(value.status)) reject(400, '상담 상태를 확인해주세요.'); await db.run('UPDATE inquiries SET status=?,updated_at=? WHERE id=?', value.status, Date.now(), id); return json({ updated: true }); }
    if (request.method === 'DELETE') { const value = await readJson(request); if (value.confirm !== record.receipt) reject(400, '삭제할 문의를 확인해주세요.'); await eraseInquiry(id, db, env); return json({ deleted: true }); }
  }
  const imageRoute = pathname.match(/^\/api\/admin\/photos\/([^/]+)$/);
  if (imageRoute && request.method === 'GET') {
    const record = await db.one('SELECT photos.* FROM photos JOIN inquiries ON inquiries.id=photos.inquiry_id WHERE photos.id=? AND inquiries.status IN (\'new\',\'consulting\')', decodeURIComponent(imageRoute[1]));
    if (!record) reject(404, '사진을 찾을 수 없습니다.');
    const object = await env.BUCKET.get(record.object_key); if (!object) reject(404, '사진을 찾을 수 없습니다.');
    return new Response(object.body, { headers: { 'Content-Type': record.mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="inquiry-photo"' } });
  }
  reject(404, '요청한 내용을 찾을 수 없습니다.');
}
export function createWorker(assetProvider, { identify = sitesIdentity, signInUrl = '/signin-with-chatgpt?return_to=%2Fadmin' } = {}) {
  return { async fetch(request, env, ctx = { waitUntil: () => {} }) {
    let response;
    const url = new URL(request.url);
    try {
      const path = url.pathname;
      identities.set(request, await identify(request, env));
      if (path.startsWith('/api/')) response = await api(request, env, ctx, path, signInUrl);
      else if (!['GET','HEAD'].includes(request.method)) response = json({ error: '허용되지 않는 요청입니다.' }, 405);
      // Old shared customer links must load on the origin accepted by mutationGuard.
      // Keep APIs/admin on their existing origins; never redirect a submitted request body.
      else if (url.origin === 'https://jeonnam-lock-studio.hskim3514253.chatgpt.site'
        && env.SITE_ORIGIN === 'https://jeonnamlock.com' && ['/', '/index.html'].includes(path)) {
        response = new Response(null, { status: 301, headers: { Location: 'https://jeonnamlock.com/' + url.search } });
      }
      else if (path === '/index.html') response = new Response(null, { status: 301, headers: { Location: '/' + url.search } });
      else response = await assetProvider(path === '/' ? '/index.html' : /^\/admin\/?$/.test(path) ? '/admin.html' : /^\/talk\/?$/.test(path) ? '/talk.html' : path, env, request);
    } catch (error) {
      const known=error instanceof HttpError || error instanceof AnalyticsError;
      if (!known) console.error('REQUEST_FAILED', error?.name || 'Error');
      response = json({ error: known ? error.message : '저장 서비스에 잠시 문제가 있습니다. 입력 내용은 그대로 두고 다시 시도해주세요.' }, known ? error.status : 503);
    }
    const headers = new Headers(response.headers);
    if (url.pathname.startsWith('/api/') || /^\/(?:admin|talk)(?:\/|\.|$)/.test(url.pathname) || response.status >= 400) headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('X-Content-Type-Options','nosniff'); headers.set('Referrer-Policy','strict-origin-when-cross-origin'); headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const customerVideoPolicy=url.pathname==='/'?' frame-src https://www.youtube-nocookie.com;':'';
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"+customerVideoPolicy);
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
  } };
}
