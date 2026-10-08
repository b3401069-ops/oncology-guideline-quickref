const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

global.window = global;
require('../quality-audit-page.js');

const helpers = {
  esc: value => String(value || ''),
  jsStr: value => String(value || ''),
  safePdfPage: value => Number(value) || 1,
  renderNav: () => '<nav></nav>',
};

test('quality audit page keeps structural, clinical, review, and treatment checks separate', () => {
  const html = global.QUALITY_AUDIT_PAGE.render({
    cards: [{ id: 'breast_cancer', zhName: '乳癌' }],
    documents: [],
    cancerAudit: { ready: 0, total: 1, withScenarios: 1, attention: [], withoutScenarios: [] },
    scenarioAudit: { pass: 1, total: 1, attention: [] },
    reviewAudit: { total: 0, items: [] },
    treatmentAudit: { total: 0, linked: 0, vocabularyOnly: 0, unmapped: 0, attention: [] },
  }, helpers);
  for (const label of ['全癌別資料與標準情境', 'TFDA／健保待核對佇列', '療程名稱與台灣資料對接', '重新稽核']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /工程檢索檢查，不代表醫師已完成臨床驗收/);
  assert.match(html, /既有情境工程比對通過/);
  assert.match(html, /未連結不代表未核准或未給付/);
});

test('app routes and links to the quality audit page', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /currentRoute === '\/quality-audit'/);
  assert.match(html, /async function renderQualityAudit\(app\)/);
  assert.ok((html.match(/navigate\('\/quality-audit'\)/g) || []).length >= 2);
});

test('quality audit offers direct record repair and treatment-name mapping controls', () => {
  const html = global.QUALITY_AUDIT_PAGE.render({
    cards: [{ id: 'breast_cancer', zhName: '乳癌' }],
    documents: [],
    drugMappings: [{ id: 'm1', term: 'ABC', kind: 'regimen', components: ['drug-a'] }],
    cancerAudit: { ready: 1, total: 1, withScenarios: 1, attention: [], withoutScenarios: [] },
    scenarioAudit: { pass: 1, total: 1, attention: [] },
    reviewAudit: { total: 2, items: [
      { type: 'tfda_record', id: 't1', title: 'TFDA item', reasons: ['待核對'] },
      { type: 'nhi_record', id: 'n1', cancerId: 'breast_cancer', title: 'NHI item', reasons: ['待核對'] },
    ] },
    treatmentAudit: { total: 1, linked: 0, vocabularyOnly: 0, unmapped: 1, attention: [
      { label: 'Unknown regimen', cancerIds: ['breast_cancer'], components: [], status: 'unmapped' },
    ] },
  }, helpers);
  assert.match(html, /quality-edit-tfda/);
  assert.match(html, /quality-edit-nhi/);
  assert.match(html, /修正名稱/);
  assert.match(html, /自訂療程名稱修正 · 1/);
  assert.match(html, /drug-mapping-save/);
});

test('app persists drug mappings in IndexedDB and metadata backups', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /const DB_VERSION = 4/);
  assert.match(html, /createObjectStore\('drugMappings'/);
  assert.match(html, /BACKUP_STORES = \[[^\]]*'drugMappings'/);
  assert.match(html, /DRUG_VOCABULARY\.configure\(await dbGetAll\('drugMappings'\)\)/);
});
