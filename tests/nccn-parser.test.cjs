const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nccn-parser.js');
const parser = window.NCCN_PARSER;

const row = (y, text, x = 40) => ({ y, items: [{ x, end: x + text.length * 5, text }] });
const item = (x, text) => ({ x, end: x + text.length * 5, text });

test('prefers the NCCN footer code over flowchart labels', () => {
  const rows = [row(400, 'LOW-RISK'), row(23.5, 'PROS-12')];
  assert.deepEqual(parser.detectSectionCode('LOW-RISK\nPROS-12', rows), { code: 'PROS-12', part: null, total: null });
});

test('extracts monitoring and ADT options that do not look like classic drug suffixes', () => {
  const layout = { rows: [
    row(500, '• Monitoring'),
    row(475, '• Enzalutamide ± leuprolide'),
    row(450, '• Apalutamide + ADT'),
  ] };
  const labels = parser.extractTreatmentOptions(layout, ['treatment', 'followup']).map(option => option.label);
  assert.ok(labels.includes('Monitoring'));
  assert.ok(labels.some(label => /Enzalutamide/.test(label)));
  assert.ok(labels.some(label => /Apalutamide \+ ADT/.test(label)));
});

test('classifies surgery, radiation, systemic therapy and follow-up', () => {
  assert.equal(parser.classifyModality('Radical prostatectomy'), 'surgery');
  assert.equal(parser.classifyModality('SBRT'), 'radiation');
  assert.equal(parser.classifyModality('Apalutamide + ADT'), 'systemic');
  assert.equal(parser.classifyModality('Monitoring every 3 months'), 'followup');
});

test('extracts resolvable next-step section references', () => {
  const refs = parser.extractNextStepReferences('Progression: Workup and Treatment of M1 CRPC (PROS-17)', 'PROS-12');
  assert.equal(refs[0].code, 'PROS-17');
});

test('distinguishes recommendation, pathway, principles and workup pages', () => {
  assert.equal(parser.detectPageRole('SYSTEMIC THERAPY REGIMENS', [{ recommendation: 'preferred' }]), 'recommendation');
  assert.equal(parser.detectPageRole('PRIMARY TREATMENT\nOptions', []), 'pathway');
  assert.equal(parser.detectPageRole('PRINCIPLES OF SYSTEMIC THERAPY', []), 'principles');
  assert.equal(parser.detectPageRole('WORKUP\nImaging', []), 'workup');
});

test('maps primary and previously treated wording to treatment lines', () => {
  assert.ok(parser.pageKeywords('PRIMARY THERAPY FOR NEWLY DIAGNOSED DISEASE').includes('first-line'));
  assert.ok(parser.pageKeywords('THERAPY FOR PREVIOUSLY TREATED DISEASE').includes('second-line'));
});

test('recognizes common hematology regimen names as systemic therapy', () => {
  const option = parser.normalizeTreatmentOption('Bortezomib/Cyclophosphamide/Dexamethasone', {
    id: 'preferred', label: 'Preferred', pageTypes: ['systemic'],
  });
  assert.equal(option.modality, 'systemic');
  assert.equal(option.needsReview, false);
});

