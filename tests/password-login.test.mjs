import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWorker} from '../src/worker.mjs';
import {createLocalEnvironment} from '../scripts/local-adapters.mjs';
import {passwordIdentity,passwordLogin,passwordLogout,passwordLoginReady} from '../src/password-login.mjs';

async function fixture(t,extra={}){
  const directory=fileURLToPath(new URL(`../.sites-runtime/login-${crypto.randomUUID()}/`,import.meta.url));
  await mkdir(directory,{recursive:true});
  const local=await createLocalEnvironment(directory,'https://example.test');
  const env={...local.env,ADMIN_USER_IDS:'owner',ADMIN_PASSWORD:'correct horse battery',SESSION_SECRET:'s'.repeat(32),...extra};
  t.after(()=>local.close());
  const login=(password,headers={})=>passwordLogin(new Request('https://example.test/api/login',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.5',...headers},body:JSON.stringify({password})}),env);
  const cookieOf=response=>response.headers.getSetCookie()[0]?.split(';')[0]||'';
  return {env,login,cookieOf};
}
const withCookie=cookie=>new Request('https://example.test/api/session',{headers:cookie?{Cookie:`a=1; ${cookie}`}:{}});

test('the right password signs the owner in with a protected cookie that the worker accepts',async t=>{
  const {env,login,cookieOf}=await fixture(t);
  const response=await login('correct horse battery');
  assert.equal(response.status,200);
  const raw=response.headers.getSetCookie()[0];
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(raw.includes(flag),flag);
  assert.ok(raw.startsWith('__Host-jn-admin='));
  assert.deepEqual(await passwordIdentity(withCookie(cookieOf(response)),env),{id:'owner',email:''});
  const worker=createWorker(async()=>new Response('site'),{identify:passwordIdentity,signInUrl:'/admin/login'});
  const session=await(await worker.fetch(withCookie(cookieOf(response)),env)).json();
  assert.equal(session.isAdmin,true);assert.equal(session.signInUrl,'/admin/login');
  assert.equal((await worker.fetch(new Request('https://example.test/api/admin/quotes',{headers:{Cookie:cookieOf(response)}}),env,{waitUntil(){}})).status,200);
  assert.equal((await worker.fetch(new Request('https://example.test/api/admin/quotes'),env,{waitUntil(){}})).status,401);
});
test('wrong passwords, other sites and missing configuration are refused',async t=>{
  const {env,login}=await fixture(t);
  assert.equal((await login('wrong password')).status,401);
  assert.equal((await login('')).status,401);
  assert.equal((await login('correct horse battery',{Origin:'https://evil.example'})).status,403);
  assert.equal((await login('correct horse battery',{'Sec-Fetch-Site':'cross-site'})).status,403);
  for(const broken of [{ADMIN_PASSWORD:''},{ADMIN_PASSWORD:'short'},{SESSION_SECRET:''}]){
    const local={...env,...broken};
    assert.equal(passwordLoginReady(local),false);
    assert.equal((await passwordLogin(new Request('https://example.test/api/login',{method:'POST',headers:{Origin:'https://example.test'},body:'{"password":"short"}'}),local)).status,503);
  }
});
test('forged, expired and stale cookies do not sign anyone in',async t=>{
  const {env,login,cookieOf}=await fixture(t);
  const good=cookieOf(await login('correct horse battery')),[name,value]=good.split('='),[expires,signature]=value.split('.');
  const later=String(Number(expires)+1000);
  for(const cookie of ['',`${name}=${later}.${signature}`,`${name}=${expires}.${'0'.repeat(64)}`,`${name}=${Date.now()-1000}.${signature}`,`${name}=garbage`,`jn-admin=${value}`])
    assert.equal(await passwordIdentity(withCookie(cookie),env),null,cookie);
  assert.equal(await passwordIdentity(withCookie(good),{...env,ADMIN_PASSWORD:'a different password'}),null,'changing the password signs devices out');
  assert.equal(await passwordIdentity(withCookie(good),{...env,SESSION_SECRET:'x'.repeat(32)}),null);
  assert.equal(await passwordIdentity(new Request('https://example.test/',{headers:{'oai-authenticated-user-id':'owner'}}),env),null);
});
test('repeated wrong passwords are locked out for a while, per visitor',async t=>{
  const {login}=await fixture(t);
  let last;for(let i=0;i<9;i++)last=await login('wrong password');
  assert.equal(last.status,429);
  assert.equal((await login('correct horse battery')).status,429,'the lock also holds for the right password');
  assert.equal((await login('correct horse battery',{'CF-Connecting-IP':'203.0.113.6'})).status,200);
});
test('logout clears the cookie',async t=>{
  const {env}=await fixture(t);
  const response=passwordLogout(new Request('https://example.test/api/logout',{method:'POST',headers:{Origin:'https://example.test'}}),env);
  assert.match(response.headers.getSetCookie()[0],/^__Host-jn-admin=; .*Max-Age=0/);
  assert.equal(passwordLogout(new Request('https://example.test/api/logout',{method:'POST',headers:{Origin:'https://evil.example'}}),env).status,403);
});
