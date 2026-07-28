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
  card('gastric_cancer', '胃癌'),
  card('bladder_cancer', '膀胱癌'),
  card('gist', '胃腸道基質瘤'),
  card('brain_tumor', '腦部腫瘤'),
  card('lymphoma', '淋巴瘤'),
  card('hodgkin_lymphoma', '霍奇金淋巴瘤'),
  card('b_cell_lymphomas', 'B 細胞淋巴瘤'),
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
  // 適用的癌別要留下，被排除的要拿掉
  const gastricOnly = names('限胃癌使用，不包括肝癌');
  assert.ok(gastricOnly.includes('胃癌'));
  assert.ok(!gastricOnly.includes('肝癌'));
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

test('健保實際使用的臨床詞彙要對得到癌別卡片', () => {
  // 這些寫法都取自健保第9節條文，舊版別名全部漏掉
  assert.ok(names('之肺腺癌病患之第一線治療').includes('非小細胞肺癌'));
  assert.ok(names('局部晚期或轉移性泌尿道上皮癌').includes('膀胱癌'));
  assert.ok(names('無法切除或轉移性腸胃道間質瘤').includes('胃腸道基質瘤'));
  assert.ok(names('新診斷的多形神經膠母細胞瘤').includes('腦部腫瘤'));
  assert.ok(names('局部晚期不可切除或轉移性胃腺癌').includes('胃癌'));
});

test('何杰金與非何杰金淋巴瘤不得互相污染', () => {
  const nonHodgkin = names('限用於復發之非何杰金氏淋巴瘤');
  assert.ok(!nonHodgkin.includes('霍奇金淋巴瘤'), '非何杰金條文不應掛到何杰金卡片');
  assert.ok(names('限用於何杰金氏淋巴瘤').includes('霍奇金淋巴瘤'));
});

test('中文與英文縮寫間的空白不影響比對', () => {
  // 健保排版常寫成「瀰漫性大型 B 細胞淋巴瘤」
  assert.ok(names('第三線治療復發型瀰漫性大型 B 細胞淋巴瘤(DLBCL)成年病人').includes('B 細胞淋巴瘤'));
});

test('類別條目要保留底下的個別藥名與商品名', () => {
  const pages = [{
    pageNumber: 1,
    text: [
      '9.69.免疫檢查點抑制劑(如 atezolizumab;nivolumab;pembrolizumab;avelumab;',
      'ipilimumab;durvalumab 製劑)',
      '1. 限用於轉移性非小細胞肺癌之治療，需經事前審查核准後使用。',
    ].join('\n'),
  }];
  const parsed = parser.parsePages(pages, cards);
  const entry = parsed.entries.find(item => item.section === '9.69');
  assert.ok(entry, '應擷取到 9.69 條目');
  // 類別名稱留作顯示，個別藥名留作比對
  assert.equal(entry.label, '免疫檢查點抑制劑');
  for (const drug of ['pembrolizumab', 'nivolumab', 'atezolizumab', 'ipilimumab', 'durvalumab']) {
    assert.ok(entry.aliases.includes(drug), '缺少別名：' + drug);
  }
});

test('單一藥品條目的商品名也要成為別名', () => {
  const pages = [{ pageNumber: 1, text: '9.2.Carboplatin(如 Paraplatin)\n1. 限用於卵巢癌之治療，需符合給付條件。' }];
  const entry = parser.parsePages(pages, cards).entries[0];
  assert.ok(entry.aliases.includes('Carboplatin'));
  assert.ok(entry.aliases.includes('Paraplatin'));
});

test('條文過長時要標示截斷，不可靜默丟棄', () => {
  const long = Array.from({ length: 900 }, (_, i) => (i + 1) + '. 限用於乳癌病人之治療，需經事前審查核准後使用。').join('\n');
  const pages = [{ pageNumber: 1, text: '9.99.測試藥品\n' + long }];
  const entry = parser.parsePages(pages, cards).entries[0];
  assert.ok(entry.content.length > 14000 - 1);
  assert.match(entry.content, /條文過長已截斷/);
});
