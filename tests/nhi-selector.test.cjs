const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nhi-selector.js');
const selector = window.NHI_SELECTOR;

const entry = (id, label, cancerId = 'colorectal_cancer', extra = {}) => ({
  n: { id, label, cancerId, ...extra },
  st: 'review',
});

test('colorectal quick reference reuses existing colon and rectal NHI notes', () => {
  const notes = [
    { id: 'a', cancerId: 'colon_cancer', label: 'Oxaliplatin' },
    { id: 'b', cancerId: 'rectal_cancer', label: 'Bevacizumab' },
    { id: 'c', cancerId: 'breast_cancer', label: 'Trastuzumab' },
  ];
  assert.deepEqual(selector.notesForCancer(notes, 'colorectal_cancer').map(note => note.id), ['a', 'b']);
});

test('generic policy reminders do not become treatment buttons', () => {
  const groups = selector.groupTreatments([
    entry('generic', '比對健保給付規定'),
    entry('drug', 'Irinotecan', 'colorectal_cancer', { autoExtracted: true }),
  ]);
  assert.deepEqual(groups.map(group => group.label), ['Irinotecan']);
});

test('NCCN review candidates remain selectable and link ingredient NHI entries', () => {
  const nhiGroups = selector.groupTreatments([
    entry('irinotecan', 'Irinotecan', 'colorectal_cancer', { autoExtracted: true }),
    entry('bevacizumab', 'Bevacizumab', 'rectal_cancer', { autoExtracted: true }),
  ]);
  const matches = [{
    features: [],
    page: { options: [{
      label: 'FOLFIRI ± (Bevacizumab [preferred] or Ziv-aflibercept or Ramucirumab)',
      modality: 'systemic',
      needsReview: true,
      recommendation: 'review',
    }] },
  }];
  const groups = selector.mergeNccnGroups(nhiGroups, matches, () => ({ blocked: false }));
  const suggested = groups[0];
  assert.equal(suggested.fromNccn, true);
  assert.equal(suggested.requiresSourceReview, true);
  assert.deepEqual(suggested.entries.map(item => item.n.id).sort(), ['bevacizumab', 'irinotecan']);
});

test('slash and and spellings match the same combination drug', () => {
  const left = selector.normalizeTreatmentName('Trifluridine/tipiracil');
  const right = selector.normalizeTreatmentName('Trifluridine and Tipiracil ± Bevacizumab');
  assert.equal(selector.labelsOverlap(left, right), true);
});
