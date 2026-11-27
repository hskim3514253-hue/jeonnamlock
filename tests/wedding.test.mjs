import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// The wedding app reads its folder once when it is first loaded, so the folder is set before the import.
const directory = fileURLToPath(new URL(`../.sites-runtime/wedding-${crypto.randomUUID()}/`, import.meta.url));
await mkdir(directory, {recursive: true});
process.env.WEDDING_DATA_DIR = directory;
const {default: wedding} = await import('../wedding/server.cjs');

const server = http.createServer((req, res) => wedding.handle(req, res, new URL(req.url, 'http://x').pathname));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
test.after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  return {status: response.status, data: await response.json().catch(() => null), headers: response.headers};
}

test('a couple who joins through a planner link is tied to that planner, who never sees money', async () => {
  const planner = (await call('POST', '/api/planners', {name: '정유나', company: '모먼트웨딩'})).data;
  const code = (await call('GET', '/api/planner', null, planner.token)).data.code;
  const admin = (await call('POST', '/api/weddings', {groom: '김도윤', bride: '이서연', date: '2027-03-20', ref: code})).data.adminToken;
  let wedding = (await call('GET', '/api/w', null, admin)).data.wedding;

  assert.equal((await call('GET', `/api/i/${wedding.slug}`)).status, 404, 'an unpublished invitation stays closed');
  assert.equal((await call('PUT', '/api/w', {venue: '그랜드웨딩홀', published: true}, admin)).status, 200);
  assert.equal((await call('POST', `/api/i/${wedding.slug}/rsvp`, {name: '박지훈', side: 'groom', attending: 'yes', count: 2, meal: true})).status, 201);

  const desk = wedding.deskToken;
  const cash = (await call('POST', '/api/w/entries', {side: 'groom', guestName: '박지훈', amount: 100000, method: 'cash', tickets: 2}, desk)).data;
  const transfer = (await call('POST', '/api/w/entries', {side: 'groom', guestName: '회사 동료', amount: 300000, method: 'transfer'}, admin)).data;
  assert.equal(cash.envelopeNumber, '신랑-001');
  assert.equal(transfer.envelopeNumber, '신랑-계좌001');

  assert.equal((await call('PUT', '/api/w', {groom: 'x'}, desk)).status, 403, 'the reception desk link cannot edit the invitation');
  assert.equal((await call('PUT', `/api/w/entries/${transfer.id}`, {amount: 1}, desk)).status, 403, 'the desk cannot change entries the couple made');
  assert.equal((await call('PUT', `/api/w/entries/${cash.id}`, {thanked: true}, desk)).data.thanked, false);
  assert.deepEqual(Object.keys((await call('GET', '/api/w', null, desk)).data.wedding).sort(), ['bride', 'date', 'entries', 'groom', 'guests', 'v']);

  const seen = JSON.stringify((await call('GET', '/api/planner', null, planner.token)).data);
  assert.ok(seen.includes('청첩장 공개') && seen.includes('30000'));
  assert.ok(!seen.includes('100000') && !seen.includes('박지훈'), 'planners get no gift amounts or guest names');

  wedding = (await call('GET', '/api/w', null, admin)).data.wedding;
  assert.equal(wedding.guests.length, 1);
  assert.equal(wedding.entries.length, 2);
});

test('pages are kept out of search engines and files outside the app cannot be read', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok((await page.text()).includes('href="common.css"'), 'pages use relative addresses so they work under /wedding/');
  for (const path of ['/..%2fserver.cjs', '/%2e%2e/server.cjs', '/uploads/..%2f..%2fdb.json', '/%E0%A4%A']) {
    const response = await fetch(base + path);
    assert.ok([400, 403, 404].includes(response.status), `${path} answered ${response.status}`);
  }
  assert.equal((await call('GET', '/api/admin', null, 'wrong')).status, 401);
  assert.equal((await call('PUT', '/api/w', {accounts: [{side: 'groom', bank: '국민', number: '1', kakaoLink: 'javascript:alert(1)'}]}, 'wrong')).status, 401);
});
