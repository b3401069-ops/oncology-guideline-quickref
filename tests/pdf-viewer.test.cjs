const test = require('node:test');
const assert = require('node:assert/strict');

// Windows checkouts may use CRLF; structural regexes below assume LF.
const html = require('node:fs').readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

test('PDF 開啟走 App 內檢視器，不再依賴 blob URL 的 #page', () => {
  // 手機瀏覽器對 blob:...#page=N 支援不可靠，跳頁會停在第 1 頁
  assert.ok(/window\.openPdf = \(key, page\) => \{[\s\S]{0,400}navigate\('\/pdf\/'/.test(html),
    'openPdf 應導向 App 內檢視器路由');
  assert.ok(!/openPdf = async[\s\S]{0,400}'#page='/.test(html),
    'openPdf 不應再組出 blob #page 連結');
});

test('保留外部開啟做為備援', () => {
  assert.match(html, /window\.openPdfExternal = async \(key\)/);
  assert.match(html, /createObjectURL\(blob\)/);
});

test('檢視器路由可解析頁碼', () => {
  assert.match(html, /parts\[0\] === 'pdf' && parts\[1\]/);
  assert.match(html, /routeParams\.pdfPage = Math\.max\(1, Number\(parts\[2\]\) \|\| 1\)/);
});

test('離開檢視器時釋放 PDF 文件', () => {
  assert.match(html, /if \(!currentRoute\.startsWith\('\/pdf\/'\)\) await releasePdfViewer\(\)/);
  assert.match(html, /async function releasePdfViewer\(\)[\s\S]{0,300}pdfViewer\.doc\.destroy\(\)/);
});

test('先掛上 canvas 再等待渲染完成', () => {
  // PDF.js 以 requestAnimationFrame 漸進渲染；等 promise 才顯示會讓畫面卡在載入中
  const paintBody = html.match(/const paint = async \(\) => \{[\s\S]*?\n      \};/)?.[0] || '';
  assert.ok(paintBody, '找不到 paint()');
  const appendAt = paintBody.indexOf('stage.appendChild(canvas)');
  const awaitAt = paintBody.indexOf('await pdfViewer.task.promise');
  assert.ok(appendAt > 0 && awaitAt > 0, 'paint() 應同時包含掛載與等待');
  assert.ok(appendAt < awaitAt, 'canvas 必須在等待渲染前就掛上');
});

test('檢視器標示頁碼基準，避免與 NCCN 印刷頁碼混淆', () => {
  assert.match(html, /實體頁碼/);
});
