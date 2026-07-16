const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nhi-parser.js');
const parser = window.NHI_PARSER;

test('detects compact ROC dates from NHI filenames', () => {
  assert.deepEqual(parser.detectDocumentDates('1150323 健保癌藥給付規定.pdf'), {
    publishedDate: '2026-03-23',
    effectiveDate: '2026-03-23',
    documentDate: '2026-03-23',
  });
});

test('prefers explicit published and effective dates', () => {
  const result = parser.detectDocumentDates('公告日期：2026/03/01\n生效日期：2026/04/01');
  assert.equal(result.publishedDate, '2026-03-01');
  assert.equal(result.effectiveDate, '2026-04-01');
});
