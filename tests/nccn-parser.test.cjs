const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nccn-parser.js');
const parser = window.NCCN_PARSER;

const row = (y, text, x = 40) => ({ y, items: [{ x, end: x + text.length * 5, text }] });

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
