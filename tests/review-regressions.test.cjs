const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../clinical-matcher.js');
require('../case-review.js');
const m = window.CLINICAL_MATCHER;
const review = window.CASE_REVIEW;
const fields = data => Object.entries(data).map(([sourceTemplateKey, value]) => ({ sourceTemplateKey, label: sourceTemplateKey, value }));
const breast = changes => fields({
  'base-disease-setting': '初診局限', 'base-treatment-setting': '術後／鞏固',
  'breast-pathology-scope': '浸潤性乳癌', 'breast-surgery-path': '先手術（未接受術前全身治療）',
  'breast-pt': 'pT2', 'breast-pn': 'pN1（1–3 顆陽性）', 'breast-grade': 'Grade 3', 'breast-lvi': '有',
  'breast-er': '陽性', 'breast-pr': '陰性', 'breast-her2': 'IHC 2+／ISH 陰性', 'breast-subtype': 'HR+/HER2-',
  'breast-menopause': '停經後', 'breast-chemotherapy-candidate': '適合接受化療',
  'breast-genomic-assay': 'Oncotype DX', 'breast-oncotype-rs': '30', ...changes,
});
const lung = changes => fields({
  'base-treatment-setting': '術後／鞏固', 'nsclc-surgery-path': '先手術（未接受術前全身治療）',
  'nsclc-path-stage': 'IIB', 'nsclc-pt': 'pT3', 'nsclc-pn': 'pN0', 'nsclc-margin': 'R0（陰性）',
  'nsclc-histology': '腺癌', 'nsclc-cisplatin': '適合 cisplatin', 'nsclc-tumor-size-cm': '4.2',
  'nsclc-drivers': ['無已知可標靶變異'], 'nsclc-pdl1-tps': '80', ...changes,
});
const doc = (pages, version = '6.2026') => ({ title: 'Synthetic guideline', storageKey: 'test-doc', nccnStructure: { version, treatmentPages: pages } });
const lungDoc = doc([
  { page: 29, sectionCode: 'NSCL-4', title: 'FINDINGS AT SURGERY / ADJUVANT TREATMENT', options: [] },
  { page: 30, sectionCode: 'NSCL-4A', title: 'FOOTNOTES FOR NSCL-4', options: [] },
  { page: 92, sectionCode: 'NSCL-E', title: 'Adjuvant Chemotherapy', options: [{ label: 'Cisplatin/Pemetrexed' }] },
  { page: 93, sectionCode: 'NSCL-E', title: 'Other Adjuvant Systemic Therapy', options: ['Osimertinib', 'Atezolizumab', 'Pembrolizumab'].map(label => ({ label })) },
]);

