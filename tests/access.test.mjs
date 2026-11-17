import test from 'node:test';
import assert from 'node:assert/strict';
import {accessIdentity} from '../src/access.mjs';
import {createWorker} from '../src/worker.mjs';

const b64=value=>Buffer.from(value).toString('base64url');
async function issuer(team='https://jn-test.cloudflareaccess.com'){
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'key-1'};
  let fetched=0;
  const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:'aud-123',ACCESS_FETCH:async url=>{fetched++;assert.equal(url,`${team}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});}};
  const sign=async(claims={},{kid='key-1',alg='RS256',key=pair.privateKey}={})=>{
    const head=b64(JSON.stringify({alg,kid,typ:'JWT'})),body=b64(JSON.stringify({iss:team,aud:['aud-123'],email:'Owner@Example.com',exp:Math.floor(Date.now()/1000)+600,...claims}));
    return `${head}.${body}.${b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(`${head}.${body}`))))}`;
  };
  return {env,sign,pair,fetches:()=>fetched};
}
const request=(token,via='header')=>new Request('https://example.test/api/session',{headers:via==='header'?{'Cf-Access-Jwt-Assertion':token}:{Cookie:`other=1; CF_Authorization=${token}`}});

test('a valid Access token identifies the admin by lower-cased email, from the header or the cookie',async()=>{
  const {env,sign,fetches}=await issuer('https://jn-a.cloudflareaccess.com');
  assert.deepEqual(await accessIdentity(request(await sign()),env),{id:'owner@example.com',email:'owner@example.com'});
  assert.deepEqual(await accessIdentity(request(await sign(),'cookie'),env),{id:'owner@example.com',email:'owner@example.com'});
  assert.equal(fetches(),1,'signing keys are cached');
});
test('tokens that are expired, for another audience or issuer, unsigned or forged are refused',async()=>{
  const {env,sign}=await issuer('https://jn-b.cloudflareaccess.com');
  const other=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const good=await sign();
  const [head,,signature]=good.split('.');
  const swapped=`${head}.${b64(JSON.stringify({iss:env.ACCESS_TEAM_DOMAIN,aud:['aud-123'],email:'attacker@example.com',exp:Math.floor(Date.now()/1000)+600}))}.${signature}`;
  for(const token of [await sign({exp:Math.floor(Date.now()/1000)-5}),await sign({aud:['someone-else']}),await sign({iss:'https://evil.cloudflareaccess.com'}),await sign({},{key:other.privateKey}),await sign({},{kid:'unknown'}),await sign({email:undefined}),swapped,`${b64('{"alg":"none","kid":"key-1"}')}.${good.split('.')[1]}.`,'not-a-token',''])
    assert.equal(await accessIdentity(request(token),env),null);
});
test('nothing is trusted until Access is configured, and Sites headers mean nothing on this host',async()=>{
  const {sign}=await issuer('https://jn-c.cloudflareaccess.com');
  assert.equal(await accessIdentity(request(await sign()),{}),null);
  assert.equal(await accessIdentity(request(await sign()),{ACCESS_TEAM_DOMAIN:'https://example.com',ACCESS_AUD:'aud-123'}),null);
  const worker=createWorker(async()=>new Response('site'),{identify:accessIdentity,signInUrl:'/admin'});
  const spoofed=await worker.fetch(new Request('https://example.test/api/session',{headers:{'oai-authenticated-user-id':'local-owner','oai-authenticated-user-email':'owner@example.com'}}),{ADMIN_USER_IDS:'local-owner,owner@example.com'});
  assert.deepEqual(await spoofed.json(),{user:null,isAdmin:false,adminConfigured:true,signInUrl:'/admin'});
});
test('the worker grants admin only to listed emails carrying a valid Access token',async()=>{
  const {env,sign}=await issuer('https://jn-d.cloudflareaccess.com');
  const worker=createWorker(async()=>new Response('site'),{identify:accessIdentity,signInUrl:'/admin'});
  const session=async(token,admins)=>(await worker.fetch(request(token),{...env,ADMIN_USER_IDS:admins})).json();
  assert.equal((await session(await sign(),'owner@example.com')).isAdmin,true);
  assert.equal((await session(await sign({email:'stranger@example.com'}),'owner@example.com')).isAdmin,false);
  assert.equal((await session(await sign(),'')).isAdmin,false);
});
test('the Cloudflare entry serves files through the ASSETS binding with the worker headers',async()=>{
  const {default:worker}=await import('../cloudflare/worker.mjs');
  const asked=[];
  const env={ASSETS:{fetch:async req=>{asked.push(new URL(req.url).pathname);return new Response('<h1>home</h1>',{headers:{'Content-Type':'text/html; charset=utf-8'}});}}};
  const page=await worker.fetch(new Request('https://jeonnamlock.com/'),env);
  assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/default-src 'self'/);
  await worker.fetch(new Request('https://jeonnamlock.com/admin'),env);
  assert.deepEqual(asked,['/index.html','/admin.html']);
});
