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

test('classifies exact regimen, ingredient, similar name, and unrelated rules separately', () => {
  const normalize = selector.normalizeTreatmentName;
  assert.equal(selector.treatmentMatchLevel(normalize('FOLFOX'), normalize('FOLFOX')), 'exact');
  assert.equal(selector.treatmentMatchLevel(normalize('FOLFOX ± Bevacizumab'), normalize('Oxaliplatin')), 'component');
  assert.equal(selector.treatmentMatchLevel(normalize('Trifluridine/tipiracil + Bevacizumab'), normalize('Trifluridine and Tipiracil')), 'component');
  assert.equal(selector.treatmentMatchLevel(normalize('Pembrolizumab regimen'), normalize('Pembrolizumab')), 'component');
  assert.equal(selector.treatmentMatchLevel(normalize('FOLFOX'), normalize('Osimertinib')), 'none');
});

test('NCCN review candidates preserve ingredient-level NHI evidence without calling it exact', () => {
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
  assert.equal(suggested.nhiMatchLevel, 'component');
  assert.deepEqual(suggested.entries.map(item => item.n.id).sort(), ['bevacizumab', 'irinotecan']);
  assert.ok(suggested.entries.every(item => item.nhiMatchLevel === 'component'));
});

test('slash and and spellings still overlap for similarity review', () => {
  const left = selector.normalizeTreatmentName('Trifluridine/tipiracil');
  const right = selector.normalizeTreatmentName('Trifluridine and Tipiracil ± Bevacizumab');
  assert.equal(selector.labelsOverlap(left, right), true);
});