test('R01: chemotherapy eligibility distinguishes unfit, unknown and fit', () => {
  for (const value of ['不適合接受化療', '待確認', '']) {
    const result = m.breastAdjuvantAssessment([], breast({ 'breast-chemotherapy-candidate': value }));
    assert.notEqual(result.decision.level, 'recommended', value);
    assert.equal(result.decision.level, value === '不適合接受化療' ? 'omit' : 'review');
  }
});
test('R02: unknown, non-Oncotype, invalid and stale scores never enter a numeric branch', () => {
  for (const assay of ['其他基因表現檢測', '不適用', '未評估', '已送檢待結果']) {
    for (const score of ['', '0', '30']) {
      const result = m.breastAdjuvantAssessment([], breast({ 'breast-genomic-assay': assay, 'breast-oncotype-rs': score }));
      assert.equal(result.decision.level, 'review', assay + score);
      assert.doesNotMatch(result.decision.basis, /RS \d/);
    }
  }
  for (const score of ['', '-1', '101', 'NaN', '26.5']) assert.equal(m.breastAdjuvantAssessment([], breast({ 'breast-oncotype-rs': score })).decision.level, 'review');
});
test('R03: explicit current phase overrides surgical history across all four cancers', () => {
  for (const [id, key] of [['breast_cancer', 'breast'], ['nsclc', 'nsclc'], ['colon_cancer', 'colon'], ['rectal_cancer', 'rectal']]) {
    for (const setting of ['第一線', '第二線', '術前／誘導', '追蹤', '尚未治療']) {
      const result = m.adjuvantAssessment(id, [], fields({ 'base-treatment-setting': setting, [`${key}-surgery-path`]: '先手術' }));
      assert.equal(result.active, false, id + setting);
    }
    const conflicting = fields({ 'base-disease-setting': '轉移／全身性', 'base-treatment-setting': '術後／鞏固', [`${key}-surgery-path`]: '先手術' });
    assert.equal(m.adjuvantAssessment(id, [], conflicting).active, false);
    assert.equal(m.resolveCaseContext(conflicting).conflicts.length, 1);
  }
});
test('conflicting receptor subtype blocks breast recommendations', () => {
  const result = m.breastAdjuvantAssessment([], breast({ 'breast-her2': 'IHC 3+' }));
  assert.equal(result.status, 'conflict');
  assert.equal(result.decision, null);
});
test('R04/R06: IB keeps the main page and footnotes; absent regimen source never throws', () => {
  const f = lung({ 'nsclc-path-stage': 'IB', 'nsclc-pt': 'pT2a', 'nsclc-high-risk': ['無上述特徵'], 'nsclc-drivers': ['EGFR exon 19 deletion'] });
  for (const docs of [[], [doc(lungDoc.nccnStructure.treatmentPages.slice(0, 2))]]) assert.doesNotThrow(() => m.nsclcAdjuvantAssessment(docs, f));
  const result = m.nsclcAdjuvantAssessment([lungDoc], f);
  assert.deepEqual(result.pages.map(item => item.page.sectionCode), ['NSCL-4']);
  assert.ok(result.supportingPages.some(item => item.page.sectionCode === 'NSCL-4A'));
});
test('R07: completed chemotherapy removes duplicate chemo, not subsequent immunotherapy assessment', () => {
  const history = [{ phase: '術後／輔助', treatment: 'Cisplatin/Pemetrexed', status: '已完成', completedCycles: 4, plannedCycles: 4 }];
  const result = m.nsclcAdjuvantAssessment([lungDoc], lung(), history);
  const labels = result.decision.regimens.map(item => item.option.label).join('|');
  assert.doesNotMatch(labels, /Cisplatin/);
  assert.match(labels, /Atezolizumab/);
  assert.match(labels, /Pembrolizumab/);
});
test('R08: empty source options do not manufacture source-backed regimens', () => {
  const empty = doc(lungDoc.nccnStructure.treatmentPages.map(page => ({ ...page, options: [] })));
  assert.deepEqual(m.nsclcAdjuvantAssessment([empty], lung()).decision.regimens, []);
});
test('R11: ER-low high-risk case emphasizes clinical chemotherapy discussion without invented RS', () => {
  const f = breast({ 'breast-er': '低度陽性（1–10%）', 'breast-genomic-assay': '未評估', 'breast-oncotype-rs': '' });
  const result = m.breastAdjuvantAssessment([], f);
  assert.match(result.decision.headline, /優先討論輔助性化療/);
  assert.equal(result.decision.level, 'consider');
  assert.doesNotMatch(result.decision.basis, /RS/);
  assert.ok(!result.missing.some(label => /基因表現/.test(label)));
  assert.match(result.decision.caveats.join(' '), /不是 NCCN 另訂/);
});
test('breast page selection generalizes menopause/nodes instead of a single pT2 case', () => {
  const source = doc(['BINV-4', 'BINV-6', 'BINV-7', 'BINV-8'].map((sectionCode, i) => ({ sectionCode, page: i + 17, options: [] })), '5.2026');
  for (const [menopause, pn, code] of [['停經後', 'pN0', 'BINV-6'], ['停經後', 'pN1', 'BINV-6'], ['停經前／圍停經期', 'pN0', 'BINV-7'], ['停經前／圍停經期', 'pN1', 'BINV-8']]) {
    const result = m.breastAdjuvantAssessment([source], breast({ 'breast-menopause': menopause, 'breast-pn': pn, 'breast-pt': 'pT1c' }));
    assert.deepEqual(result.pages.map(item => item.page.sectionCode), [code]);
  }
});
test('R05/R13: operative/nonoperative surveillance differs; unfinished TNT stays unfinished', () => {
  const source = doc(['REC-5', 'REC-6', 'REC-10', 'REC-10A', 'REC-14'].map((sectionCode, i) => ({ sectionCode, page: 16 + i, options: [] })), '2.2026');
  const common = { 'base-treatment-setting': '術後／鞏固', 'rectal-path-stage': 'IIA', 'rectal-pt': 'ypT3', 'rectal-pn': 'ypN0', 'rectal-margin': '陰性', 'rectal-crm': '陰性／未受威脅', 'crc-mmr-msi': 'pMMR／MSS' };
  const completed = m.rectalAdjuvantAssessment([source], fields({ ...common, 'rectal-surgery-path': '完成 TNT 後手術' }));
  assert.deepEqual(completed.supportingPages.map(item => item.page.sectionCode), ['REC-10']);
  const unfinished = m.rectalAdjuvantAssessment([source], fields({ ...common, 'rectal-surgery-path': '術前化放療後手術（未完成 TNT）' }));
  assert.deepEqual(unfinished.pages.map(item => item.page.sectionCode), ['REC-5']);
  assert.doesNotMatch(unfinished.branchLabel, /TNT 完成/);
  const nonoperative = m.rectalAdjuvantAssessment([source], fields({ 'base-treatment-setting': '術後／鞏固', 'rectal-surgery-path': '免疫治療後完全臨床反應／未手術', 'crc-mmr-msi': 'dMMR／MSI-H' }));
  assert.deepEqual(nonoperative.missing, []);
  assert.deepEqual(nonoperative.supportingPages.map(item => item.page.sectionCode), ['REC-10A']);
});
test('R12: active empty treatment lists never resurrect generic candidates', () => {
  const assessment = { active: true, status: 'ready', pages: [{ doc: lungDoc, page: lungDoc.nccnStructure.treatmentPages[0] }], decision: { regimens: [] } };
  const result = review.selectEvidence('nsclc', assessment, [{ doc: lungDoc, page: lungDoc.nccnStructure.treatmentPages[2] }], { phase: 'postoperative' });
  assert.deepEqual(result.treatmentEvidence, []);
  assert.deepEqual(result.displayedMatches, []);
});
test('source version change, missing primary page and conflicts block treatment selection', () => {
  for (const variant of [[], [{ doc: doc([], '7.2026'), page: { page: 29, sectionCode: 'NSCL-4' } }]]) {
    const result = review.selectEvidence('nsclc', { active: true, pages: variant }, [], { phase: 'postoperative' });
    assert.equal(result.blocked, true);
  }
  assert.notEqual(review.pageKey({ doc: lungDoc, page: { page: 29 } }), review.pageKey({ doc: { ...lungDoc, storageKey: 'another-file' }, page: { page: 29 } }));
});
test('AI payload preserves source context, caveats and treatment history without arbitrary properties', () => {
  const pair = { doc: doc([]), page: { page: 93, sectionCode: 'NSCL-E', sourceContext: { version: 2, textExtracted: true, footnotesFor: [], requiredReferences: [] }, sourceText: 'Atezolizumab requires previous adjuvant chemotherapy.', options: [{ label: 'Atezolizumab', context: 'After chemotherapy', group: 'Immunotherapy', sourceText: 'Atezolizumab requires previous adjuvant chemotherapy.' }] } };
  const assessment = { active: true, pages: [pair], decision: { caveats: ['Check eligibility'] } };
  const selection = review.selectEvidence('nsclc', assessment, [], { phase: 'postoperative' });
  const input = review.buildPayload({ cancer: { id: 'nsclc' }, fields: lung(), assessment, context: { phase: 'postoperative' }, selection, treatmentHistory: [{ phase: '術後', treatment: 'Cisplatin/Pemetrexed', patientId: 'MUST-NOT-SEND', status: '已完成' }] });
  assert.equal(input.evidence[0].options[0].context, 'After chemotherapy');
  assert.match(input.evidence[0].pageText, /requires/);
  assert.equal(input.deterministicAssessment.caveats[0], 'Check eligibility');
  assert.equal(input.treatmentHistory[0].status, '已完成');
  assert.doesNotMatch(JSON.stringify(input), /MUST-NOT-SEND|test-doc/);
});

