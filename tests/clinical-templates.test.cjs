const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../clinical-templates.js');
const templates = window.CLINICAL_TEMPLATES;

test('seeds disease-specific fields for hematology guidelines that do not use solid-tumor staging', () => {
  const expected = new Map([
    ['myeloid_lymphoid_eosinophilia_tk_fusions', 'mlne-fusion'],
    ['systemic_al_amyloidosis', 'al-treatment-status'],
    ['systemic_mastocytosis', 'sm-subtype'],
    ['waldenstrom_macroglobulinemia', 'wm-treatment-status'],
  ]);
  for (const [cancerId, fieldKey] of expected) {
    const fields = templates.precisionForCancer(cancerId);
    assert.ok(fields.some(field => field.key === fieldKey), `${cancerId}: ${fieldKey}`);
  }
  assert.equal(templates.version, 3);
});

test('explains Child-Pugh score ranges without changing compatibility values', () => {
  const field = templates.precisionForCancer('hepatocellular_carcinoma')
    .find(item => item.key === 'hcc-child-pugh');
  assert.deepEqual(field.options, ['A5', 'A6', 'B7', 'B8', 'B9', 'C', '待確認']);
  assert.equal(field.optionLabels.A5, 'A5（A 級，5 分）');
  assert.equal(field.optionLabels.C, 'C（C 級，10–15 分）');
  assert.match(field.help, /A 級＝5–6 分/);
});
