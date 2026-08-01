const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../drug-vocabulary.js');
require('../tfda-registry.js');
const registry = global.TFDA_REGISTRY;

const records = [
  {
    id: 't1',
    genericName: 'Pembrolizumab',
    brandName: 'Keytruda',
    aliases: ['吉舒達'],
    cancerIds: ['breast_cancer'],
    indication: '與化療併用於高風險早期三陰性乳癌之術前及術後治療',
    approvalDate: '2025-01-01',
    current: true,
  },
  {
    id: 't2',
    genericName: 'Trastuzumab',
    cancerIds: ['breast_cancer'],
    indication: 'HER2-positive breast cancer',
    current: true,
  },
];

test('matches exact TFDA drug names and ingredients inside a regimen', () => {
  assert.equal(registry.match(records, 'Pembrolizumab', ['breast_cancer'])[0].level, 'exact');
  assert.equal(registry.match(records, 'Carboplatin/Paclitaxel + Pembrolizumab', ['breast_cancer'])[0].level, 'ingredient');
  assert.equal(registry.match(records, 'Keytruda', ['breast_cancer'])[0].record.id, 't1');
  assert.equal(registry.match(records, 'TCHP', ['breast_cancer'])[0].record.id, 't2');
});

test('does not cross cancer mappings or infer an unmatched approval', () => {
  assert.deepEqual(registry.match(records, 'Pembrolizumab', ['colon_cancer']), []);
  assert.deepEqual(registry.match(records, 'Capecitabine', ['breast_cancer']), []);
  assert.deepEqual(registry.match([{ genericName: 'Pembrolizumab', indication: 'unspecified cancer', cancerIds: [] }], 'Pembrolizumab', ['breast_cancer']), []);
});

test('imports only structured records with both drug and indication', () => {
  const imported = registry.parseImport({ tfdaIndications: [
    { genericName: 'Olaparib', indication: 'adjuvant treatment', cancerIds: ['breast_cancer'], aliases: 'Lynparza,令癌莎' },
    { genericName: 'Missing indication' },
  ] });
  assert.equal(imported.length, 1);
  assert.deepEqual(imported[0].aliases, ['Lynparza', '令癌莎']);
});

test('summarizes source and date gaps without calling records invalid', () => {
  const summary = registry.summarize(records);
  assert.equal(summary.active, 2);
  assert.equal(summary.cancers, 1);
  assert.equal(summary.undated, 1);
  assert.equal(summary.withoutSource, 2);
});
test('archives only older auto-extracted records with the same permit number', () => {
  const old = {
    ...records[0],
    id: 'old-auto',
    permitNumber: '衛部藥輸字第028123號',
    autoExtracted: true,
  };
  const manual = { ...old, id: 'manual', autoExtracted: false };
  const incoming = [{ ...old, id: 'new-auto' }];
  const archived = registry.archiveSuperseded([old, manual], incoming, '2026-07-31');
  assert.deepEqual(archived.map(record => record.id), ['old-auto']);
  assert.equal(archived[0].archived, true);
});