test('phase-first field groups preserve hidden values and separate irrelevant breast fields', () => {
  const f = breast({ 'breast-advanced-alterations': ['ESR1'], 'breast-initial-nodal-status': 'cN0', 'breast-genomic-assay': '未評估' });
  const groups = review.groupFields(f, { phase: 'postoperative' });
  assert.deepEqual(groups.entry.map(item => item.sourceTemplateKey), ['base-disease-setting', 'base-treatment-setting']);
  assert.deepEqual(groups.secondary.map(item => item.sourceTemplateKey).sort(), ['breast-advanced-alterations', 'breast-initial-nodal-status', 'breast-oncotype-rs']);
  assert.equal(groups.secondary.find(item => item.sourceTemplateKey === 'breast-oncotype-rs').value, '30');
  assert.equal(groups.entry.length + groups.relevant.length + groups.secondary.length, f.length);
});

test('old source indexes are explicitly incomplete in the AI payload', () => {
  const pair = { doc: lungDoc, page: { sectionCode: 'NSCL-4', page: 29, options: [{ label: 'Old extracted label' }] } };
  const assessment = { active: true, pages: [pair] };
  const selection = review.selectEvidence('nsclc', assessment, [], { phase: 'postoperative' });
  const input = review.buildPayload({ cancer: { id: 'nsclc' }, fields: [], assessment, context: { phase: 'postoperative' }, selection });
  assert.deepEqual(input.evidence, []);
  assert.equal(input.evidenceAudit.status, 'blocked');
  assert.match(input.evidenceLimitations.join(' '), /重新解析/);
});

