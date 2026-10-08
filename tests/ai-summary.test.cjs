const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GEMINI_INTERACTIONS_URL,
  SYSTEM_INSTRUCTION,
  buildPrompt,
  extractInteractionText,
  parseStructuredJson,
  normalizeSummary,
  summarizeCase,
} = require('../gemini-summary.cjs');

const caseInput = {
  schemaVersion: 1,
  cancer: { id: 'breast_cancer', name: '乳癌' },
  context: { phase: 'postoperative', conflicts: [] },
  caseFields: [
    { key: 'breast-er', label: 'ER', value: ['低度陽性（1–10%）'] },
    { key: 'breast-pr', label: 'PR', value: ['陰性'] },
    { key: 'breast-grade', label: '組織學分級', value: ['Grade 3'] },
    { key: 'breast-pn', label: '病理淋巴結分期', value: ['pN1（1–3 顆陽性）'] },
  ],
  deterministicAssessment: {
    headline: '需先完成基因表現結果判讀',
    missing: ['可判讀的基因表現檢測結果'],
  },
  evidence: [
    {
      reference: 'BINV-6 · PDF p.19',
      source: 'Breast Cancer · 2026',
      contextComplete: true,
      sourceContextVersion: 2, truncated: false, role: 'primary', selectionReasons: ['Test branch'], requiredReferences: [],
      pageText: 'Adjuvant chemotherapy followed by endocrine therapy',
      options: ['Adjuvant chemotherapy followed by endocrine therapy'],
    },
  ],
  evidenceAudit: { version: 1, status: 'ready', selectedPageCount: 1, sentPageCount: 1, inventory: ['BINV-6 · PDF p.19'], blockers: [] },
};
const support = target => ({ target, reference: caseInput.evidence[0].reference, quote: caseInput.evidence[0].pageText });
const sourceReviews = [{ reference: caseInput.evidence[0].reference, applicability: 'applies', reason: 'Synthetic applicable branch.' }];

test('prompt treats ER-low and missing assay as explicit decision risks', () => {
  const prompt = buildPrompt(caseInput);
  assert.match(SYSTEM_INSTRUCTION, /ER 低度陽性（1–10%）/);
  assert.match(SYSTEM_INSTRUCTION, /Recurrence Score 0/);
  assert.match(prompt, /高風險病理特徵/);
  assert.match(prompt, /pN1/);
});

test('interaction text is extracted from the final model output step', () => {
  const text = extractInteractionText({
    steps: [
      { type: 'model_output', content: [{ type: 'text', text: '{"old":true}' }] },
      { type: 'model_output', content: [{ type: 'text', text: '{"new":' }, { type: 'text', text: 'true}' }] },
    ],
  });
  assert.equal(text, '{"new":true}');
});

test('structured JSON parser accepts a fenced response without weakening schema validation', () => {
  assert.deepEqual(parseStructuredJson('```json\n{"decision":"證據不足，需核對"}\n```'), {
    decision: '證據不足，需核對',
  });
  assert.throws(() => parseStructuredJson('not-json'), /不是有效 JSON/);
});

test('normalization caps lists and drops evidence references not supplied by the app', () => {
  const summary = normalizeSummary({
    source_reviews: sourceReviews,
    decision: '建議輔助性化療',
    headline: '目前高風險病理特徵使輔助性化療成為主要評估方向。',
    key_reasons: ['pN1', 'Grade 3', 'ER-low', 'PR 陰性', '不應保留的第五項'],
    now_do: ['核對 BINV-6'],
    missing_information: ['基因表現檢測'],
    uncertainties: ['ER-low 需核對原頁'],
    evidence_refs: ['BINV-6 · PDF p.19', '假的頁碼 · PDF p.999'],
    evidence_support: ['headline', 'key_reasons:0', 'key_reasons:1', 'key_reasons:2', 'key_reasons:3'].map(support),
  }, caseInput);
  assert.equal(summary.keyReasons.length, 4);
  assert.equal(summary.sourceCheckVersion, 2);
  assert.deepEqual(summary.evidenceRefs, ['BINV-6 · PDF p.19']);
});
test('eligible quotes cannot authorize a therapy with missing prerequisites or leak its discarded action quote',()=>{
  const quote='Consider adjuvant abemaciclib for eligible patients.';
  const input=structuredClone(caseInput);input.evidence[0].pageText+=' '+quote;
  const output={source_reviews:sourceReviews,decision:'建議輔助性化療',headline:'核對輔助化療方向',now_do:['建議 Abemaciclib'],evidence_support:[support('headline'),{target:'now_do:0',reference:input.evidence[0].reference,quote}]};
  const result=normalizeSummary(output,input);
  assert.equal(result.evidenceStatus,'quoted-source');assert.deepEqual(result.nowDo,[]);
  assert.deepEqual(result.evidenceSupport.map(s=>s.target),['headline']);
  const blocked=normalizeSummary({...output,headline:'建議 Abemaciclib'},input);
  assert.equal(blocked.evidenceStatus,'insufficient');assert.deepEqual(blocked.evidenceSupport,[]);
});
test('page-region quotes must exist both in the preserved original text and selected passages',()=>{
  const input=structuredClone(caseInput);
  input.evidence[0].branch={status:'located',passages:[{kind:'branch',box:[0,0,1,1],text:'Only the selected branch text.'}]};
  const output={source_reviews:sourceReviews,decision:'建議輔助性化療',headline:'Test headline',evidence_support:[support('headline')]};
  assert.equal(normalizeSummary(output,input).evidenceStatus,'insufficient');
  output.evidence_support[0].quote='Only the selected branch text.';
  assert.equal(normalizeSummary(output,input).evidenceStatus,'insufficient');
  input.evidence[0].pageText='Only the selected branch text.';
  assert.equal(normalizeSummary(output,input).evidenceStatus,'quoted-source');
  input.evidence[0].branch.passages[0].box=[0,0,NaN,1];
  assert.equal(normalizeSummary(output,input).evidenceStatus,'insufficient');
});

