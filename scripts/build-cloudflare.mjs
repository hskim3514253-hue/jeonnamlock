// Prepares cloudflare/public for `wrangler deploy`: only the files visitors may fetch are copied,
// so nothing else in dist/ (old product photos, server bundles) is published.
import { generateCatalog, products } from './catalog.mjs';
import { publicFiles } from './public-files.mjs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';

await generateCatalog();
const target = new URL('../cloudflare/public/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
let bytes = 0;
const files = publicFiles(products);
for (const name of files) {
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(name)) throw new Error(`Unexpected public file name: ${name}`);
  const source = new URL(`../dist/${name}`, import.meta.url);
  await cp(source, new URL(name, target));
  bytes += (await stat(source)).size;
}
console.log(`Cloudflare assets ready: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB.`);
