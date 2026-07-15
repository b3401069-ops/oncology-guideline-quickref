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
  assert.equal(templates.version, 2);
});
