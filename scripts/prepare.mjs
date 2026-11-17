// Build step for the Node host: refresh the generated catalog markup and check that every file
// the server will serve is present. There are no packages to install.
import { generateCatalog, products, validateCatalog } from './catalog.mjs';
import { publicFiles } from './public-files.mjs';
import { access } from 'node:fs/promises';

validateCatalog(products);
await generateCatalog();
const files = [...publicFiles(products), 'login.html', 'login.js', 'login.css'];
for (const name of files) await access(new URL(`../dist/${name}`, import.meta.url));
console.log(`Ready: ${products.length} products, ${files.length} public files.`);
