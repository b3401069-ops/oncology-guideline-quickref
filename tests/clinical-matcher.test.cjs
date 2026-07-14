const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../clinical-matcher.js');
const matcher = window.CLINICAL_MATCHER;

const field = (label, value) => ({ label, value });

test('preserves positive, negative and cancer-specific clinical meaning', () => {
  const features = matcher.extractClinicalFeatures([
    field('病程情境', '轉移／全身性'),
    field('SSTR 狀態', '陰性'),
    field('BCLC 分期', 'C'),
    field('NSCLC 驅動基因／可標靶變異', ['ROS1 fusion', 'MET exon 14 skipping']),
    field('SCLC 分期', '廣泛期'),
  ]);
  const byKey = new Map(features.map(item => [item.key, item]));
  assert.equal(byKey.get('metastatic').polarity, 'positive');
  assert.equal(byKey.get('sstr').polarity, 'negative');
  assert.equal(byKey.get('bclc-c').polarity, 'positive');
  assert.equal(byKey.get('ros1').polarity, 'positive');
  assert.equal(byKey.get('met').polarity, 'positive');
  assert.equal(byKey.get('extensive-stage-sclc').polarity, 'positive');
});

test('does not treat HER2-negative values as HER2-positive', () => {
  const features = matcher.extractClinicalFeatures([
    field('病程情境', '轉移／全身性'),
    field('乳癌臨床亞型', 'HR+/HER2-'),
  ]);
  const her2 = features.find(item => item.key === 'her2');
  assert.equal(her2.polarity, 'negative');
  const assessment = matcher.optionAssessment({ label: 'HER2-directed therapy' }, features);
  assert.equal(assessment.blocked, true);
  assert.equal(matcher.optionAssessment({ label: 'Chemotherapy for HER2-negative disease' }, features).blocked, false);

  const positiveFeatures = matcher.extractClinicalFeatures([
    field('HER2 狀態', 'HER2 陽性'),
  ]);
  assert.equal(matcher.optionAssessment({ label: 'Chemotherapy for HER2-negative disease' }, positiveFeatures).blocked, true);
});

test('requires a real positive condition before returning NCCN pages', () => {
  const documents = [{ nccnStructure: { treatmentPages: [{ page: 5, title: 'Metastatic treatment', types: ['systemic'], keywords: ['metastatic'], options: [] }] } }];
  assert.deepEqual(matcher.matchTreatmentPages(documents, []), []);
  assert.equal(matcher.matchTreatmentPages(documents, [field('病程情境', '轉移／全身性')]).length, 1);
});

test('keeps surgery, radiation, systemic and follow-up pages represented', () => {
  const pages = ['surgery', 'radiation', 'systemic', 'followup'].map((type, index) => ({
    page: index + 1, title: 'Metastatic treatment', types: [type], keywords: ['metastatic'], options: [],
  }));
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [field('病程情境', '轉移／全身性')]);
  assert.deepEqual(new Set(matches.map(item => item.modality)), new Set(['surgery', 'radiation', 'systemic', 'followup']));
});

test('treats pMMR and MSS as negative evidence for MSI-H or dMMR therapy', () => {
  const features = matcher.extractClinicalFeatures([
    field('病程情境', '轉移／全身性'),
    field('MMR／MSI', 'pMMR／MSS'),
  ]);
  const mmr = features.find(item => item.key === 'msi-h/dmmr');
  assert.equal(mmr.polarity, 'negative');
  assert.equal(matcher.optionAssessment({ label: 'Pembrolizumab for MSI-H/dMMR tumors' }, features).blocked, true);
});

test('ranks direct recommendation pages ahead of principles and workup pages', () => {
  const option = { label: 'Metastatic systemic therapy', modality: 'systemic' };
  const pages = [
    { page: 1, role: 'principles', title: 'Principles for metastatic treatment', types: ['systemic'], keywords: ['metastatic'], options: [option] },
    { page: 2, role: 'workup', title: 'Metastatic workup', types: ['systemic'], keywords: ['metastatic'], options: [option] },
    { page: 3, role: 'recommendation', title: 'Metastatic treatment', types: ['systemic'], keywords: ['metastatic'], options: [option] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [field('病程情境', '轉移／全身性')]);
  assert.equal(matches[0].page.page, 3);
});
