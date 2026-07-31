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
  keyedField('breast-chemotherapy-candidate', '術後化療適用性', '適合接受化療'),
  keyedField('breast-tumor-size-cm', '病理浸潤腫瘤最大徑（cm）', '2.2'),
  keyedField('breast-ki67', 'Ki-67（%）', '15'),
  keyedField('breast-initial-clinical-risk', '術前治療前臨床風險', '未接受術前全身治療'),
  keyedField('breast-initial-nodal-status', '術前治療前臨床淋巴結', 'cN0'),
  keyedField('breast-germline-result', '胚系 BRCA1/2 結果', '陰性'),
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

const fakeNccnDocument = (title, pages) => ({ title, storageKey: title + '-pdf', nccnStructure: { treatmentPages: pages } });

test('NSCLC postoperative assessment recommends stage IIB platinum doublet and ALK adjuvant therapy', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('nsclc-surgery-path', 'NSCLC 手術／術前治療情境', '先手術（未接受術前全身治療）'),
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IIB'),
    keyedField('nsclc-pt', 'NSCLC 病理 T 分期', 'pT3'),
    keyedField('nsclc-pn', 'NSCLC 病理 N 分期', 'pN0'),
    keyedField('nsclc-margin', 'NSCLC 手術切緣', 'R0（陰性）'),
    keyedField('nsclc-histology', 'NSCLC 組織型', '腺癌'),
    keyedField('nsclc-cisplatin', 'Cisplatin 適用性', '適合 cisplatin'),
    keyedField('nsclc-tumor-size-cm', 'NSCLC 病理腫瘤最大徑（cm）', '4.2'),
    keyedField('nsclc-drivers', 'NSCLC 驅動基因／可標靶變異', ['ALK fusion']),
  ];
  const document = fakeNccnDocument('Non-Small Cell Lung Cancer', [
    { page: 92, sectionCode: 'NSCL-E', title: 'Adjuvant Chemotherapy', options: [
      { label: 'Cisplatin/Pemetrexed Preferred (squamous)', modality: 'systemic' },
      { label: 'Cisplatin/Vinorelbine', modality: 'systemic' },
    ] },
    { page: 93, sectionCode: 'NSCL-E', title: 'Other Adjuvant Systemic Therapy', options: [
      { label: 'Alectinib (category 1)', modality: 'systemic' },
    ] },
  ]);
  const result = matcher.nsclcAdjuvantAssessment([document], fields);
  assert.equal(result.decision.level, 'recommended');
  assert.match(result.decision.headline, /含鉑雙藥/);
  assert.ok(result.decision.regimens.some(item => /Cisplatin\/Pemetrexed/.test(item.option.label)));
  assert.ok(result.decision.regimens.some(item => /Alectinib/.test(item.option.label)));
});

test('NSCLC assessment does not repeat adjuvant chemotherapy after neoadjuvant chemotherapy', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('nsclc-surgery-path', 'NSCLC 手術／術前治療情境', '術前化療後手術'),
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IIIA'),
    keyedField('nsclc-pt', 'NSCLC 病理 T 分期', 'ypT2'),
    keyedField('nsclc-pn', 'NSCLC 病理 N 分期', 'ypN1'),
    keyedField('nsclc-margin', 'NSCLC 手術切緣', 'R0（陰性）'),
  ];
  const result = matcher.nsclcAdjuvantAssessment([], fields);
  assert.equal(result.decision.level, 'omit');
  assert.match(result.decision.headline, /不應再另加/);
  assert.equal(result.decision.regimens, undefined);
});

