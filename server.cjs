'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { summarizeCase, validateInput } = require('./gemini-summary.cjs');
const { cloudConfig, createIapVerifier } = require('./cloud-auth.cjs');

const ROOT = __dirname;
const MAX_BODY_BYTES = 512 * 1024;
const STATIC_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.png', '.ico']);
const PUBLIC_FILES = new Set([
  'index.html', 'app-version.js', 'backup-format.js', 'branch-evidence.js', 'case-review.js',
  'case-state.js', 'case-workflow.js', 'clinical-matcher.js', 'clinical-scenarios.js',
  'clinical-templates.js', 'drug-vocabulary.js', 'guideline-quality.js', 'nccn-parser.js',
  'nhi-parser.js', 'nhi-selector.js', 'nhi-versioning.js', 'quality-audit-page.js',
  'quality-audit.js', 'reference-cases.js', 'sw.js', 'tfda-parser.js', 'tfda-registry.js',
  'manifest.json', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function loadLocalEnv() {
  const filename = path.join(ROOT, '.env.local');
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('請求內容過大'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('請求不是有效 JSON'), { status: 400 });
  }
}

async function handleClinicalSummary(request, response, summarize = summarizeCase, configured = () => !!process.env.GEMINI_API_KEY) {
  if (!configured()) {
    sendJson(response, 503, {
      error: 'Gemini 尚未設定',
      message: '請在專案根目錄的 .env.local 設定 GEMINI_API_KEY，然後重新啟動 npm start。',
    });
    return;
  }
  try {
    const input = await readJson(request);
    validateInput(input);
    const summary = await summarize(input);
    sendJson(response, 200, { summary, model: process.env.GEMINI_MODEL || 'gemini-3.7-flash' });
  } catch (error) {
    const status = ['TimeoutError', 'AbortError'].includes(error.name) ? 504 : Number(error.status) || 500;
    const publicStatus = status >= 400 && status < 500 ? status : 502;
    console.error('[Gemini summary] HTTP', status);
    sendJson(response, publicStatus, {
      error: '無法產生 AI 摘要',
      message: status === 429
        ? 'Gemini 使用量已達限制，請稍後再試。'
        : status === 400 || status === 413
          ? error.message
          : status === 504 ? 'Gemini 回應逾時；未自動重送，原本的規則式判讀仍可使用。'
            : 'Gemini 暫時無法回應；原本的規則式判讀仍可使用。',
    });
  }
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const filename = path.resolve(ROOT, decoded);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  const extension = path.extname(filename).toLowerCase();
  const parts = decoded.replace(/\\/g, '/').split('/');
  if (!PUBLIC_FILES.has(decoded) || parts.some(part => part.startsWith('.')) || parts.some(part => ['tests', 'docs', 'node_modules'].includes(part)) ||
      (!filename.startsWith(rootPrefix) && filename !== path.join(ROOT, 'index.html')) || !STATIC_EXTENSIONS.has(extension)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const content = await fsp.readFile(filename);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}

function createServer(options = {}) {
  const cloud = cloudConfig(options.env || process.env);
  const verifyIap = cloud && (options.verifyIap || createIapVerifier(cloud));
  let inFlight = false;
  let recentCalls = [];
  const server = http.createServer(async (request, response) => {
    const port = request.socket.localPort;
    const host = request.headers.host;
    if (cloud ? host !== cloud.host : ![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) {
      sendJson(response, 403, { message: '僅允許本機網址存取。' });
      return;
    }
    if (cloud) {
      let authorized = false;
      try { authorized = await verifyIap(request.headers['x-goog-iap-jwt-assertion']); } catch { /* fail closed */ }
      if (!authorized) { sendJson(response, 401, { message: '請使用已授權的 Google 帳號登入。' }); return; }
    }
    let url;
    try { url = new URL(request.url, 'http://' + host); }
    catch { sendJson(response, 400, { message: '請求網址格式不正確。' }); return; }
    if (request.method === 'POST' && url.pathname === '/api/clinical-summary') {
      const expectedOrigin = cloud ? cloud.origin : 'http://' + host;
      if ((cloud ? request.headers.origin !== expectedOrigin : request.headers.origin && request.headers.origin !== expectedOrigin) || request.headers['x-clinical-summary'] !== 'same-origin') {
        sendJson(response, 403, { message: '請從本機 App 確認傳送後再使用 Gemini。' });
        return;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
        sendJson(response, 415, { message: '只接受 application/json。' }); return;
      }
      recentCalls = recentCalls.filter(time => Date.now() - time < 60000);
      if (inFlight || recentCalls.length >= 5) {
        sendJson(response, 429, { message: '正在整理或請求過於頻繁，請稍後再試。' }); return;
      }
      inFlight = true;
      recentCalls.push(Date.now());
      try { await handleClinicalSummary(request, response, options.summarize, options.configured); }
      finally { inFlight = false; }
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD, POST' }).end('Method not allowed');
      return;
    }
    await serveStatic(request, response, url.pathname);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  if (!process.env.K_SERVICE && process.env.NODE_ENV !== 'production') loadLocalEnv();
  const cloud = cloudConfig();
  const port = Number(process.env.PORT) || 4173;
  createServer().listen(port, cloud ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`Oncology guideline app: ${cloud ? cloud.origin : `http://127.0.0.1:${port}`}`);
    console.log(process.env.GEMINI_API_KEY ? 'Gemini API: ready' : 'Gemini API: missing GEMINI_API_KEY');
  });
}

module.exports = { createServer, loadLocalEnv, readJson, serveStatic, PUBLIC_FILES };
