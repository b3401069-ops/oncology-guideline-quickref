const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nhi-parser.js');
const parser = window.NHI_PARSER;

const cards = [
  { id: 'colorectal_cancer', zhName: '大腸直腸癌', enName: 'Colorectal cancer' },
  { id: 'colon_cancer', zhName: '結腸癌', enName: 'Colon cancer' },
  { id: 'rectal_cancer', zhName: '直腸癌', enName: 'Rectal cancer' },
];

test('colon NHI entries are also assigned to the colorectal umbrella card', () => {
  const result = parser.parsePages([{
    pageNumber: 12,
    text: '9.37. Bevacizumab\n限轉移性大腸癌病患使用，並需符合治療線別及事前審查規定。',
  }], cards);
  const cancerIds = new Set(result.candidates.map(candidate => candidate.cancerId));
  assert.equal(cancerIds.has('colon_cancer'), true);
  assert.equal(cancerIds.has('colorectal_cancer'), true);
});