test('colon assessment distinguishes dMMR stage II observation from low-risk stage III chemotherapy', () => {
  const common = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('colon-surgery-path', '結腸癌手術／術前治療情境', '先手術'),
    keyedField('colon-margin', '結腸癌手術切緣', '陰性'),
    keyedField('colon-nodes-examined', '結腸癌檢查淋巴結數', '15'),
    keyedField('colon-high-risk', '結腸癌 Stage II 高風險特徵', ['無上述特徵']),
  ];
  const dmmr = matcher.colonAdjuvantAssessment([], [
    ...common,
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIA'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'pT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'pN0'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'dMMR／MSI-H'),
  ]);
  assert.equal(dmmr.decision.level, 'omit');
  assert.match(dmmr.decision.headline, /觀察/);

  const missingNodes = matcher.colonAdjuvantAssessment([], [
    ...common.filter(item => item.sourceTemplateKey !== 'colon-nodes-examined'),
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIA'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'pT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'pN0'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ]);
  assert.equal(missingNodes.status, 'missing');
  assert.ok(missingNodes.missing.some(item => /檢查淋巴結數/.test(item)));

  const document = fakeNccnDocument('Colon Cancer', [
    { page: 13, sectionCode: 'COL-4', title: 'ADJUVANT TREATMENT', options: [
      { label: 'CAPEOX (3 mo)', modality: 'systemic' },
      { label: 'FOLFOX (3–6 mo)', modality: 'systemic' },
    ] },
  ]);
  const stageIII = matcher.colonAdjuvantAssessment([document], [
    ...common,
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIIB'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'pT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'pN1b'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ]);
  assert.equal(stageIII.decision.level, 'recommended');
  assert.match(stageIII.decision.headline, /低風險 Stage III/);
  assert.ok(stageIII.decision.regimens.some(item => /CAPEOX（3 個月）/.test(item.option.label)));
});

test('rectal assessment avoids extra chemotherapy after completed TNT and maps upfront pT4 to REC-5 regimens', () => {
  const base = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
    keyedField('rectal-path-stage', '直腸癌術後病理分期', 'IIA'),
    keyedField('rectal-pt', '直腸癌病理 T 分期', 'ypT3'),
    keyedField('rectal-pn', '直腸癌病理 N 分期', 'ypN0'),
    keyedField('rectal-margin', '直腸癌切緣', '陰性'),
    keyedField('rectal-crm', '直腸癌環周切緣（CRM）', '陰性／未受威脅'),
  ];
  const tnt = matcher.rectalAdjuvantAssessment([], [
    ...base,
    keyedField('rectal-surgery-path', '直腸癌手術／術前治療情境', '完成 TNT 後手術'),
  ]);
  assert.equal(tnt.decision.level, 'omit');
  assert.match(tnt.decision.headline, /不應自動再加/);

  const document = fakeNccnDocument('Rectal Cancer', [
    { page: 16, sectionCode: 'REC-5', title: 'ADJUVANT TREATMENT', options: [
      { label: 'FOLFOX or CAPEOX', modality: 'systemic' },
    ] },
  ]);
  const upfront = matcher.rectalAdjuvantAssessment([document], [
    ...base.map(item => item.sourceTemplateKey === 'rectal-path-stage' ? { ...item, value: 'IIB' } : item)
      .map(item => item.sourceTemplateKey === 'rectal-pt' ? { ...item, value: 'pT4a' } : item)
      .map(item => item.sourceTemplateKey === 'rectal-pn' ? { ...item, value: 'pN0' } : item),
    keyedField('rectal-surgery-path', '直腸癌手術／術前治療情境', '先做經腹切除'),
    keyedField('rectal-high-risk', '直腸癌術後高風險特徵', ['無上述特徵']),
  ]);
  assert.equal(upfront.decision.level, 'recommended');
  assert.ok(upfront.decision.regimens.some(item => item.option.label === 'FOLFOX'));
  assert.ok(upfront.decision.regimens.some(item => item.option.label === 'CAPEOX'));
});

test('NSCLC early-stage risk is a consider decision and inconsistent pathology blocks advice', () => {
  const base = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('nsclc-surgery-path', 'NSCLC 手術／術前治療情境', '先手術（未接受術前全身治療）'),
    keyedField('nsclc-pt', 'NSCLC 病理 T 分期', 'pT2a'),
    keyedField('nsclc-pn', 'NSCLC 病理 N 分期', 'pN0'),
    keyedField('nsclc-margin', 'NSCLC 手術切緣', 'R0（陰性）'),
  ];
  const early = matcher.nsclcAdjuvantAssessment([], [
    ...base,
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IB'),
    keyedField('nsclc-high-risk', 'NSCLC 術後高風險特徵', ['楔狀切除']),
  ]);
  assert.equal(early.decision.level, 'consider');
  assert.match(early.decision.caveats.join(' '), /單一高風險特徵/);

  const inconsistent = matcher.nsclcAdjuvantAssessment([], [
    ...base,
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IIB'),
  ]);
  assert.equal(inconsistent.status, 'missing');
  assert.equal(inconsistent.decision, null);
  assert.ok(inconsistent.missing.some(item => /pT／pN 組合不一致/.test(item)));
});

