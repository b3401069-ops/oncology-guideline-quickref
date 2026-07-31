const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('quick reference exposes editable treatment history and new-case clearing', () => {
  assert.match(html, /const renderTreatmentHistory = \(items, cancerId\) =>/);
  assert.match(html, /id="treatment-history-save"/);
  assert.match(html, /\.treatment-history-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(html, /CASE_STATE\.saveTreatment\(card\.id, \{/);
  assert.match(html, /window\._editTreatmentHistory/);
  assert.match(html, /window\._deleteTreatmentHistory/);
  assert.match(html, /CASE_STATE\.clear\(cancerId\)/);
});

test('selected treatment keeps NCCN, Taiwan approval, and NHI evidence separate', () => {
  assert.match(html, /治療依據分開看/);
  assert.match(html, />NCCN 指引</);
  assert.match(html, />台灣核准適應症</);
  assert.match(html, />健保給付</);
  assert.match(html, /不能由 NCCN 或健保狀態推定已核准/);
  assert.match(html, /尚未找到同名條文；這不代表沒有給付/);
});