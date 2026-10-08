const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');

test('server keeps secret files private and fails closed when Gemini key is absent', async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const apiResponse = await fetch(baseUrl + '/api/clinical-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin', Origin: baseUrl },
    body: JSON.stringify({ cancer: {}, caseFields: [{}] }),
  });
  assert.equal(apiResponse.status, 503);
  assert.match((await apiResponse.json()).message, /GEMINI_API_KEY/);

  for (const pathname of ['/.env.local', '/.env.example', '/server.cjs', '/gemini-summary.cjs', '/.codex-remote-attachments/test.json', '/tests/clinical-matcher.test.cjs']) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 404, pathname + ' must not be served');
  }

  const indexResponse = await fetch(baseUrl + '/');
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /腫瘤指引快速查/);
});

test('AI endpoint rejects cross-origin, wrong media type, missing request marker and malformed bodies before calling AI', async (t) => {
  let calls = 0;
  const server = createServer({ configured: () => true, summarize: async () => { calls++; return { headline: 'test-only' }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin', Origin: base };
  const input = { cancer: { id: 'nsclc' }, caseFields: [{ key: 'stage', value: ['IIB'] }], evidence: [] };
  for (const [extra, status] of [[{ Origin: 'https://unrelated.example' }, 403], [{ 'Content-Type': 'text/plain' }, 415], [{ 'X-Clinical-Summary': '' }, 403]]) {
    const response = await fetch(base + '/api/clinical-summary', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(input) });
    assert.equal(response.status, status);
  }
  const malformed = await fetch(base + '/api/clinical-summary', { method: 'POST', headers, body: '{}' });
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
  const ok = await fetch(base + '/api/clinical-summary', { method: 'POST', headers, body: JSON.stringify(input) });
  assert.equal(ok.status, 200);
  assert.equal(calls, 1);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    require('node:http').get(base + '/', { headers: { Host: 'unrelated.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
});

test('AI endpoint limits duplicate concurrent requests without a real provider call', async (t) => {
  let resolveSummary;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const server = createServer({ configured: () => true, summarize: () => { entered(); return new Promise(resolve => { resolveSummary = resolve; }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const args = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin', Origin: base }, body: JSON.stringify({ cancer: {}, caseFields: [{ key: 'x', value: ['y'] }], evidence: [] }) };
  const first = fetch(base + '/api/clinical-summary', args);
  await started;
  const second = await fetch(base + '/api/clinical-summary', args);
  assert.equal(second.status, 429);
  resolveSummary({ headline: 'test-only' });
  assert.equal((await first).status, 200);
});

test('local rate limit rejects a sixth request before invoking the provider', async (t) => {
  let calls = 0;
  const server = createServer({ configured: () => true, summarize: async () => { calls++; return { headline: 'test-only' }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const args = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin', Origin: base }, body: JSON.stringify({ cancer: {}, caseFields: [{ key: 'x', value: ['y'] }], evidence: [] }) };
  for (let i = 0; i < 5; i++) assert.equal((await fetch(base + '/api/clinical-summary', args)).status, 200);
  assert.equal((await fetch(base + '/api/clinical-summary', args)).status, 429);
  assert.equal(calls, 5);
});

test('JSON body reader rejects malformed and oversized data', async () => {
  const { readJson } = require('../server.cjs');
  const { Readable } = require('node:stream');
  await assert.rejects(readJson(Readable.from([Buffer.from('{broken')])), { status: 400 });
  await assert.rejects(readJson(Readable.from([Buffer.alloc(512 * 1024 + 1)])), { status: 413 });
});

test('provider timeout returns a safe error without provider details', async (t) => {
  const server = createServer({ configured: () => true, summarize: async () => { throw Object.assign(new Error('DO-NOT-EXPOSE-provider-details'), { name: 'TimeoutError' }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/clinical-summary', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin', Origin: base }, body: JSON.stringify({ cancer: {}, caseFields: [{ key: 'x', value: ['y'] }], evidence: [] }) });
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /逾時/);
  assert.doesNotMatch(body, /DO-NOT-EXPOSE/);
});