test('colon neoadjuvant chemotherapy requires cycle records and only offers continuation', () => {
  const document = fakeNccnDocument('Colon Cancer', [
    { page: 13, sectionCode: 'COL-4', title: 'ADJUVANT TREATMENT', options: [
      { label: 'CAPEOX (3 mo)', modality: 'systemic' },
      { label: 'FOLFOX (3–6 mo)', modality: 'systemic' },
    ] },
  ]);
  const base = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('colon-surgery-path', '結腸癌手術／術前治療情境', '術前 FOLFOX／CAPEOX 後手術'),
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIIB'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'ypT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'ypN1'),
    keyedField('colon-margin', '結腸癌手術切緣', '陰性'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ];
  const incomplete = matcher.colonAdjuvantAssessment([document], base);
  assert.equal(incomplete.status, 'missing');
  assert.ok(incomplete.missing.some(item => /術前實際化療方案/.test(item)));
  assert.ok(incomplete.missing.some(item => /週期數/.test(item)));

  const complete = matcher.colonAdjuvantAssessment([document], [
    ...base,
    keyedField('colon-neoadjuvant-regimen', '結腸癌術前化療方案', 'FOLFOX'),
    keyedField('colon-neoadjuvant-cycles', '結腸癌術前化療已完成週期數', '4'),
  ]);
  assert.equal(complete.status, 'ready');
  assert.match(complete.decision.headline, /不重新開始完整術後療程/);
  assert.ok(complete.decision.regimens.some(item => /FOLFOX.*補足全程/.test(item.option.label)));
  assert.ok(!complete.decision.regimens.some(item => /^CAPEOX/.test(item.option.label)));
});

