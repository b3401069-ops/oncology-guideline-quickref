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

test('trusts parser clinical keywords even when regimen labels do not repeat the setting', () => {
  const page = {
    page: 20,
    role: 'recommendation',
    title: 'SYSTEMIC THERAPY',
    types: ['systemic'],
    keywords: ['metastatic', 'first-line'],
    options: [{ label: 'Carboplatin + Paclitaxel', modality: 'systemic', recommendation: 'preferred' }],
  };
  const fields = [field('Disease setting', 'metastatic'), field('Treatment line', 'first-line')];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: [page] } }], fields);
  assert.equal(matches[0].page.page, 20);
});

test('routes MPN subtype values to their NCCN section family', () => {
  const pages = [
    { page: 10, sectionCode: 'PV-3', role: 'pathway', title: 'Treatment', options: [{ label: 'Interferon', modality: 'systemic' }] },
    { page: 12, sectionCode: 'MF-3', role: 'pathway', title: 'Treatment', options: [{ label: 'Momelotinib', modality: 'systemic' }] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [field('MPN subtype', 'PMF')]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].page.sectionCode, 'MF-3');
});
const keyedField = (sourceTemplateKey, label, value) => ({ sourceTemplateKey, label, value });

const completeBreastAdjuvantFields = () => [
  keyedField('base-disease-setting', '病程情境', '初診局限'),
  keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
  keyedField('breast-pathology-scope', '乳癌病理範圍', '浸潤性乳癌'),
  keyedField('breast-surgery-path', '手術與術前治療情境', '先手術（未接受術前全身治療）'),
  keyedField('breast-pt', '病理腫瘤分期（pT／ypT）', 'pT2'),
  keyedField('breast-pn', '病理淋巴結分期（pN／ypN）', 'pN0'),
  keyedField('breast-grade', '組織學分級', 'Grade 2'),
  keyedField('breast-lvi', '淋巴血管侵犯（LVI）', '無'),
  keyedField('breast-er', 'ER', '陽性'),
  keyedField('breast-pr', 'PR', '陽性'),
  keyedField('breast-her2', 'HER2 原始結果', 'IHC 0'),
  keyedField('breast-subtype', '乳癌臨床亞型', 'HR+/HER2-'),
  keyedField('breast-menopause', '停經狀態', '停經後'),
  keyedField('breast-genomic-assay', '乳癌基因表現檢測', 'Oncotype DX'),
  keyedField('breast-oncotype-rs', 'Oncotype DX Recurrence Score', '18'),
];

test('breast postoperative matching excludes metastatic and opposite-subtype pages', () => {
  const pages = [
    { page: 19, sectionCode: 'BINV-6', title: 'SYSTEMIC ADJUVANT TREATMENT: HR-POSITIVE – HER2-NEGATIVE DISEASE', role: 'pathway',
      keywords: ['adjuvant', 'breast-hr-positive', 'breast-her2-negative'], options: [{ label: 'Systemic adjuvant treatment', modality: 'systemic' }] },
    { page: 22, sectionCode: 'BINV-9', title: 'SYSTEMIC ADJUVANT TREATMENT: HR-NEGATIVE – HER2-POSITIVE DISEASE', role: 'pathway',
      keywords: ['adjuvant', 'breast-hr-negative', 'breast-her2-positive'], options: [{ label: 'HER2-directed therapy', modality: 'systemic' }] },
    { page: 93, sectionCode: 'BINV-Q', title: 'SYSTEMIC THERAPY FOR METASTATIC DISEASE', role: 'recommendation',
      keywords: ['metastatic', 'HER2'], options: [{ label: 'Metastatic systemic therapy', modality: 'systemic' }] },
  ];
  const matches = matcher.matchTreatmentPages([{ title: 'Breast Cancer', nccnStructure: { treatmentPages: pages } }], completeBreastAdjuvantFields());
  assert.ok(matches.some(match => match.page.sectionCode === 'BINV-6'));
  assert.ok(!matches.some(match => ['BINV-9', 'BINV-Q'].includes(match.page.sectionCode)));
});

test('reports missing breast postoperative inputs instead of a silent no-match', () => {
  const result = matcher.breastAdjuvantAssessment([], [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('breast-pathology-scope', '乳癌病理範圍', '浸潤性乳癌'),
  ]);
  assert.equal(result.active, true);
  assert.equal(result.status, 'missing');
  assert.ok(result.missing.includes('病理腫瘤分期（pT／ypT）'));
  assert.ok(result.missing.includes('病理淋巴結分期（pN／ypN）'));
  assert.match(result.message, /尚不能判斷/);
});

