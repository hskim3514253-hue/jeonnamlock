const ANALYTICS_DAY = 86400000;
const ANALYTICS_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class AnalyticsError extends Error { constructor(status,message){super(message);this.status=status;} }
export function analyticsBucket(nowMs) {
  const shifted=new Date(nowMs+9*3600000);
  const date=shifted.toISOString().slice(0,10),hour=shifted.getUTCHours();
  return {date,hour,nextMidnightMs:Date.parse(date+'T00:00:00+09:00')+ANALYTICS_DAY};
}
const analyticsHex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
async function analyticsSign(salt,value){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('analytics-visitor-v1:'+salt),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return analyticsHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));
}
function analyticsEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function analyticsVisitor(request,salt,nowMs){
  const {date,nextMidnightMs}=analyticsBucket(nowMs);
  const raw=(request.headers.get('Cookie')||'').slice(0,8192).split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-jn-visit='))?.slice(16);
  let id,renew=true;
  if(raw){const [version,day,uuid,signature,...extra]=raw.split('.');if(version==='1'&&day===date&&ANALYTICS_UUID.test(uuid)&&/^[a-f0-9]{64}$/.test(signature||'')&&!extra.length&&analyticsEqual(signature,await analyticsSign(salt,`cookie:${day}:${uuid}`))){id=uuid;renew=false;}}
  id??=crypto.randomUUID();
  const key=await analyticsSign(salt,`visitor:${date}:${id}`);
  const cookie=renew?`__Host-jn-visit=1.${date}.${id}.${await analyticsSign(salt,`cookie:${date}:${id}`)}; Path=/; Max-Age=${Math.max(1,Math.ceil((nextMidnightMs-nowMs)/1000))}; Expires=${new Date(nextMidnightMs).toUTCString()}; Secure; HttpOnly; SameSite=Lax`:null;
  return {key,cookie};
}
async function analyticsState(db,nowMs){
  await db.run('INSERT OR IGNORE INTO analytics_state (key,value) VALUES (?,?)','started',String(nowMs));
  const today=analyticsBucket(nowMs).date;
  const clean=await db.one('SELECT value FROM analytics_state WHERE key=?','cleaned');
  if(clean?.value!==today){
    const cutoff=analyticsBucket(nowMs-89*ANALYTICS_DAY).date;
    await db.batch([
      ['DELETE FROM analytics_events WHERE day < ?',cutoff],
      ['DELETE FROM rate_limits WHERE key LIKE ? AND expires_at < ?','analytics:%',nowMs],
      ['INSERT INTO analytics_state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','cleaned',today]
    ]);
  }
  return Number((await db.one('SELECT value FROM analytics_state WHERE key=?','started')).value);
}
async function analyticsBody(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new AnalyticsError(415,'지원하지 않는 요청 형식입니다.');
  const declared=request.headers.get('Content-Length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>1024))throw new AnalyticsError(413,'통계 요청이 너무 큽니다.');
  if(!request.body)throw new AnalyticsError(400,'조회 정보를 확인해주세요.');
  const reader=request.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw new AnalyticsError(413,'통계 요청이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AnalyticsError(400,'조회 정보를 확인해주세요.');}
  if(!body||Array.isArray(body)||!ANALYTICS_UUID.test(body.eventId)||Object.keys(body).some(k=>k!=='eventId'))throw new AnalyticsError(400,'조회 정보를 확인해주세요.');
  return body;
}
export async function recordPageview(request,{db,salt,nowMs,isAdmin}){
  const headers={'Cache-Control':'no-store'};
  if(isAdmin||/bot|crawler|spider|headless|lighthouse|preview|facebookexternalhit/i.test(request.headers.get('User-Agent')||'')||/prefetch|prerender/i.test((request.headers.get('Purpose')||'')+' '+(request.headers.get('Sec-Purpose')||'')))return new Response(null,{status:204,headers});
  const body=await analyticsBody(request);
  if(!salt)throw new AnalyticsError(503,'방문 통계가 아직 준비되지 않았습니다.');
  const window=Math.floor(nowMs/60000);
  const limitKey='analytics:'+await analyticsSign(salt,`limit:${window}:${request.headers.get('CF-Connecting-IP')||'unknown'}`);
  const limit=await db.one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',limitKey,(window+2)*60000);
  if(limit.count>120)throw new AnalyticsError(429,'잠시 후 다시 시도해주세요.');
  if(await db.one('SELECT event_id FROM analytics_events WHERE event_id=?',body.eventId))return new Response(null,{status:204,headers});
  const visitor=await analyticsVisitor(request,salt,nowMs),bucket=analyticsBucket(nowMs);
  await db.batch([
    ['INSERT OR IGNORE INTO analytics_state (key,value) VALUES (?,?)','started',String(nowMs)],
    ['INSERT OR IGNORE INTO analytics_events (event_id,day,hour,visitor_key,received_at) VALUES (?,?,?,?,?)',body.eventId,bucket.date,bucket.hour,visitor.key,nowMs]
  ]);
  await analyticsState(db,nowMs);
  if(visitor.cookie)headers['Set-Cookie']=visitor.cookie;
  return new Response(null,{status:204,headers});
}
export async function readAnalytics(db,date,nowMs){
  const current=analyticsBucket(nowMs),earliest=analyticsBucket(nowMs-89*ANALYTICS_DAY).date;
  date??=current.date;
  const parsed=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date+'T00:00:00Z'):NaN;
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)throw new AnalyticsError(400,'올바른 날짜를 YYYY-MM-DD 형식으로 선택해주세요.');
  if(date>current.date)throw new AnalyticsError(400,'미래 날짜의 통계는 조회할 수 없습니다. 오늘 또는 이전 날짜를 선택해주세요.');
  if(date<earliest)throw new AnalyticsError(400,'보관 기간이 지난 날짜입니다. 최근 90일 이내의 날짜를 선택해주세요.');
  const collectionStartedAt=await analyticsState(db,nowMs);
  const rows=await db.all('SELECT hour,COUNT(*) pageviews,COUNT(DISTINCT visitor_key) visitors FROM analytics_events WHERE day=? GROUP BY hour',date);
  const daily=await db.one('SELECT COUNT(*) pageviews,COUNT(DISTINCT visitor_key) visitors FROM analytics_events WHERE day=?',date);
  return {date,timeZone:'Asia/Seoul',collectionStartedAt,asOf:nowMs,status:date<analyticsBucket(collectionStartedAt).date?'before_collection':'collected',daily:{visitors:Number(daily.visitors),pageviews:Number(daily.pageviews)},hours:Array.from({length:24},(_,hour)=>{const row=rows.find(x=>x.hour===hour);return {hour,visitors:Number(row?.visitors||0),pageviews:Number(row?.pageviews||0),pending:date===current.date&&hour>current.hour};})};
}
