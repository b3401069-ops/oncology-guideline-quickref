const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('quick reference keeps NCCN, TFDA, and NHI evidence separate', () => {
  assert.match(html, /治療依據分開看/);
  assert.match(html, /window\.TFDA_REGISTRY\.match\(tfdaRecords, selectedTreatment\.label, relatedIds\)/);
  assert.match(html, /同名或療程成分候選/);
  assert.match(html, /這不代表未核准/);
  assert.match(html, /這不代表沒有給付/);
});

test('selected treatments expose reasons, exclusions, missing data, and source pages', () => {
  for (const label of ['為何出現', '已套用的排除邏輯', '尚缺或需核對', '原始 NCCN 證據']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /selectedNccnSourceButtons/);
  assert.match(html, /openPdf\('\$\{jsStr\(item\.doc\.storageKey\)\}'/);
});

test('TFDA registry is routed, backed up, and visible from settings', () => {
  assert.match(html, /currentRoute === '\/tfda'/);
  assert.match(html, /BACKUP_STORES = \[[^\]]*'tfdaIndications'/s);
  assert.match(html, /管理 TFDA 適應症資料/);
  assert.match(html, /TFDA 藥品許可證與核定仿單/);
});

test('home dashboard lists actionable guideline health details', () => {
  for (const label of ['尚缺指引系列', '解析需要處理', '版本確認時效', '前往批次匯入']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /qualitySummary\.freshnessAttention/);
});
