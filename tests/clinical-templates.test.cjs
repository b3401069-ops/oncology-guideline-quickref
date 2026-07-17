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
  assert.equal(templates.version, 4);
});

test('covers every cancer card with at least one disease-specific field', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const additionalBlock = html.match(/const NCCN_ADDITIONAL_CATEGORIES = \{([\s\S]*?)\n    \};\n\n    for/)?.[1] || '';
  const idMapBlock = html.match(/const ID_MAP = \{([\s\S]*?)\n    \};/)?.[1] || '';
  const additionalIds = [...additionalBlock.matchAll(/\{ id: '([^']+)'/g)].map(match => match[1]);
  const mappedIds = [...idMapBlock.matchAll(/:'([^']+)'/g)].map(match => match[1]);
  const cancerIds = [...new Set([...additionalIds, ...mappedIds])];
  assert.equal(cancerIds.length, 93);
  const commonKeys = new Set(templates.commonPrecisionFields.map(field => field.key));
  const uncovered = cancerIds.filter(cancerId =>
    !templates.precisionForCancer(cancerId).some(field => !commonKeys.has(field.key))
  );
  assert.deepEqual(uncovered, []);
});

test('multi-select negative and pending states are mutually exclusive', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync('clinical-templates.js', 'utf8');
  const cancerIds = [...new Set(source.split('\n')
    .filter(line => line.includes('ids: ['))
    .flatMap(line => [...line.matchAll(/'([^']+)'/g)].map(item => item[1])))];
  for (const cancerId of cancerIds) {
    for (const field of templates.precisionForCancer(cancerId).filter(item => item.type === 'multi_select')) {
      const statusOptions = field.options.filter(option => /^(?:無(?:$|已知|上述|／)|未檢出$|待檢|待確認|pMMR／MSS$|其他／待|wild type／待)/i.test(option));
      for (const option of statusOptions) assert.ok(field.exclusiveOptions?.includes(option), cancerId + ': ' + field.key + ': ' + option);
    }
  }
});

test('exclusive multi-select states clear contradictory values', () => {
  const field = templates.precisionForCancer('nsclc').find(item => item.key === 'nsclc-drivers');
  assert.deepEqual(templates.toggleMultiValue(field, ['EGFR sensitizing'], '待檢'), ['待檢']);
  assert.deepEqual(templates.toggleMultiValue(field, ['待檢'], 'ALK fusion'), ['ALK fusion']);
  assert.deepEqual(templates.toggleMultiValue(field, ['ALK fusion'], 'ROS1 fusion'), ['ALK fusion', 'ROS1 fusion']);
});

test('ambiguous legacy states are visibly marked for confirmation', () => {
  const field = templates.precisionForCancer('gastric_cancer').find(item => item.key === 'uppergi-her2');
  assert.match(field.optionLabels['待檢／不適用'], /需再確認/);
  const molecular = templates.precisionForCancer('small_bowel_cancer').find(item => item.key === 'smallbowel-molecular');
  assert.ok(molecular.exclusiveOptions.includes('無／待檢'));
});

test('all cancer dropdown definitions use unique, non-empty keys and options', () => {
  const fs = require('node:fs');
  const templateSource = fs.readFileSync('clinical-templates.js', 'utf8');
  const cancerIds = [...new Set(templateSource.split('\n')
    .filter(line => line.includes('ids: ['))
    .flatMap(line => [...line.matchAll(/'([^']+)'/g)].map(item => item[1])))];
  for (const cancerId of cancerIds) {
    const fields = templates.precisionForCancer(cancerId);
    const keys = fields.map(field => field.key);
    assert.equal(new Set(keys).size, keys.length, cancerId + ': duplicate field key');
    for (const field of fields.filter(item => ['single_select', 'multi_select'].includes(item.type))) {
      assert.ok(field.options.length > 0, cancerId + ': ' + field.key + ': empty options');
      assert.equal(new Set(field.options).size, field.options.length, cancerId + ': ' + field.key + ': duplicate option');
      for (const option of field.options) {
        assert.equal(option, option.trim(), cancerId + ': ' + field.key + ': untrimmed option');
        assert.ok(option.length > 0, cancerId + ': ' + field.key + ': blank option');
        assert.ok((field.optionLabels?.[option] || option).trim().length > 0, cancerId + ': ' + field.key + ': blank display label');
      }
    }
  }
});

test('explains Child-Pugh score ranges without changing compatibility values', () => {
  const field = templates.precisionForCancer('hepatocellular_carcinoma')
    .find(item => item.key === 'hcc-child-pugh');
  assert.deepEqual(field.options, ['A5', 'A6', 'B7', 'B8', 'B9', 'C', '待確認']);
  assert.equal(field.optionLabels.A5, 'A5（A 級，5 分）');
  assert.equal(field.optionLabels.C, 'C（C 級，10–15 分）');
  assert.match(field.help, /A 級＝5–6 分/);
});
