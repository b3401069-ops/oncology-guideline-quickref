const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../drug-vocabulary.js');
const vocabulary = global.DRUG_VOCABULARY;

test('maps common oncology brand names to generic names', () => {
  assert.equal(vocabulary.matchLevel('Keytruda', 'Pembrolizumab'), 'exact');
  assert.equal(vocabulary.matchLevel('Enhertu', 'Fam-trastuzumab deruxtecan-nxki'), 'exact');
  assert.equal(vocabulary.matchLevel('Kadcyla', 'Ado-trastuzumab emtansine'), 'exact');
});

test('expands regimen abbreviations into individual ingredients', () => {
  assert.equal(vocabulary.matchLevel('TCHP', 'Trastuzumab'), 'ingredient');
  assert.equal(vocabulary.matchLevel('TCHP', 'Carboplatin'), 'ingredient');
  assert.equal(vocabulary.matchLevel('FOLFOX', 'Oxaliplatin'), 'ingredient');
  assert.equal(vocabulary.matchLevel('CAPTEM', 'Temozolomide'), 'ingredient');
});

test('short regimen abbreviations require token boundaries', () => {
  assert.equal(vocabulary.matchLevel('Paclitaxel', 'Doxorubicin'), 'none');
  assert.deepEqual(vocabulary.components('Paclitaxel'), []);
});
