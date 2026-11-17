// Entry point for the owner's own Cloudflare account (wrangler deploy).
// Static files are served from the ASSETS binding instead of being inlined into the script,
// and admins are identified by Cloudflare Access rather than by ChatGPT Sites headers.
import { createWorker } from '../src/worker.mjs';
import { accessIdentity } from '../src/access.mjs';

export default createWorker(
  (path, env, request) => env.ASSETS.fetch(new Request(new URL(path, request.url), { method: 'GET', headers: { 'Accept-Encoding': request.headers.get('Accept-Encoding') || '' } })),
  { identify: accessIdentity, signInUrl: '/admin' }
);
