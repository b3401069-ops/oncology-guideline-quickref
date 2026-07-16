const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nhi-versioning.js');
const versioning = window.NHI_VERSIONING;

test('archives an older auto-extracted rule with the same cancer and drug', () => {
  const oldNote = { id: 'old', cancerId: 'colorectal_cancer', label: 'Bevacizumab', autoExtracted: true, current: true };
  const replacement = { id: 'new', cancerId: 'colorectal_cancer', label: 'bevacizumab', autoExtracted: true };
  const updates = versioning.archiveSuperseded([oldNote], [replacement], '2026-07-16');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].archived, true);
  assert.equal(updates[0].supersededBy, 'new');
});

test('does not archive manual notes or rules for another cancer', () => {
  const notes = [
    { id: 'manual', cancerId: 'colorectal_cancer', label: 'Bevacizumab', autoExtracted: false },
    { id: 'lung', cancerId: 'nsclc', label: 'Bevacizumab', autoExtracted: true },
  ];
  const replacement = { id: 'new', cancerId: 'colorectal_cancer', label: 'Bevacizumab', autoExtracted: true };
  assert.deepEqual(versioning.archiveSuperseded(notes, [replacement], '2026-07-16'), []);
});

test('flags only active rules older than the configured interval', () => {
  assert.equal(versioning.isStale({ effectiveDate: '2025-01-01', current: true }, new Date('2026-07-16T00:00:00'), 365), true);
  assert.equal(versioning.isStale({ effectiveDate: '2025-01-01', archived: true }, new Date('2026-07-16T00:00:00'), 365), false);
});