test('Gemini request keeps the key in a header, disables storage, and uses structured JSON', async () => {
  let capturedUrl;
  let capturedOptions;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        steps: [{
          type: 'model_output',
          content: [{
            type: 'text',
            text: JSON.stringify({
              source_reviews: sourceReviews,
              decision: '傾向／應考慮輔助性化療',
              headline: '高風險特徵不應被未知基因檢測結果掩蓋。',
              key_reasons: ['pN1', 'ER-low'],
              now_do: ['核對原頁'],
              missing_information: ['基因表現檢測'],
              uncertainties: ['最終治療需醫師決定'],
              evidence_refs: ['BINV-6 · PDF p.19'],
              evidence_support: [support('headline')],
            }),
          }],
        }],
      }),
    };
  };

  const result = await summarizeCase(caseInput, {
    apiKey: 'test-secret-key',
    model: 'gemini-3.7-flash',
    fetchImpl,
  });
  const requestBody = JSON.parse(capturedOptions.body);
  assert.equal(capturedUrl, GEMINI_INTERACTIONS_URL);
  assert.equal(capturedOptions.headers['x-goog-api-key'], 'test-secret-key');
  assert.doesNotMatch(capturedOptions.body, /test-secret-key/);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.response_format.mime_type, 'application/json');
  assert.equal(result.decision, '傾向／應考慮輔助性化療');
  assert.equal(capturedOptions.signal instanceof AbortSignal, true);
  assert.equal(requestBody.tools, undefined);
});

test('missing, invented and out-of-context evidence cannot retain a definitive headline', () => {
  const answer = { decision: '建議輔助性化療', headline: 'CHEMO-ASSERTION', now_do: ['UNSUPPORTED-ACTION'], evidence_support: [support('headline')] };
  const variants = [
    { ...caseInput, evidence: [] },
    { ...caseInput, context: { phase: 'advanced' } },
    { ...caseInput, deterministicAssessment: { blocked: true } },
    { ...caseInput, evidence: [{ ...caseInput.evidence[0], contextComplete: false }] },
    { ...caseInput, evidence: [{ ...caseInput.evidence[0], pageText: 'A different source', options: [] }] },
  ];
  for (const input of variants) {
    const result = normalizeSummary(answer, input);
    assert.equal(result.decision, '證據不足，需核對');
    assert.doesNotMatch(JSON.stringify(result), /CHEMO-ASSERTION|UNSUPPORTED-ACTION/);
    assert.deepEqual(result.evidenceRefs, []);
  }
});
test('unquoted actions/reasons are omitted even when headline has a quote', () => {
  const result = normalizeSummary({ source_reviews: sourceReviews, decision: '治療方向待核對', headline: '核對原頁', key_reasons: ['unsupported'], now_do: ['unsupported'], evidence_support: [support('headline')] }, caseInput);
  assert.deepEqual(result.keyReasons, []);
  assert.deepEqual(result.nowDo, []);
  assert.equal(result.evidenceStatus, 'quoted-source');
});
test('non-postoperative prompt has no forced adjuvant chemotherapy task', () => {
  const prompt = buildPrompt({ ...caseInput, context: { phase: 'advanced' }, deterministicAssessment: {} });
  assert.doesNotMatch(prompt, /先判斷術後輔助性化療|本次可用 decision：[^\n]*建議輔助性化療/);
});

test('incomplete or oversized evidence is rejected before any provider call, even with forged ready status', async () => {
  let calls = 0;
  const variants = [
    input => { delete input.evidenceAudit; },
    input => { input.evidenceAudit.selectedPageCount = 13; },
    input => { input.evidence[0].requiredReferences = ['MISSING-FOOTNOTE']; },
    input => { input.evidence[0].pageText = 'x'.repeat(16001); },
    input => { input.evidence[0].sourceContextVersion = 1; },
    input => { input.deterministicAssessment.blocked = true; },
  ];
  for (const mutate of variants) {
    const input = structuredClone(caseInput); mutate(input);
    const result = await summarizeCase(input, { apiKey: 'fake-key', fetchImpl: async () => { calls++; throw new Error('Provider must not run'); } });
    assert.equal(result.evidenceStatus, 'insufficient');
    assert.deepEqual(result.evidenceSupport, []);
  }
  assert.equal(calls, 0);
});

test('every page must have one applicable or context-only model review; footnotes alone cannot justify a headline', () => {
  const answer = { decision: '治療方向待核對', headline: 'UNSAFE-HEADLINE', source_reviews: sourceReviews, evidence_support: [support('headline')] };
  for (const reviews of [undefined, [], [...sourceReviews, ...sourceReviews], [{ ...sourceReviews[0], applicability: 'uncertain' }], [{ ...sourceReviews[0], applicability: 'does_not_apply' }], [{ ...sourceReviews[0], reference: 'invented' }], [{ ...sourceReviews[0], reason: '' }], [{ ...sourceReviews[0], applicability: 'context_only' }]]) {
    const result = normalizeSummary({ ...answer, source_reviews: reviews }, caseInput);
    assert.equal(result.evidenceStatus, 'insufficient');
    assert.doesNotMatch(JSON.stringify(result), /UNSAFE-HEADLINE/);
  }
  const input = structuredClone(caseInput); input.evidence[0].role = 'footnotes';
  assert.equal(normalizeSummary(answer, input).evidenceStatus, 'insufficient');
});