test('rectal local excision accepts pNX and pT3N0 observation requires complete pathology criteria', () => {
  const local = matcher.rectalAdjuvantAssessment([], [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('rectal-surgery-path', '直腸癌手術／術前治療情境', '經肛門局部切除'),
    keyedField('rectal-path-stage', '直腸癌術後病理分期', 'I'),
    keyedField('rectal-pt', '直腸癌病理 T 分期', 'pT1'),
    keyedField('rectal-pn', '直腸癌病理 N 分期', 'pNX'),
    keyedField('rectal-margin', '直腸癌切緣', '陰性'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
    keyedField('rectal-high-risk', '直腸癌術後高風險特徵', ['無上述特徵']),
  ]);
  assert.equal(local.status, 'ready');
  assert.equal(local.decision.level, 'omit');

  const pt3 = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('rectal-surgery-path', '直腸癌手術／術前治療情境', '先做經腹切除'),
    keyedField('rectal-path-stage', '直腸癌術後病理分期', 'IIA'),
    keyedField('rectal-pt', '直腸癌病理 T 分期', 'pT3'),
    keyedField('rectal-pn', '直腸癌病理 N 分期', 'pN0'),
    keyedField('rectal-margin', '直腸癌切緣', '陰性'),
    keyedField('rectal-crm', '直腸癌環周切緣（CRM）', '陰性／未受威脅'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
    keyedField('rectal-location', '直腸腫瘤位置', '上段直腸'),
    keyedField('rectal-high-risk', '直腸癌術後高風險特徵', ['無上述特徵']),
  ];
  const incomplete = matcher.rectalAdjuvantAssessment([], pt3);
  assert.equal(incomplete.decision.level, 'review');
  assert.match(incomplete.decision.headline, /必要病理條件尚未齊全/);

  const eligible = matcher.rectalAdjuvantAssessment([], [
    ...pt3,
    keyedField('rectal-differentiation', '直腸癌分化程度', '中分化'),
    keyedField('rectal-mesorectal-invasion-mm', 'pT3 進入直腸系膜深度（mm）', '1.5'),
    keyedField('crc-extended-markers', 'CRC 其他可作用標記', ['PIK3CA exon 9／20 mutation']),
  ]);
  assert.equal(eligible.decision.level, 'consider');
  assert.match(eligible.decision.headline, /高度選擇性條件/);
  assert.ok(eligible.reviewItems.some(item => item.includes('aspirin 100–162 mg/day')));
});

test('generic adjuvant dispatcher activates supported cancers only', () => {
  const fields = [keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固')];
  assert.equal(matcher.adjuvantAssessment('pancreatic_cancer', [], fields).active, false);
  assert.equal(matcher.adjuvantAssessment('nsclc', [], fields).active, true);
});


test('NSCLC cisplatin-ineligible branch excludes cisplatin and stage IB EGFR branch still offers osimertinib', () => {
  const document = fakeNccnDocument('Non-Small Cell Lung Cancer', [
    { page: 92, sectionCode: 'NSCL-E', title: 'Adjuvant Chemotherapy', options: [
      { label: 'Cisplatin/Pemetrexed Preferred (squamous)', modality: 'systemic' },
      { label: 'Carboplatin/Pemetrexed (nonsquamous)', modality: 'systemic' },
      { label: 'Carboplatin/Paclitaxel', modality: 'systemic' },
    ] },
    { page: 93, sectionCode: 'NSCL-E', title: 'Other Adjuvant Systemic Therapy', options: [
      { label: 'Osimertinib', modality: 'systemic' },
    ] },
  ]);
  const common = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('nsclc-surgery-path', 'NSCLC 手術／術前治療情境', '先手術（未接受術前全身治療）'),
    keyedField('nsclc-pt', 'NSCLC 病理 T 分期', 'pT2a'),
    keyedField('nsclc-pn', 'NSCLC 病理 N 分期', 'pN0'),
    keyedField('nsclc-margin', 'NSCLC 手術切緣', 'R0（陰性）'),
    keyedField('nsclc-histology', 'NSCLC 組織型', '腺癌'),
  ];
  const chemotherapy = matcher.nsclcAdjuvantAssessment([document], [
    ...common.map(item => item.sourceTemplateKey === 'nsclc-pt' ? { ...item, value: 'pT3' } : item),
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IIB'),
    keyedField('nsclc-cisplatin', 'Cisplatin 適用性', '不適合 cisplatin'),
  ]);
  assert.ok(chemotherapy.decision.regimens.some(item => /Carboplatin/.test(item.option.label)));
  assert.ok(!chemotherapy.decision.regimens.some(item => /^Cisplatin/.test(item.option.label)));

  const targeted = matcher.nsclcAdjuvantAssessment([document], [
    ...common,
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IB'),
    keyedField('nsclc-high-risk', 'NSCLC 術後高風險特徵', ['無上述特徵']),
    keyedField('nsclc-drivers', 'NSCLC 驅動基因／可標靶變異', ['EGFR exon 19 deletion']),
  ]);
  assert.equal(targeted.decision.level, 'recommended');
  assert.match(targeted.decision.headline, /標靶治療資格/);
  assert.ok(targeted.decision.regimens.some(item => /Osimertinib/.test(item.option.label)));
});


test('postoperative source pages exclude the opposite molecular branch', () => {
  const pages = [
    { page: 13, sectionCode: 'COL-4', title: 'ADJUVANT TREATMENT', options: [] },
    { page: 17, sectionCode: 'COL-8', title: 'SURVEILLANCE', options: [] },
    { page: 22, sectionCode: 'COL-13', title: 'ADJUVANT TREATMENT', options: [] },
  ];
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('colon-surgery-path', '結腸癌手術／術前治療情境', '先手術'),
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIA'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'pT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'pN0'),
    keyedField('colon-margin', '結腸癌手術切緣', '陰性'),
    keyedField('colon-high-risk', '結腸癌 Stage II 高風險特徵', ['無上述特徵']),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ];
  const result = matcher.colonAdjuvantAssessment([fakeNccnDocument('Colon Cancer', pages)], fields);
  assert.deepEqual(result.pages.map(item => item.page.sectionCode), ['COL-4', 'COL-8']);
});

