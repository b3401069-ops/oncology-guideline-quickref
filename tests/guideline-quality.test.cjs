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
test('tracks guideline version checks without calling an old file current', () => {
  assert.deepEqual(quality.versionCheck({ importedAt: '2026-07-01' }, new Date('2026-07-31')), {
    status: 'current', checkedAt: '2026-07-01', ageDays: 30,
  });
  assert.equal(quality.versionCheck({ versionCheckedAt: '2025-01-01' }, new Date('2026-07-31')).status, 'stale');
  assert.equal(quality.versionCheck({}, new Date('2026-07-31')).status, 'undated');
});

test('summarizes stale and undated NCCN documents separately from parser quality', () => {
  const documents = [
    { importedAt: '2025-01-01', nccnStructure: structure() },
    { nccnStructure: structure() },
  ];
  const result = quality.summarize(documents, 5, new Date('2026-07-31'));
  assert.equal(result.ready, 2);
  assert.equal(result.stale, 1);
  assert.equal(result.undated, 1);
  assert.equal(result.freshnessAttention.length, 2);
});