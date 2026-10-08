const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../clinical-matcher.js');
require('../case-review.js');
const review = window.CASE_REVIEW;
const context = { phase: 'postoperative', conflicts: [] };
const fields = [{ key: 'stage', sourceTemplateKey: 'base-treatment-setting', label: '治療階段', value: '術後／鞏固' }];
const page = (number, changes = {}) => ({
  page: number, sectionCode: `ALG-${number}`, title: 'ADJUVANT TREATMENT',
  sourceText: 'A source statement with complete local text and clinical eligibility conditions.',
  options: [], sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [] }, ...changes,
});
function fixture(pages) {
  const doc = { id: 'local-doc-DO-NOT-SEND', title: 'Non-Small Cell Lung Cancer', nccnStructure: { version: '6.2026', evidenceContextVersion: 2, treatmentPages: pages, sections: [] } };
  return pages.map(page => ({ doc, page, reasons: ['adjuvant'], score: 20 }));
}
const assessment = pairs => ({ active: true, status: 'ready', branchLabel: '術後分支', pages: pairs.slice(0, 1), supportingPages: pairs.slice(1), decision: { regimens: [], basis: '術後／病理條件' } });
function packet(pairs, assessed = assessment(pairs), allMatches = pairs, ctx = context) {
  const selection = review.selectEvidence('nsclc', assessed, allMatches, ctx);
  return { selection, payload: review.buildPayload({ cancer: { id: 'nsclc' }, fields, assessment: assessed, context: ctx, selection }) };
}

test('a coherent packet records role, selection reason and exact included inventory', () => {
  const { payload } = packet(fixture([page(29)]));
  assert.equal(payload.evidenceAudit.status, 'ready');
  assert.equal(payload.evidence[0].role, 'primary');
  assert.ok(payload.evidence[0].selectionReasons.length);
  assert.equal(payload.evidenceAudit.selectedPageCount, 1);
  assert.equal(payload.evidenceAudit.sentPageCount, 1);
  assert.deepEqual(review.inspectEvidencePacket(payload), []);
  assert.doesNotMatch(JSON.stringify(payload), /local-doc-DO-NOT-SEND/);
});

test('more than twelve pages blocks the whole packet instead of legitimizing a truncated prefix', () => {
  const { payload } = packet(fixture(Array.from({ length: 13 }, (_, i) => page(i + 1))));
  assert.equal(payload.evidence.length, 0);
  assert.equal(payload.evidenceAudit.selectedPageCount, 13);
  assert.equal(payload.evidenceAudit.sentPageCount, 0);
  assert.equal(payload.evidenceAudit.status, 'blocked');
  assert.match(payload.evidenceAudit.blockers.join(' '), /頁數/);
});

test('single-page and total text overflow block without partial source transfer', () => {
  for (const pages of [[page(1, { sourceText: 'x'.repeat(16001) })], Array.from({ length: 7 }, (_, i) => page(i + 1, { sourceText: 'x'.repeat(10000) }))]) {
    const { payload } = packet(fixture(pages));
    assert.equal(payload.evidence.length, 0);
    assert.equal(payload.evidenceAudit.status, 'blocked');
    assert.match(payload.evidenceAudit.blockers.join(' '), /文字/);
  }
});

test('legacy text alone cannot claim checked source relationships', () => {
  const { payload } = packet(fixture([page(29, { sourceContext: undefined })]));
  assert.equal(payload.evidenceAudit.status, 'blocked');
  assert.match(payload.evidenceAudit.blockers.join(' '), /重新解析/);
});

test('explicit linked footnotes are added from the same document and recorded as required', () => {
  const pairs = fixture([page(29, { sectionCode: 'NSCL-4' })]);
  pairs[0].doc.nccnStructure.sections.push({ ...page(30, { title: 'FOOTNOTES FOR NSCL-4', sourceContext: { version: 2, textExtracted: true, footnotesFor: ['NSCL-4'], requiredReferences: [] } }), code: 'NSCL-4A' });
  const { selection, payload } = packet(pairs);
  assert.deepEqual(selection.evidencePages.map(item => item.page.page), [29, 30]);
  assert.equal(payload.evidence[1].role, 'footnotes');
  assert.deepEqual(payload.evidence[0].requiredReferences, [payload.evidence[1].reference]);
  assert.deepEqual(review.inspectEvidencePacket(payload), []);
});

test('a missing required footnote cannot be replaced by the same code in another document', () => {
  const pairs = fixture([page(29, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'NSCL-4A', kind: 'footnotes' }] } })]);
  const other = fixture([page(30, { sectionCode: 'NSCL-4A' })])[0];
  other.doc = { ...other.doc, id: 'another-document' };
  const { payload } = packet(pairs, assessment(pairs), [...pairs, other]);
  assert.equal(payload.evidenceAudit.status, 'blocked');
  assert.match(payload.evidenceAudit.blockers.join(' '), /NSCL-4A/);
});

