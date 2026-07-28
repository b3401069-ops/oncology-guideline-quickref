const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nhi-parser.js');
const parser = window.NHI_PARSER;

const card = (id, zhName, enName = '') => ({ id, zhName, enName, synonyms: [] });
const cards = [
  card('nsclc', '非小細胞肺癌'),
  card('sclc', '小細胞肺癌'),
  card('breast_cancer', '乳癌'),
  card('colorectal_cancer', '大腸直腸癌'),
  card('rectal_cancer', '直腸癌'),
  card('hepatocellular_carcinoma', '肝癌'),
];
const names = (text) => parser.matchCancerCards(text, cards).map(item => item.zhName);

test('NSCLC 條文不得掛到 SCLC（字面包含但臨床互斥）', () => {
  assert.deepEqual(names('限用於非小細胞肺癌第一線治療，需 EGFR 突變陽性'), ['非小細胞肺癌']);
});

test('SCLC 專屬條文仍要正確命中', () => {
  assert.deepEqual(names('限用於廣泛期小細胞肺癌第一線治療'), ['小細胞肺癌']);
});

test('同時提及兩種肺癌時兩者都要命中', () => {
  assert.deepEqual(new Set(names('本藥適用於小細胞肺癌與非小細胞肺癌')), new Set(['非小細胞肺癌', '小細胞肺癌']));
});

test('排除語句不得被視為適用', () => {
  assert.deepEqual(names('限乳癌患者使用；本項不適用於非小細胞肺癌'), ['乳癌']);
  assert.deepEqual(names('限胃癌使用，不包括肝癌'), []);
});

test('大腸直腸癌仍應涵蓋直腸癌（不可因排除規則而退化）', () => {
  assert.deepEqual(new Set(names('限轉移性大腸直腸癌，且 RAS wild type')), new Set(['大腸直腸癌', '直腸癌']));
});

test('條目必須同時具備適應症、限制與結構才算自動擷取成功', () => {
  const pages = [{
    pageNumber: 1,
    text: [
      '9.1.1. Trastuzumab（如 Herceptin）',
      '1. 限用於 HER2 陽性轉移性乳癌之治療。',
      '2. 需經事前審查核准後使用，每次申請以 6 個月為限。',
    ].join('\n'),
  }];
  const parsed = parser.parsePages(pages, cards);
  const entry = parsed.candidates.find(item => item.cancerId === 'breast_cancer');
  assert.ok(entry, '應擷取到乳癌條目');
  assert.equal(entry.coverageStatus, 'related_with_restrictions');
  assert.equal(entry.extractionStatus, 'auto_extracted');
});

test('資訊不足的條目降級為尚待核對，不得推論為沒有給付', () => {
  const pages = [{ pageNumber: 1, text: '9.2.1. 某藥品\n本品為注射劑。' }];
  const parsed = parser.parsePages(pages, cards);
  for (const candidate of parsed.candidates) {
    assert.notEqual(candidate.coverageStatus, 'not_covered');
  }
});
