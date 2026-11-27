// Builds the gallery into ../dist. Run "npm install" here once, then "npm run build".
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'src/entry.tsx')], outfile: path.join(here, '../dist/rail-gallery.js'),
  bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': here },
});
execFileSync(process.execPath, [path.join(here, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', path.join(here, 'src/gallery.css'), '-o', path.join(here, '../dist/rail-gallery.css'), '--minify'], { cwd: here, stdio: 'inherit' });
// Tailwind registers its --tw-* defaults with @property, which does nothing inside a shadow root.
// Its fallback block does the same job, so make that block unconditional.
const cssFile = path.join(here, '../dist/rail-gallery.css');
let css = readFileSync(cssFile, 'utf8');
const at = css.indexOf('@layer properties{@supports');
if (at < 0) throw new Error('Tailwind fallback block not found');
const open = css.indexOf('{*', at), start = at + '@layer properties{'.length;
let depth = 0, end = -1;
for (let i = open; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}' && --depth === 0) { end = i; break; } }
css = css.slice(0, start) + css.slice(open + 1, end) + css.slice(end + 1);
writeFileSync(cssFile, css);
console.log('gallery built');
