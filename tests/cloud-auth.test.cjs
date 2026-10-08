const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { cloudConfig, createIapVerifier } = require('../cloud-auth.cjs');
const { createServer, PUBLIC_FILES } = require('../server.cjs');
const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://app.example', IAP_AUDIENCE: '/projects/123/locations/asia-east1/services/test', ALLOWED_EMAIL: 'owner@example.com' };

test('production fails closed without explicit authentication and HTTPS configuration', () => {
  assert.equal(cloudConfig({}), null);
  for (const key of ['APP_ORIGIN', 'IAP_AUDIENCE', 'ALLOWED_EMAIL']) {
    assert.throws(() => cloudConfig({ ...env, [key]: '' }));
  }
  for (const origin of ['http://app.example', 'https://app.example/', 'https://user@app.example', 'https://app.example/path']) {
    assert.throws(() => cloudConfig({ ...env, APP_ORIGIN: origin }));
  }
  assert.throws(() => cloudConfig({ K_SERVICE: 'test' }));
});

test('IAP verifies real ES256 signature, issuer, audience, time and exact owner identity', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const client = new OAuth2Client();
  client.getIapPublicKeys = async () => ({ pubkeys: { test: publicKey.export({ type: 'spki', format: 'pem' }) } });
  const verify = createIapVerifier(cloudConfig(env), client);
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://cloud.google.com/iap', aud: env.IAP_AUDIENCE, sub: '123', email: env.ALLOWED_EMAIL, iat: now - 10, exp: now + 300 };
  function jwt(changes = {}, header = {}) {
    const body = [ { alg: 'ES256', kid: 'test', ...header }, { ...claims, ...changes } ].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    return body + '.' + sign('sha256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }
  assert.equal(await verify(jwt()), true);
  for (const changes of [{ email: 'other@example.com' }, { aud: 'wrong' }, { iss: 'wrong' }, { iat: now + 60 }, { exp: now - 60 }, { exp: now + 900 }, { sub: '' }]) {
    assert.equal(await verify(jwt(changes)), false, JSON.stringify(changes));
  }
  assert.equal(await verify(jwt({}, { alg: 'none' })), false);
  assert.equal(await verify(jwt({}, { kid: 'unknown' })), false);
  assert.equal(await verify(jwt().slice(0, -10) + 'AAAAAAAAAA'), false);
  assert.equal(await verify(undefined), false);
  assert.equal(await verify('garbage'), false);
});

test('cloud serves neither app nor API without verified IAP; rejects wrong host, missing/cross origin', async (t) => {
  let calls = 0;
  const server = createServer({ env, configured: () => true, verifyIap: async token => token === 'test-authorized', summarize: async () => { calls++; return {}; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(path = '/', extras = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = require('node:http').request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: { Host: 'app.example', ...extras } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end(method === 'POST' ? JSON.stringify({ cancer: {}, caseFields: [{ key: 'x', value: ['y'] }], evidence: [] }) : undefined);
    });
  }
  assert.equal(await request(), 401);
  assert.equal(await request('/api/clinical-summary', {}, 'POST'), 401);
  assert.equal(await request('/', { 'x-goog-authenticated-user-email': env.ALLOWED_EMAIL }), 401);
  const headers = { 'x-goog-iap-jwt-assertion': 'test-authorized', 'Content-Type': 'application/json', 'X-Clinical-Summary': 'same-origin' };
  assert.equal(await request('/', headers), 200);
  assert.equal(await request('/', { ...headers, Host: 'evil.example' }), 403);
  for (const path of ['/package.json', '/package-lock.json', '/.env.local', '/cloud-auth.cjs', '/.codex-remote-attachments/patient.json']) assert.equal(await request(path, headers), 404);
  assert.equal(await request('/api/clinical-summary', headers, 'POST'), 403);
  assert.equal(await request('/api/clinical-summary', { ...headers, Origin: 'https://evil.example' }, 'POST'), 403);
  assert.equal(calls, 0);
  assert.equal(await request('/api/clinical-summary', { ...headers, Origin: env.APP_ORIGIN }, 'POST'), 200);
  assert.equal(calls, 1);
});

test('deployment allowlists contain all public assets but no credentials, PDFs or attachments', () => {
  const fs = require('node:fs');
  const docker = fs.readFileSync('.dockerignore', 'utf8');
  assert.equal(docker, fs.readFileSync('.gcloudignore', 'utf8'));
  for (const file of PUBLIC_FILES) assert.ok(docker.split(/\r?\n/).includes('!' + file), file);
  for (const asset of [...fs.readFileSync('sw.js', 'utf8').matchAll(/'\.\/([^']+)'/g)].map(m => m[1])) assert.ok(PUBLIC_FILES.has(asset), asset);
  for (const line of docker.split(/\r?\n/).filter(x => x.startsWith('!'))) assert.doesNotMatch(line, /\.env|\.pdf|attachments|\.git|tests|docs/);
});
