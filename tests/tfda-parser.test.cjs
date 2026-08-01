const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../nhi-parser.js');
require('../tfda-parser.js');
const parser = global.TFDA_PARSER;

const cards = [
  { id: 'breast_cancer', zhName: '乳癌', enName: 'Breast cancer' },
  { id: 'nsclc', zhName: '非小細胞肺癌', enName: 'Non-Small Cell Lung Cancer' },
];

test('extracts a clear TFDA indication with permit, ingredient, cancer and source page', () => {
  const result = parser.parsePages([
    { pageNumber: 1, text: [
      '衛部藥輸字第 028123 號',
      '中文品名：吉舒達注射劑',
      '英文品名：KEYTRUDA',
      '主成分略述：Pembrolizumab',
      '2. 適應症',
      'KEYTRUDA 與化療併用於高風險早期三陰性乳癌之術前及術後輔助治療。',
    ].join('\n') },
    { pageNumber: 2, text: '3. 用法及用量\n依體重給藥。' },
  ], cards, { documentTitle: 'Keytruda 核定仿單' });
  assert.equal(result.candidate.genericName, 'Pembrolizumab');
  assert.equal(result.candidate.permitNumber, '衛部藥輸字第028123號');
  assert.deepEqual(result.candidate.cancerIds, ['breast_cancer']);
  assert.equal(result.candidate.sourcePage, 1);
  assert.equal(result.candidate.extractionStatus, 'auto_extracted');
  assert.match(result.candidate.lineSetting, /術前/);
  assert.match(result.candidate.lineSetting, /術後／輔助/);
});

test('keeps incomplete label extraction as review-needed without inventing cancer approval', () => {
  const result = parser.parsePages([
    { pageNumber: 4, text: '適應症：用於無法手術切除之惡性腫瘤。\n用法及用量：依醫師指示。' },
  ], cards, { documentTitle: 'Unknown medicine' });
  assert.equal(result.candidate.extractionStatus, 'review_needed');
  assert.deepEqual(result.candidate.cancerIds, []);
  assert.ok(result.candidate.reviewItems.includes('許可證字號'));
  assert.ok(result.candidate.reviewItems.includes('學名／有效成分'));
  assert.ok(result.candidate.reviewItems.includes('對應癌別'));
});

test('does not create a candidate when the indication section is absent', () => {
  const result = parser.parsePages([
    { pageNumber: 1, text: '衛部藥輸字第028123號\n3. 用法及用量\n依醫師指示。' },
  ], cards, { documentTitle: 'Pembrolizumab' });
  assert.equal(result.candidate, null);
  assert.ok(result.warnings.includes('適應症章節'));
});