test('section-index update references cannot shadow the actual decision page', () => {
  const source = {
    title: 'Colon Cancer', nccnStructure: { version: '2.2026',
      sections: [{ code: 'COL-4', page: 4, title: 'SUMMARY OF GUIDELINE UPDATES' }],
      treatmentPages: [{ sectionCode: 'COL-4', page: 13, title: 'PATHOLOGIC STAGE / ADJUVANT TREATMENT', options: [{ label: 'CAPEOX (3 mo)' }] }],
    },
  };
  const result = m.colonAdjuvantAssessment([source], fields({ 'base-treatment-setting': '術後／鞏固', 'colon-surgery-path': '先手術',
    'colon-path-stage': 'IIIB', 'colon-pt': 'pT3', 'colon-pn': 'pN1', 'colon-margin': 'R0（陰性）', 'crc-mmr-msi': 'pMMR／MSS' }));
  assert.deepEqual(result.pages.map(item => item.page.page), [13]);
  const withFootnotes = { ...lungDoc, nccnStructure: { ...lungDoc.nccnStructure,
    sections: [{ code: 'NSCL-4A', page: 30, title: 'FOOTNOTES FOR NSCL-4', sourceText: 'FOOTNOTES FOR NSCL-4: check eligibility.' }],
    treatmentPages: lungDoc.nccnStructure.treatmentPages.filter(page => page.page !== 30),
  } };
  assert.ok(m.nsclcAdjuvantAssessment([withFootnotes], lung()).supportingPages.some(item => item.page.page === 30));
});