test('HR-positive HER2-negative postoperative assessment uses menopause and Oncotype thresholds', () => {
  const pages = [
    { page: 19, sectionCode: 'BINV-6', title: 'SYSTEMIC ADJUVANT TREATMENT: HR-POSITIVE – HER2-NEGATIVE DISEASE', options: [] },
    { page: 67, sectionCode: 'BINV-K', title: 'ADJUVANT ENDOCRINE THERAPY', options: [
      { label: 'Aromatase inhibitor for 5 years' },
      { label: 'Tamoxifen for 5 years' },
      { label: 'Consider adjuvant abemaciclib' },
      { label: 'Consider adjuvant ribociclib' },
    ] },
    { page: 72, sectionCode: 'BINV-M', title: 'PREOPERATIVE/ADJUVANT THERAPY', options: [
      { label: 'Dose-Dense AC followed by Paclitaxel every 2 weeks' },
      { label: 'Dose-Dense AC followed by weekly Paclitaxel' },
      { label: 'TC (Docetaxel/Cyclophosphamide)' },
    ] },
  ];
  const document = fakeNccnDocument('Breast Cancer', pages);
  const low = matcher.breastAdjuvantAssessment([document], completeBreastAdjuvantFields());
  assert.equal(low.decision.level, 'omit');
  assert.match(low.decision.headline, /Recurrence Score <26/);
  assert.ok(low.decision.regimens.some(item => /Aromatase inhibitor/.test(item.option.label)));
  assert.ok(!low.decision.regimens.some(item => /Dose-dense AC/i.test(item.option.label)));

  const highFields = completeBreastAdjuvantFields().map(field =>
    field.sourceTemplateKey === 'breast-oncotype-rs' ? { ...field, value: '30' } : field
  );
  const high = matcher.breastAdjuvantAssessment([document], highFields);
  assert.equal(high.decision.level, 'recommended');
  assert.match(high.decision.headline, /≥26/);
  assert.ok(high.decision.regimens.some(item => /Dose-dense AC/i.test(item.option.label)));
});

test('HER2-positive upfront surgery maps stage I and higher-risk adjuvant regimens', () => {
  const pages = [
    { page: 18, sectionCode: 'BINV-5', title: 'SYSTEMIC ADJUVANT TREATMENT: HER2-POSITIVE', options: [] },
    { page: 74, sectionCode: 'BINV-M', title: 'HER2-POSITIVE PREOPERATIVE/ADJUVANT THERAPY', options: [
      { label: 'Paclitaxel + Trastuzumab' },
      { label: 'TCH (Docetaxel/Carboplatin + Trastuzumab)' },
      { label: 'TCHP (Docetaxel/Carboplatin + Trastuzumab + Pertuzumab)' },
    ] },
  ];
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'pT1c' };
    if (field.sourceTemplateKey === 'breast-her2') return { ...field, value: 'IHC 3+' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: 'HER2+' };
    return field;
  });
  const result = matcher.breastAdjuvantAssessment([fakeNccnDocument('Breast Cancer', pages)], fields);
  assert.equal(result.decision.level, 'recommended');
  assert.ok(result.decision.regimens.some(item => /Paclitaxel \+ Trastuzumab/.test(item.option.label)));
  assert.ok(result.decision.regimens.some(item => /^TCH /.test(item.option.label)));
});

test('post-neoadjuvant TNBC continues pembrolizumab only when it was used preoperatively', () => {
  const document = fakeNccnDocument('Breast Cancer', [
    { page: 29, sectionCode: 'BINV-16', title: 'ADJUVANT SYSTEMIC THERAPY AFTER PREOPERATIVE SYSTEMIC THERAPY', options: [] },
    { page: 73, sectionCode: 'BINV-M', title: 'TNBC PREOPERATIVE/ADJUVANT THERAPY', options: [
      { label: 'Carboplatin/Paclitaxel + Pembrolizumab followed by Pembrolizumab (adjuvant)' },
      { label: 'Capecitabine' },
      { label: 'Olaparib' },
    ] },
  ]);
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-surgery-path') return { ...field, value: '術前全身治療後達 pCR' };
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'ypT0／ypTis' };
    if (field.sourceTemplateKey === 'breast-pn') return { ...field, value: 'ypN0' };
    if (field.sourceTemplateKey === 'breast-er' || field.sourceTemplateKey === 'breast-pr') return { ...field, value: '陰性' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: '三陰性' };
    if (field.sourceTemplateKey === 'breast-initial-clinical-risk') return { ...field, value: 'cT1–3、cN0–1' };
    return field;
  });
  const noHistory = matcher.breastAdjuvantAssessment([document], fields, []);
  assert.equal(noHistory.decision.level, 'review');
  assert.match(noHistory.decision.headline, /尚缺術前實際用藥紀錄/);
  assert.ok(!noHistory.decision.regimens?.some(item => /Pembrolizumab/i.test(item.option.label)));

  const withoutPembrolizumab = matcher.breastAdjuvantAssessment([document], fields, [
    { id: 'tx-chemo', phase: '術前／新輔助', treatment: 'Carboplatin/Paclitaxel', status: '已完成' },
  ]);
  assert.equal(withoutPembrolizumab.decision.level, 'omit');

  const withHistory = matcher.breastAdjuvantAssessment([document], fields, [
    { id: 'tx', phase: '術前／新輔助', treatment: 'Carboplatin/Paclitaxel + Pembrolizumab', status: '已完成' },
  ]);
  assert.equal(withHistory.decision.level, 'recommended');
  assert.ok(withHistory.decision.regimens.some(item => /Pembrolizumab/i.test(item.option.label)));
});

