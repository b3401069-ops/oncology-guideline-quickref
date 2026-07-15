const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../guideline-quality.js');
const quality = window.GUIDELINE_QUALITY;

function structure(overrides = {}) {
  return {
    schemaVersion: 7,
    status: 'parsed',
    sections: [{ code: 'TEST-1' }],
    treatmentPages: [{
      options: [
        { label: 'Resection', modality: 'surgery' },
        { label: 'RT', modality: 'radiation' },
        { label: 'Drug A', modality: 'systemic' },
        { label: 'Surveillance', modality: 'followup' },
      ],
    }],
    ...overrides,
  };
}

test('counts all four treatment modalities for a usable guideline', () => {
  const result = quality.evaluateDocument({ nccnStructure: structure() });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.counts, { surgery: 1, radiation: 1, systemic: 1, followup: 1 });
});

test('classifies review, pending, failed, and redirect documents separately', () => {
  const documents = [
    { title: 'Ready', nccnStructure: structure() },
    { title: 'Review', nccnStructure: structure({ sections: [] }) },
    { title: 'Pending' },
    { title: 'Failed', nccnParseError: 'bad PDF' },
    { title: 'Redirect', nccnStructure: structure({ redirectGuidelines: ['Other Guideline'], treatmentPages: [] }) },
  ];
  const result = quality.summarize(documents);
  assert.equal(result.total, 5);
  assert.equal(result.ready, 1);
  assert.equal(result.review, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.redirect, 1);
  assert.equal(result.parsed, 2);
  assert.deepEqual(result.attention.map(item => item.doc.title), ['Review', 'Pending', 'Failed']);
});
