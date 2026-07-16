const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../clinical-scenarios.js');
const scenarios = window.CLINICAL_SCENARIOS;

test('requires all expected modalities and preserves source matches', () => {
  const scenario = { cancerId: 'sclc', label: 'test', fields: [], required: ['radiation', 'systemic'] };
  const doc = { cancerIds: ['sclc'], nccnStructure: { treatmentPages: [] } };
  const matcher = {
    matchTreatmentPages: () => [
      { modality: 'radiation', page: { page: 12 } },
      { modality: 'systemic', page: { page: 13 } },
    ],
  };
  const result = scenarios.runScenario(scenario, [doc], matcher);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.missing, []);
  assert.equal(result.matches[0].page.page, 12);
});

test('separates missing PDF, unparsed PDF, and incomplete clinical routes', () => {
  const scenario = { cancerId: 'nsclc', label: 'test', fields: [], required: ['systemic'] };
  const matcher = { matchTreatmentPages: () => [] };
  assert.equal(scenarios.runScenario(scenario, [], matcher).status, 'missing_pdf');
  assert.equal(scenarios.runScenario(scenario, [{ cancerIds: ['nsclc'] }], matcher).status, 'unparsed');
  assert.equal(scenarios.runScenario(scenario, [{ cancerIds: ['nsclc'], nccnStructure: { treatmentPages: [] } }], matcher).status, 'review');
});

test('covers HCC, lung, colorectal, breast, and neuroendocrine cancers', () => {
  const ids = new Set(scenarios.scenarios.map(item => item.cancerId));
  for (const expected of ['hepatocellular_carcinoma', 'nsclc', 'sclc', 'colorectal_cancer', 'breast_cancer', 'neuroendocrine_tumor']) {
    assert.ok(ids.has(expected), expected);
  }
});
