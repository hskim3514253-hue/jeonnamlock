import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../src/worker.mjs';
const legacy = 'https://jeonnam-lock-studio.hskim3514253.chatgpt.site';
const official = 'https://jeonnamlock.com';
const worker = createWorker(async () => new Response('site'));
const env = {SITE_ORIGIN: official, DB: {prepare() { throw new Error('Unexpected database access'); }}};

test('old customer links reach the official form before collecting contact details', async () => {
  for (const method of ['GET','HEAD']) {
    const response = await worker.fetch(new Request(`${legacy}/?utm_source=kakao`, {method}), env);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('Location'), 'https://jeonnamlock.com/?utm_source=kakao');
  }
  const index = await worker.fetch(new Request(`${legacy}/index.html?utm_source=naver`), env);
  assert.equal(index.headers.get('Location'), 'https://jeonnamlock.com/?utm_source=naver');
});

test('canonical redirect does not loop or move admin/assets/local preview', async () => {
  for (const url of [`${official}/`, `${legacy}/admin`, `${legacy}/admin.html`, `${legacy}/app.js`, 'http://127.0.0.1:4173/']) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('legacy or third-party writes stay rejected rather than forwarding customer data', async () => {
  for (const origin of [legacy, 'https://evil.test']) {
    const response = await worker.fetch(new Request(`${legacy}/api/quotes`, {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env);
    assert.equal(response.status,403);
    assert.equal(response.headers.get('Location'),null);
  }
});
