import {generateCatalog,products} from './catalog.mjs';
import {basePublicFiles} from './public-files.mjs';
await generateCatalog();
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const publicFiles = [...basePublicFiles];
for (const product of products) for (const image of product.images) if (!publicFiles.includes(image.src)) publicFiles.push(image.src);
const files = {};
const mime = {html:'text/html; charset=utf-8',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',pdf:'application/pdf',png:'image/png',webp:'image/webp',jpg:'image/jpeg',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
for (const name of publicFiles) {
  const bytes = await readFile(new URL(`../dist/${name}`, import.meta.url));
  const binary = /\.(png|jpg|webp|pdf)$/.test(name);
  files[`/${name}`] = { type: mime[name.split('.').pop()], binary, body: bytes.toString(binary ? 'base64' : 'utf8') };
}
const modules = await Promise.all(['product-index','prices','chat','db','push','analytics','worker'].map(async name => (await readFile(new URL(`../src/${name}.mjs`,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')));
const output = `const PUBLIC_FILES=${JSON.stringify(files)};\n${modules.join('\n')}\nexport default createWorker(async path => {const file=PUBLIC_FILES[path];if(!file)return new Response('찾을 수 없는 페이지입니다.',{status:404});const body=file.binary?Uint8Array.from(atob(file.body),x=>x.charCodeAt(0)):file.body;return new Response(body,{headers:{'Content-Type':file.type,'Cache-Control':file.binary?'public,max-age=86400':'no-cache'}});});\n`;
await mkdir(new URL('../dist/server/', import.meta.url), {recursive:true});
await writeFile(new URL('../dist/server/index.js', import.meta.url), output);
await mkdir(new URL('../dist/.openai/', import.meta.url), {recursive:true});
await writeFile(new URL('../dist/.openai/hosting.json', import.meta.url), await readFile(new URL('../.openai/hosting.json', import.meta.url)));
console.log(`Worker built (${Math.round(Buffer.byteLength(output)/1024)} KB), ${publicFiles.length} public assets.`);