test('HR-positive HER2-negative pT1bN0 grade 1 without LVI stays on endocrine therapy', () => {
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'pT1b' };
    if (field.sourceTemplateKey === 'breast-grade') return { ...field, value: 'Grade 1' };
    return field;
  });
  const result = matcher.breastAdjuvantAssessment([], fields);
  assert.equal(result.decision.level, 'omit');
  assert.match(result.decision.headline, /Grade 1 且無 LVI/);
});

test('post-neoadjuvant HER2-positive pCR requires the preoperative nodal status before choosing pertuzumab', () => {
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-surgery-path') return { ...field, value: '術前全身治療後達 pCR' };
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'ypT0／ypTis' };
    if (field.sourceTemplateKey === 'breast-pn') return { ...field, value: 'ypN0' };
    if (field.sourceTemplateKey === 'breast-her2') return { ...field, value: 'IHC 3+' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: 'HER2+' };
    if (field.sourceTemplateKey === 'breast-initial-nodal-status') return { ...field, value: '待確認' };
    return field;
  });
  const result = matcher.breastAdjuvantAssessment([], fields, [
    { id: 'tx', phase: '術前／新輔助', treatment: 'TCH', status: '已完成' },
  ]);
  assert.equal(result.status, 'missing');
  assert.ok(result.missing.some(item => /術前治療前臨床淋巴結/.test(item)));
  assert.equal(result.decision.regimens?.length || 0, 0);
});
test('post-neoadjuvant HER2-positive residual disease offers high-risk T-DXd and T-DM1 without restarting TCHP', () => {
  const document = fakeNccnDocument('Breast Cancer', [
    { page: 29, sectionCode: 'BINV-16', title: 'ADJUVANT SYSTEMIC THERAPY AFTER PREOPERATIVE SYSTEMIC THERAPY', options: [] },
    { page: 74, sectionCode: 'BINV-M', title: 'HER2-POSITIVE PREOPERATIVE/ADJUVANT THERAPY', options: [
      { label: 'Fam-trastuzumab deruxtecan-nxki for those with high risk of recurrence' },
      { label: 'Ado-trastuzumab emtansine (T-DM1)' },
      { label: 'TCHP (Docetaxel/Carboplatin + Trastuzumab + Pertuzumab)' },
    ] },
  ]);
  const fields = completeBreastAdjuvantFields().map(field => {
    if (field.sourceTemplateKey === 'breast-surgery-path') return { ...field, value: '術前治療後有殘存浸潤癌' };
    if (field.sourceTemplateKey === 'breast-pt') return { ...field, value: 'ypT1' };
    if (field.sourceTemplateKey === 'breast-pn') return { ...field, value: 'ypN1' };
    if (field.sourceTemplateKey === 'breast-her2') return { ...field, value: 'IHC 3+' };
    if (field.sourceTemplateKey === 'breast-subtype') return { ...field, value: 'HER2+' };
    if (field.sourceTemplateKey === 'breast-initial-clinical-risk') return { ...field, value: 'cT1–3、cN0–1' };
    if (field.sourceTemplateKey === 'breast-initial-nodal-status') return { ...field, value: 'cN1' };
    return field;
  });
  const history = [{ id: 'tx', phase: '術前／新輔助', treatment: 'TCHP', status: '已完成', completedCycles: '6', plannedCycles: '6' }];
  const result = matcher.breastAdjuvantAssessment([document], fields, history);
  const labels = result.decision.regimens.map(item => item.option.label);
  assert.ok(labels.some(label => /deruxtecan/i.test(label)));
  assert.ok(labels.some(label => /emtansine/i.test(label)));
  assert.ok(!labels.some(label => /^TCHP/.test(label)));
  assert.ok(result.decision.items.some(item => /術前 HER2 導向治療/.test(item)));
});
test('treatment history prevents duplicate postoperative platinum chemotherapy in NSCLC', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('nsclc-surgery-path', 'NSCLC 手術／術前治療情境', '先手術（未接受術前全身治療）'),
    keyedField('nsclc-path-stage', 'NSCLC 術後病理分期', 'IIB'),
    keyedField('nsclc-pt', 'NSCLC 病理 T 分期', 'pT3'),
    keyedField('nsclc-pn', 'NSCLC 病理 N 分期', 'pN0'),
    keyedField('nsclc-margin', 'NSCLC 手術切緣', 'R0（陰性）'),
    keyedField('nsclc-histology', 'NSCLC 組織型', '腺癌'),
    keyedField('nsclc-cisplatin', 'Cisplatin 適用性', '適合 cisplatin'),
  ];
  const history = [{ phase: '術後／輔助', treatment: 'Cisplatin/Pemetrexed', status: '已完成', completedCycles: '4', plannedCycles: '4' }];
  const result = matcher.nsclcAdjuvantAssessment([], fields, history);
  assert.equal(result.decision.level, 'omit');
  assert.match(result.decision.headline, /已完成術後含鉑化療/);
  assert.equal(result.treatmentHistoryUsed, true);
});

