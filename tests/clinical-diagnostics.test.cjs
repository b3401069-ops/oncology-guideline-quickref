const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../clinical-matcher.js');
const matcher = window.CLINICAL_MATCHER;

const doc = {
  title: 'Example Guideline',
  nccnStructure: {
    treatmentPages: [{ page: 10, sectionCode: 'TEST-1', keywords: ['metastatic'], options: [] }],
  },
};

test('suggests actionable unfilled fields when no clinical feature is recognized', () => {
  const fields = [
    { id: 'setting', label: '病程情境', value: '' },
    { id: 'line', label: '治療線別', value: '' },
    { id: 'memo', label: '備註', value: '' },
  ];
  const result = matcher.diagnoseTreatmentMatch([doc], fields);
  assert.equal(result.code, 'insufficient_conditions');
  assert.deepEqual(result.suggestedFields.map(field => field.id), ['setting', 'line']);
});

test('reports the recognized feature that has no indexed treatment page', () => {
  const fields = [{ id: 'setting', label: '病程情境', value: '復發' }];
  const result = matcher.diagnoseTreatmentMatch([doc], fields);
  assert.equal(result.code, 'no_matching_page');
  assert.deepEqual(result.unmatchedFeatures.map(feature => feature.key), ['recurrent']);
});

test('does not report a supported metastatic feature as unmatched', () => {
  const fields = [{ id: 'setting', label: '病程情境', value: '轉移／全身性' }];
  const result = matcher.diagnoseTreatmentMatch([doc], fields);
  assert.deepEqual(result.unmatchedFeatures, []);
  assert.equal(matcher.matchTreatmentPages([doc], fields).length, 1);
});
