import {generateCatalog,products} from './scripts/catalog.mjs';
import {basePublicFiles} from './scripts/public-files.mjs';
import {productPages,renderSitemap} from './scripts/product-pages.mjs';
await generateCatalog();
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorker} from './src/worker.mjs';
import {createLocalEnvironment} from './scripts/local-adapters.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
const local=await createLocalEnvironment(path.join(directory,'.local-data'));
const publicFiles=new Set(basePublicFiles);
for (const product of products) for (const image of product.images) publicFiles.add(image.src);
const types={html:'text/html; charset=utf-8',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',pdf:'application/pdf',png:'image/png',webp:'image/webp',jpg:'image/jpeg',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const pages=productPages(products),sitemap=renderSitemap(products,new Date().toISOString().slice(0,10));
const worker=createWorker(async pathname=>{if(pages.has(pathname))return new Response(pages.get(pathname),{headers:{'Content-Type':types.html,'Cache-Control':'no-store'}});if(pathname==='/sitemap.xml')return new Response(sitemap,{headers:{'Content-Type':types.xml,'Cache-Control':'no-store'}});const name=pathname.slice(1);if(!publicFiles.has(name))return new Response('Not found',{status:404});return new Response(await readFile(path.join(directory,'dist',name)),{headers:{'Content-Type':types[name.split('.').pop()],'Cache-Control':'no-store'}});});
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,local.env.SITE_ORIGIN);
    // This mock identity exists only in the loopback development adapter, never the Worker build.
    if(url.pathname==='/signin-with-chatgpt'){res.writeHead(302,{'Set-Cookie':'local_owner=1; HttpOnly; SameSite=Lax; Path=/','Location':'/admin'});res.end();return;}
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(key.startsWith('oai-authenticated-')||key==='host'||key==='cf-connecting-ip')continue;if(value)headers.set(key,Array.isArray(value)?value.join(','):value);}
    if((req.headers.cookie||'').split(';').some(cookie=>cookie.trim()==='local_owner=1')){headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','owner@local.test');}
    headers.set('CF-Connecting-IP','127.0.0.1');
    const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req),duplex:'half'});
    const response=await worker.fetch(request,local.env,{waitUntil:promise=>promise.catch(()=>console.error('LOCAL_BACKGROUND_FAILED'))});
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch(error){console.error(error.name,error.message);res.writeHead(500);res.end('Local service error');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