test('colon history supplies a preoperative regimen and blocks a completed postoperative duplicate', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('colon-surgery-path', '結腸癌手術／術前治療情境', '先手術'),
    keyedField('colon-path-stage', '結腸癌術後病理分期', 'IIIB'),
    keyedField('colon-pt', '結腸癌病理 T 分期', 'pT3'),
    keyedField('colon-pn', '結腸癌病理 N 分期', 'pN1'),
    keyedField('colon-margin', '結腸癌手術切緣', '陰性'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ];
  const preoperative = matcher.colonAdjuvantAssessment([], fields, [
    { phase: '術前／新輔助', treatment: 'FOLFOX', status: '未完成／待續', completedCycles: '4', plannedCycles: '8' },
  ]);
  assert.equal(preoperative.status, 'ready');
  assert.match(preoperative.decision.headline, /補足總療程/);

  const completed = matcher.colonAdjuvantAssessment([], fields, [
    { phase: '術後／輔助', treatment: 'FOLFOX', status: '已完成', completedCycles: '12', plannedCycles: '12' },
  ]);
  assert.equal(completed.decision.level, 'omit');
  assert.match(completed.decision.headline, /不再重複建議/);
});

test('rectal history recognizes completed TNT and completed postoperative CAPEOX', () => {
  const fields = [
    keyedField('base-treatment-setting', '治療階段／線別', '術後／鞏固'),
    keyedField('rectal-surgery-path', '直腸癌手術／術前治療情境', '術前化放療後手術'),
    keyedField('rectal-path-stage', '直腸癌術後病理分期', 'IIIB'),
    keyedField('rectal-pt', '直腸癌病理 T 分期', 'ypT3'),
    keyedField('rectal-pn', '直腸癌病理 N 分期', 'ypN1'),
    keyedField('rectal-margin', '直腸癌切緣', '陰性'),
    keyedField('rectal-crm', '直腸癌環周切緣（CRM）', '陰性／未受威脅'),
    keyedField('crc-mmr-msi', 'MMR／MSI', 'pMMR／MSS'),
  ];
  const tnt = matcher.rectalAdjuvantAssessment([], fields, [
    { phase: '術前／新輔助', treatment: 'FOLFOX', status: '已完成', completedCycles: '8', plannedCycles: '8' },
    { phase: '放射治療', treatment: 'Long-course chemo/RT', status: '已完成' },
  ]);
  assert.equal(tnt.decision.level, 'omit');
  assert.match(tnt.decision.headline, /已完成 TNT/);

  const completed = matcher.rectalAdjuvantAssessment([], fields.map(item =>
    item.sourceTemplateKey === 'rectal-surgery-path' ? { ...item, value: '先做經腹切除' } : item
  ), [{ phase: '術後／輔助', treatment: 'CAPEOX', status: '已完成', completedCycles: '8', plannedCycles: '8' }]);
  assert.equal(completed.decision.level, 'omit');
  assert.match(completed.decision.headline, /不再重複建議/);
});