test('extracts review-labeled drug candidates from long narrative options', () => {
  const narrative = '\u2022 tebentafusp-tebn (a bispecific protein) or investigator choice of pembrolizumab, ipilimumab, or dacarbazine for metastatic disease when clinically appropriate';
  const options = parser.extractTreatmentOptions({ rows: [row(500, narrative)] }, ['systemic']);
  const derived = options.filter(option => option.derivedFromNarrative);
  for (const label of ['tebentafusp-tebn', 'pembrolizumab', 'ipilimumab', 'dacarbazine']) {
    assert.ok(derived.some(option => option.label.toLowerCase() === label), label);
  }
  assert.ok(derived.every(option => option.sourceNeedsReview && !option.needsReview));
});
test('does not classify a recommendation page with cross references as navigation', () => {
  const text = [
    'NCCN Guidelines Index',
    'Table of Contents',
    'PRINCIPLES OF SYSTEMIC THERAPY',
    'Preferred',
    '• Cisplatin and Etoposide',
    '• Carboplatin and Etoposide',
    'Footnotes (SCL-E 2 of 6)',
    'Subsequent Systemic Therapy (SCL-E 3 of 6)',
    'References (SCL-E 5 of 6)',
  ].join('\n');
  assert.equal(parser.isNavigationIndexPage(text), false);
});
test('maps breast adjuvant subtype and postoperative factors to clinical keywords', () => {
  const keywords = parser.pageKeywords([
    'SYSTEMIC ADJUVANT TREATMENT: HR-POSITIVE – HER2-NEGATIVE DISEASE',
    'After upfront surgery; node-negative; 21-gene recurrence score',
  ].join('\n'));
  for (const key of ['adjuvant', 'breast-hr-positive', 'breast-her2-negative', 'breast-upfront-surgery', 'breast-node-negative', 'breast-genomic-assay']) {
    assert.ok(keywords.includes(key), key);
  }
});
test('extracts unbulleted breast adjuvant decision branches instead of histology labels', () => {
  const layout = {
    text: 'SYSTEMIC ADJUVANT TREATMENT: HR-NEGATIVE – HER2-NEGATIVE DISEASE',
    rows: [
      { y: 500, items: [item(24, '• Ductal/NST')] },
      { y: 457, items: [item(382, 'pN0'), item(438, 'No adjuvant therapy')] },
      { y: 441.5, items: [item(276, 'pT1a (≤0.5 cm)')] },
      { y: 435, items: [item(440, 'Consider adjuvant chemotherapy')] },
      { y: 425, items: [item(382, 'pN1mi')] },
      { y: 423, items: [item(440, 'and adjuvant olaparib if germline'), item(592, 'BRCA1/2'), item(643, 'PV.')] },
      { y: 402.5, items: [item(276, 'pT1b (0.6–1.0 cm)')] },
      { y: 358.5, items: [item(276, 'pT1c–pT3 (>1 cm)')] },
      { y: 356.5, items: [item(440, 'Adjuvant chemotherapy (category 1)')] },
      { y: 344.5, items: [item(440, 'and adjuvant olaparib if germline BRCA1/2 PV.')] },
    ],
  };
  const options = parser.extractTreatmentOptions(layout, ['systemic']);
  assert.ok(options.some(option => /^No adjuvant therapy/i.test(option.label)));
  assert.ok(options.some(option => /^Consider adjuvant chemotherapy/i.test(option.label) && /pT1b/.test(option.conditions.join(' '))));
  assert.ok(options.some(option => /^Adjuvant chemotherapy/i.test(option.label) && /category 1/i.test(option.label)));
  assert.ok(!options.some(option => option.label === 'Ductal/NST'));
});
test('limits schema 8 reparse to breast guidelines while preserving schema 7 indexes elsewhere', () => {
  assert.equal(parser.isCurrentStructure({ title: 'Breast Cancer', nccnStructure: { schemaVersion: 7 } }), false);
  assert.equal(parser.isCurrentStructure({ title: 'Hepatocellular Carcinoma', nccnStructure: { schemaVersion: 7 } }), true);
  assert.equal(parser.isCurrentStructure({ title: 'Breast Cancer', nccnStructure: { schemaVersion: 8 } }), true);
  assert.equal(parser.isCurrentStructure({ title: 'Breast Cancer', nccnStructure: { schemaVersion: 6 } }), false);
});
test('does not classify preoperative systemic regimens as surgery', () => {
  assert.equal(
    parser.classifyModality('Preoperative or adjuvant setting: TC (Docetaxel/Cyclophosphamide)', ['systemic']),
    'systemic'
  );
});