test('locates the HR-positive HER2-negative postoperative decision pages when core data are complete', () => {
  const pages = [
    { page: 17, sectionCode: 'BINV-4', title: 'ADJUVANT SYSTEMIC THERAPY CONSIDERATIONS', options: [] },
    { page: 19, sectionCode: 'BINV-6', title: 'SYSTEMIC ADJUVANT TREATMENT: HR-POSITIVE – HER2-NEGATIVE DISEASE', options: [] },
    { page: 20, sectionCode: 'BINV-7', title: 'SYSTEMIC ADJUVANT TREATMENT: HR-POSITIVE – HER2-NEGATIVE DISEASE', options: [] },
  ];
  const result = matcher.breastAdjuvantAssessment([
    { title: 'Breast Cancer', nccnStructure: { treatmentPages: pages } },
  ], completeBreastAdjuvantFields());
  assert.equal(result.status, 'ready');
  assert.match(result.branchLabel, /HR-positive／HER2-negative/);
  assert.deepEqual(result.pages.map(item => item.page.sectionCode), ['BINV-4', 'BINV-6', 'BINV-7']);
  assert.deepEqual(result.missing, []);
});

test('routes DCIS to DCIS pages without using the invasive chemotherapy pathway', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('breast-pathology-scope', '乳癌病理範圍', 'DCIS／非浸潤性'),
  ];
  const pages = [
    { page: 13, sectionCode: 'DCIS-2', title: 'DCIS POSTSURGICAL TREATMENT', options: [] },
    { page: 19, sectionCode: 'BINV-6', title: 'INVASIVE BREAST CANCER', options: [] },
  ];
  const result = matcher.breastAdjuvantAssessment([{ title: 'Breast Cancer', nccnStructure: { treatmentPages: pages } }], fields);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pages.map(item => item.page.sectionCode), ['DCIS-2']);
  assert.match(result.message, /不套用浸潤性乳癌/);
});
test('turns a pT1cN0 triple-negative postoperative case into a category 1 chemotherapy branch', () => {
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'pT1c' };
    if (field.sourceTemplateKey === 'breast-er' || field.sourceTemplateKey === 'breast-pr') return { ...field, value: '陰性' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: '三陰性' };
    return field;
  });
  const result = matcher.breastAdjuvantAssessment([], fields);
  assert.equal(result.decision.level, 'recommended');
  assert.match(result.decision.headline, /category 1/);
  assert.match(result.decision.basis, /pT1c、pN0/);
  assert.ok(result.decision.items.some(item => /olaparib/.test(item)));
});

test('keeps pT1aN0 triple-negative disease on the no-routine-adjuvant branch with a grade 3 exception', () => {
  const makeFields = (grade) => completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'pT1a' };
    if (field.sourceTemplateKey === 'breast-grade') return { ...field, value: grade };
    if (field.sourceTemplateKey === 'breast-er' || field.sourceTemplateKey === 'breast-pr') return { ...field, value: '陰性' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: '三陰性' };
    return field;
  });
  const standard = matcher.breastAdjuvantAssessment([], makeFields('Grade 2'));
  assert.equal(standard.decision.level, 'omit');
  assert.match(standard.decision.headline, /不給予術後全身治療/);
  const highGrade = matcher.breastAdjuvantAssessment([], makeFields('Grade 3'));
  assert.equal(highGrade.decision.level, 'consider');
  assert.match(highGrade.decision.headline, /category 2B/);
});
test('connects a pT1bN0 triple-negative decision to stage I BINV-M regimen candidates', () => {
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'pT1b' };
    if (field.sourceTemplateKey === 'breast-er' || field.sourceTemplateKey === 'breast-pr') return { ...field, value: '陰性' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: '三陰性' };
    return field;
  });
  const regimenOptions = [
    { label: 'Dose-dense AC followed by Paclitaxel every 2 weeks' },
    { label: 'Dose-dense AC followed by weekly Paclitaxel' },
    { label: 'TC (Docetaxel/Cyclophosphamide)' },
    { label: 'Carboplatin/Paclitaxel + Pembrolizumab (preoperative) followed by Pembrolizumab (adjuvant)' },
    { label: 'Regimens listed as “Preferred” for stage I' },
  ];
  const documents = [{
    title: 'Breast Cancer', storageKey: 'breast-pdf', nccnStructure: { treatmentPages: [
      { page: 23, sectionCode: 'BINV-10', options: [] },
      { page: 73, sectionCode: 'BINV-M', options: regimenOptions },
    ] },
  }];
  const result = matcher.breastAdjuvantAssessment(documents, fields);
  assert.equal(result.decision.level, 'consider');
  assert.match(result.decision.regimenTitle, /Stage I/);
  assert.deepEqual(result.decision.regimens.map(item => item.option.label), [
    'Dose-dense AC followed by Paclitaxel every 2 weeks',
    'Dose-dense AC followed by weekly Paclitaxel',
    'TC (Docetaxel/Cyclophosphamide)',
  ]);
  assert.ok(result.decision.regimens.every(item => item.page.page === 73));
});