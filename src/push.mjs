const pushEncoder = new TextEncoder();
const pushBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const pushDecode = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
export function validPushEndpoint(value) {
  try { const url=new URL(value);return typeof value==='string' && value.length<=2048 && url.protocol==='https:' && !url.username && !url.password && !url.port && !url.hash && (url.hostname==='fcm.googleapis.com' || url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.push.services.mozilla.com') || url.hostname.endsWith('.notify.windows.com')); } catch {return false;}
}
const pushId = async endpoint => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pushEncoder.encode(endpoint))),x=>x.toString(16).padStart(2,'0')).join('');
async function pushKey(env) {
  if(!/^[a-f0-9]{64}$/.test(env.CONFIG_ENCRYPTION_KEY||''))throw new Error('PUSH_ENCRYPTION_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw',Uint8Array.from(env.CONFIG_ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt']);
}
async function encryptEndpoint(endpoint,env) {const iv=crypto.getRandomValues(new Uint8Array(12));const value=await crypto.subtle.encrypt({name:'AES-GCM',iv},await pushKey(env),pushEncoder.encode(endpoint));return JSON.stringify({iv:pushBase64(iv),value:pushBase64(new Uint8Array(value))});}
async function decryptEndpoint(packed,env) {const value=JSON.parse(packed);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:pushDecode(value.iv)},await pushKey(env),pushDecode(value.value)));}
export async function savePushSubscription(db,env,userId,endpoint) {
  if(!validPushEndpoint(endpoint))throw new Error('INVALID_PUSH_ENDPOINT');
  if(!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY)throw new Error('PUSH_NOT_CONFIGURED');
  const id=await pushId(endpoint), old=await db.one('SELECT user_id FROM push_subscriptions WHERE id=?',id);
  if(old && old.user_id!==userId)throw new Error('INVALID_PUSH_ENDPOINT');
  const encrypted=await encryptEndpoint(endpoint,env);
  const result=await db.run('INSERT INTO push_subscriptions (id,user_id,encrypted_endpoint,enabled,created_at) SELECT ?,?,?,1,? WHERE (SELECT count(*) FROM push_subscriptions WHERE user_id=?)<5 OR EXISTS (SELECT 1 FROM push_subscriptions WHERE id=? AND user_id=?) ON CONFLICT(id) DO UPDATE SET encrypted_endpoint=excluded.encrypted_endpoint,enabled=1',id,userId,encrypted,Date.now(),userId,id,userId);
  if(!result.meta.changes)throw new Error('PUSH_DEVICE_LIMIT');return {id};
}
export async function removePushSubscription(db,userId,endpoint) {const id=await pushId(endpoint);await db.run('DELETE FROM push_subscriptions WHERE id=? AND user_id=?',id,userId);}
export async function pushStatus(db,env,userId) {
  const devices=await db.all('SELECT id,enabled,last_status,last_at,last_http_status,last_error FROM push_subscriptions WHERE user_id=?',userId);
  const counts=await db.all('SELECT p.status,count(*) AS count FROM push_outbox p JOIN push_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=? GROUP BY p.status',userId);
  return {configured:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_JWK),publicKey:env.VAPID_PUBLIC_KEY||'',devices,counts:Object.fromEntries(counts.map(row=>[row.status,row.count]))};
}
export async function vapidAuthorization(endpoint,env) {
  const header=pushBase64(pushEncoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const payload=pushBase64(pushEncoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:env.SITE_ORIGIN})));
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.VAPID_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,pushEncoder.encode(`${header}.${payload}`));
  return `vapid t=${header}.${payload}.${pushBase64(new Uint8Array(signature))},k=${env.VAPID_PUBLIC_KEY}`;
}
async function deliverPush(record,db,env) {
  if(!String(env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).includes(record.user_id))return 'revoked';
  let status='failed', httpStatus=null, errorCode=null, stage='configuration', provider='unknown';
  try {
    const endpoint=await decryptEndpoint(record.encrypted_endpoint,env);if(!validPushEndpoint(endpoint))throw new Error('INVALID_PUSH_ENDPOINT');
    provider=new URL(endpoint).hostname;
    // A payload-free wake-up is sufficient. The service worker always shows a visible generic notification.
    // No customer information or private inbox URL is sent to the browser push service.
    const authorization=await vapidAuthorization(endpoint,env);stage='network';
    // Workers supports manual/follow, not error. Never follow redirects carrying VAPID credentials.
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:authorization,TTL:'86400',Urgency:'high','Content-Length':'0'},body:new Uint8Array(),redirect:'manual',signal:AbortSignal.timeout(10000)});
    httpStatus=response.status;
    status=response.ok?'accepted':[404,410].includes(response.status)?'expired':'failed';
    if(!response.ok){
      errorCode=`HTTP_${response.status}`;
      // Only retain a bounded provider reason code, never an endpoint or response payload.
      try {const body=await response.json();if(typeof body.reason==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(body.reason))errorCode=body.reason;}catch{}
    }else await response.body?.cancel();
  } catch(err) {
    status='failed';errorCode=stage==='configuration'?'PUSH_CONFIGURATION_ERROR':err?.name==='TimeoutError'?'PUSH_TIMEOUT':'PUSH_NETWORK_ERROR';
    const detail=String(err?.message||'').replace(/https?:\/\/\S+/g,'[url]').replace(/[A-Za-z0-9_+/=-]{32,}/g,'[redacted]').slice(0,180);
    console.error('push_exception',JSON.stringify({stage,provider,code:errorCode,name:err?.name,detail}));
  }
  if(status!=='accepted')console.error('push_delivery_failed',JSON.stringify({provider,status,httpStatus,errorCode}));
  await db.run('UPDATE push_subscriptions SET last_status=?,last_at=?,last_http_status=?,last_error=?,enabled=CASE WHEN ?=\'expired\' THEN 0 ELSE enabled END WHERE id=?',status,Date.now(),httpStatus,errorCode,status,record.id);
  return status;
}
export async function sendInquiryPush(db,env,inquiryId=null,userId=null) {
  if(!env.VAPID_PRIVATE_JWK)return;
  const rows=inquiryId
    ? await db.all('SELECT p.id AS outbox_id,s.* FROM push_outbox p JOIN push_subscriptions s ON s.id=p.subscription_id WHERE p.inquiry_id=? AND p.status=\'pending\' AND s.enabled=1 LIMIT 10',inquiryId)
    : await db.all('SELECT p.id AS outbox_id,s.* FROM push_outbox p JOIN push_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=? AND s.enabled=1 AND p.status IN (\'pending\',\'failed\') ORDER BY p.updated_at LIMIT 10',userId);
  await Promise.all(rows.map(async row=>{const lock=await db.run('UPDATE push_outbox SET status=\'sending\',attempts=attempts+1,updated_at=? WHERE id=? AND status IN (\'pending\',\'failed\')',Date.now(),row.outbox_id);if(!lock.meta.changes)return;const state=await deliverPush(row,db,env);await db.run('UPDATE push_outbox SET status=?,updated_at=? WHERE id=?',state,Date.now(),row.outbox_id);}));
}
export async function testPush(db,env,userId,id) {
  const row=await db.one('SELECT * FROM push_subscriptions WHERE id=? AND user_id=? AND enabled=1',id,userId);if(!row)throw new Error('PUSH_DEVICE_MISSING');
  const claim=await db.run('UPDATE push_subscriptions SET last_at=? WHERE id=? AND (last_at IS NULL OR last_at<?)',Date.now(),id,Date.now()-30000);if(!claim.meta.changes)throw new Error('PUSH_TEST_RATE_LIMIT');
  const status=await deliverPush(row,db,env);
  const detail=await db.one('SELECT last_http_status,last_error FROM push_subscriptions WHERE id=? AND user_id=?',id,userId);
  return {status,httpStatus:detail.last_http_status,errorCode:detail.last_error};
}