test('multi-part reference resolves the explicit part and never chooses the first mention', () => {
  const pairs = fixture([page(29, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'NSCL-E', part: 3, kind: 'eligibility' }] } })]);
  pairs[0].doc.nccnStructure.treatmentPages.push(page(92, { sectionCode: 'NSCL-E', sectionPart: 2 }), page(93, { sectionCode: 'NSCL-E', sectionPart: 3 }));
  const { payload } = packet(pairs);
  assert.deepEqual(payload.evidence.map(item => item.page), [29, 93]);
  assert.deepEqual(review.inspectEvidencePacket(payload), []);
});

test('ambiguous required references block rather than selecting a guessed page', () => {
  const pairs = fixture([page(29, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'NSCL-E', kind: 'eligibility' }] } })]);
  pairs[0].doc.nccnStructure.treatmentPages.push(page(92, { sectionCode: 'NSCL-E', sectionPart: 2 }), page(93, { sectionCode: 'NSCL-E', sectionPart: 3 }));
  const { payload } = packet(pairs);
  assert.equal(payload.evidenceAudit.status, 'blocked');
  assert.match(payload.evidenceAudit.blockers.join(' '), /無法唯一定位/);
});

test('cyclic required links terminate and retain one copy of each page', () => {
  const pairs = fixture([
    page(1, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'ALG-2', kind: 'footnotes' }] } }),
    page(2, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'ALG-1', kind: 'footnotes' }] } }),
  ]);
  const { payload } = packet(pairs.slice(0, 1));
  assert.equal(payload.evidence.length, 2);
  assert.deepEqual(review.inspectEvidencePacket(payload), []);
});

test('explicitly incompatible generic pages are excluded with a reason', () => {
  const pairs = fixture([page(1), page(2, { title: 'METASTATIC SYSTEMIC THERAPY' }), page(3, { title: 'SURVEILLANCE' })]);
  const { selection, payload } = packet(pairs, { active: false, pages: [] }, pairs);
  assert.deepEqual(selection.displayedMatches.map(item => item.page.page), [1]);
  assert.equal(selection.excludedPages.length, 2);
  assert.ok(selection.excludedPages.every(item => item.exclusionReason.length));
  assert.equal(payload.evidence.length, 1);
});

test('references added for context cannot become NHI regimen candidates', () => {
  const pairs = fixture([page(1, { sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [{ code: 'ALG-2', kind: 'footnotes' }] } }), page(2, { options: [{ label: 'A different regimen' }] })]);
  const { selection } = packet(pairs.slice(0, 1));
  assert.equal(selection.evidencePages.length, 2);
  assert.deepEqual(selection.treatmentEvidence, []);
});

test('packet validation recomputes inventory, text limits and required links instead of trusting ready', () => {
  const { payload } = packet(fixture([page(29)]));
  for (const mutate of [
    input => { input.evidenceAudit.selectedPageCount = 2; },
    input => { input.evidence[0].requiredReferences = ['missing reference']; },
    input => { input.evidence[0].pageText = 'x'.repeat(16001); },
    input => { input.evidence[0].contextComplete = false; },
    input => { input.evidenceAudit.inventory = []; },
  ]) {
    const changed = structuredClone(payload); mutate(changed);
    assert.ok(review.inspectEvidencePacket(changed).length);
  }
});

test('large option metadata does not discard full page text or silently clip selected regimens', () => {
  const pairs = fixture([page(29, { options: Array.from({ length: 30 }, (_, i) => ({ label: `Option ${i}` })) })]);
  const { payload } = packet(pairs);
  assert.equal(payload.evidence[0].options.length, 30);
  assert.equal(payload.evidence[0].pageText, pairs[0].page.sourceText);
  assert.equal(payload.evidence[0].truncated, false);
});

test('generic recommendation filtering reuses marker polarity; unknown and mixed flowcharts are not false negatives', () => {
  const pairs = fixture([
    page(1, { role: 'recommendation', options: [{ label: 'Osimertinib' }] }),
    page(2, { role: 'recommendation', options: [{ label: 'Lorlatinib' }] }),
    page(3, { role: 'pathway', options: [{ label: 'Osimertinib' }] }),
  ]);
  for (const pair of pairs) pair.features = [{ key: 'egfr', polarity: 'negative', label: 'EGFR' }];
  const { selection } = packet(pairs, { active: false, pages: [] }, pairs);
  assert.deepEqual(selection.displayedMatches.map(item => item.page.page), [2, 3]);
  assert.match(selection.excludedPages[0].exclusionReason, /EGFR/);
  for (const pair of pairs) pair.features = [];
  assert.equal(packet(pairs, { active: false, pages: [] }, pairs).selection.displayedMatches.length, 3);
});
