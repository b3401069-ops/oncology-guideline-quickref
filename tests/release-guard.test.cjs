const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// Service Worker 對模組採 cache-first，ONCOLOGY_APP_VERSION 是唯一的破快取機制。
// 忘記更新版本就會讓使用者拿到「新的 index.html + 舊的模組」。
const CACHE_BUSTED_FILES = [
  'index.html', 'sw.js', 'clinical-templates.js', 'clinical-matcher.js', 'clinical-scenarios.js',
  'nccn-parser.js', 'nhi-parser.js', 'nhi-selector.js', 'nhi-versioning.js',
  'case-state.js', 'backup-format.js', 'guideline-quality.js', 'tfda-registry.js',
];

test('service worker 的快取名稱綁定 app 版本', () => {
  const sw = read('sw.js');
  assert.match(sw, /CACHE_NAME = 'oncology-guideline-' \+ globalThis\.ONCOLOGY_APP_VERSION/);
  assert.match(read('app-version.js'), /ONCOLOGY_APP_VERSION = '[\d.]+'/);
});

test('所有需要破快取的檔案都在 service worker 的預先快取清單中', () => {
  const sw = read('sw.js');
  for (const file of CACHE_BUSTED_FILES) {
    if (file === 'sw.js') continue;
    assert.ok(sw.includes("'./" + file + "'"), 'sw.js 的 ASSETS 缺少 ' + file);
  }
});

test('若模組有變更，app-version.js 必須一起更新', () => {
  let changed;
  try {
    // 與上一個 commit 比較；非 git 環境（例如打包後）則跳過
    changed = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return;
  }
  const touchedCacheBusted = changed.some(file => CACHE_BUSTED_FILES.includes(file));
  if (!touchedCacheBusted) return;
  assert.ok(changed.includes('app-version.js'),
    '這次變更動到 ' + changed.filter(f => CACHE_BUSTED_FILES.includes(f)).join('、') +
    '，但沒有更新 app-version.js；使用者會拿到混版的快取');
});

test('備份匯入會驗證 NCCN 巢狀頁碼，inline handler 不使用原始值', () => {
  const html = read('index.html');
  assert.match(html, /function validateDocumentStructure\(item\)/);
  assert.match(html, /Number\.isSafeInteger\(pageNumber\)/);
  assert.match(html, /const safePdfPage = \(value\)/);
  assert.doesNotMatch(html, /openPdf\('\$\{doc\.storageKey\}/);
  assert.doesNotMatch(html, /\+ doc\.id \+/);
});
