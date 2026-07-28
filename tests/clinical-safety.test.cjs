const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nccn-parser.js');
require('../clinical-matcher.js');
require('../clinical-templates.js');
const matcher = window.CLINICAL_MATCHER;
const parser = window.NCCN_PARSER;
const templates = window.CLINICAL_TEMPLATES;

const field = (label, value) => ({ label, value });
const polarityOf = (fields, key) =>
  matcher.extractClinicalFeatures(fields).find(item => item.key === key)?.polarity ?? 'dropped';
const templateField = (cancerId, key, value) => ({
  ...templates.precisionForCancer(cancerId).find(item => item.key === key),
  value,
});

test('numeric biomarker values never default to positive', () => {
  // PD-L1 0% 是陰性，不是「有數字所以陽性」
  assert.equal(polarityOf([templateField('nsclc', 'nsclc-pdl1-tps', '0')], 'pd-l1'), 'negative');
  assert.equal(polarityOf([templateField('nsclc', 'nsclc-pdl1-tps', '1')], 'pd-l1'), 'positive');
  assert.equal(polarityOf([templateField('nsclc', 'nsclc-pdl1-tps', '90')], 'pd-l1'), 'positive');
  // 晚期 TNBC 以 CPS >= 10 為門檻
  assert.equal(polarityOf([templateField('breast_cancer', 'breast-pdl1-cps', '5')], 'pd-l1'), 'negative');
  assert.equal(polarityOf([templateField('breast_cancer', 'breast-pdl1-cps', '20')], 'pd-l1'), 'positive');
  // 描述性數值（分級用）不得產生陽性／陰性條件
  assert.equal(polarityOf([templateField('neuroendocrine_tumor', 'net-ki67', '1')], 'ki-67'), 'dropped');
});

test('未測與陰性的寫法不會被當成陽性', () => {
  for (const value of ['未檢測', '未測', '無法判讀', '不可評估', '待檢']) {
    assert.equal(polarityOf([field('HER2', value)], 'her2'), 'dropped', 'HER2=' + value);
  }
  for (const value of ['陰性', 'IHC 0', '無致病變異', 'wild type']) {
    assert.equal(polarityOf([field('BRCA1/2', value)], 'brca'), 'negative', 'BRCA=' + value);
  }
  // 明確陽性仍須維持
  assert.equal(polarityOf([field('HER2', '陽性')], 'her2'), 'positive');
  assert.equal(polarityOf([field('NSCLC 驅動基因／可標靶變異', 'ALK fusion')], 'alk'), 'positive');
  assert.equal(polarityOf([field('CRC 其他可作用標記', 'BRAF V600E')], 'braf'), 'positive');
});

test('標記陰性時，即使藥名未寫出標記也要擋下標靶療程', () => {
  const her2Negative = matcher.extractClinicalFeatures([field('HER2', '陰性')]);
  const blocked = matcher.optionAssessment({ label: 'Trastuzumab + pertuzumab + docetaxel' }, her2Negative);
  assert.equal(blocked.blocked, true);

  const egfrWildType = matcher.extractClinicalFeatures([field('EGFR', 'wild type')]);
  assert.equal(matcher.optionAssessment({ label: 'Osimertinib' }, egfrWildType).blocked, true);

  // 化療與免疫治療不得被誤擋（多數免疫適應症不以 PD-L1 陽性為必要條件）
  assert.equal(matcher.optionAssessment({ label: 'Carboplatin + paclitaxel' }, her2Negative).blocked, false);
  const pdl1Zero = matcher.extractClinicalFeatures([templateField('nsclc', 'nsclc-pdl1-tps', '0')]);
  assert.equal(matcher.optionAssessment({ label: 'Pembrolizumab' }, pdl1Zero).blocked, false);
});

test('療程需要某標記但尚未輸入時，標示為需人工核對而非直接採用', () => {
  const assessment = matcher.optionAssessment({ label: 'Trastuzumab deruxtecan' }, []);
  assert.equal(assessment.blocked, false);
  assert.equal(assessment.score, 0);
  assert.ok(assessment.reviewNotes.some(note => /HER2/.test(note)));
});

test('分期與 Child-Pugh 必須實際參與比對', () => {
  assert.equal(polarityOf([field('臨床／病理分期或風險分層', 'IIIA')], 'stage-iii'), 'positive');
  assert.equal(polarityOf([field('分期', 'II')], 'stage-ii'), 'positive');
  assert.equal(polarityOf([field('Child-Pugh', 'B8')], 'child-pugh-b'), 'positive');
  // 解析器端必須有對應關鍵字，否則條件永遠無法匹配任何頁面
  assert.ok(parser.pageKeywords('Stage IIIA NSCLC treatment').includes('stage-iii'));
  assert.ok(parser.pageKeywords('Child-Pugh class B, unresectable HCC').includes('child-pugh-b'));
  assert.ok(!parser.pageKeywords('Child-Pugh class B only').includes('child-pugh-c'));
});

test('可路由條件都必須存在對應的解析器關鍵字', () => {
  const vocabulary = new Set(parser.KEYWORD_VOCABULARY);
  const routable = ['metastatic', 'unresectable', 'resectable', 'first-line', 'second-line',
    'neoadjuvant', 'adjuvant', 'recurrent', 'stage-i', 'stage-iv', 'child-pugh-a'];
  for (const key of routable) assert.ok(vocabulary.has(key), '缺少解析器關鍵字：' + key);
});

test('真正的治療頁必須排在 workup 之前，即使 workup 命中較多條件', () => {
  const pages = [
    { page: 1, role: 'workup', types: ['systemic'], keywords: ['metastatic', 'first-line', 'egfr'], options: [] },
    { page: 2, role: 'recommendation', types: ['systemic'], keywords: ['metastatic'], options: [] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [
    field('病程情境', '轉移／全身性'), field('治療階段／線別', '第一線'), field('EGFR', '陽性'),
  ]);
  assert.equal(matches[0].page.page, 2);
});

test('演算法頁不因腳註引用 Principles 而被降級', () => {
  const algorithmPage = 'CLINICAL TREATMENT RESPONSE ASSESSMENT SURVEILLANCE\nUnresectable disease\nSee Principles of Surgery (HCC-F)';
  assert.equal(parser.detectPageRole(algorithmPage, [], { code: 'HCC-5' }), 'pathway');
  const principlesPage = 'PRINCIPLES OF SYSTEMIC THERAPY\nSelection of regimen';
  assert.equal(parser.detectPageRole(principlesPage, [], { code: 'HCC-C' }), 'principles');
});

test('無法路由的條件標為僅供記錄，不算「找不到對應頁面」', () => {
  const documents = [{ nccnStructure: { treatmentPages: [
    { page: 5, role: 'recommendation', types: ['systemic'], keywords: ['metastatic'], options: [] },
  ] } }];
  const diagnosis = matcher.diagnoseTreatmentMatch(documents, [
    field('病程情境', '轉移／全身性'), field('ECOG PS', '1'),
  ]);
  assert.deepEqual(diagnosis.unmatchedFeatures.map(item => item.key), []);
  assert.deepEqual(diagnosis.recordOnlyFeatures.map(item => item.key), ['ecog-1']);
});

test('欄位定義多傳參數時立即失敗，避免中繼資料被靜默丟棄', () => {
  const adrenal = templates.precisionForCancer('adrenal_tumor').find(item => item.key === 'adrenal-functional');
  assert.equal(adrenal.scope, 'cancer');
  assert.ok(adrenal.exclusiveOptions.includes('無功能性'));
  assert.ok(adrenal.exclusiveOptions.includes('待確認'));
});
