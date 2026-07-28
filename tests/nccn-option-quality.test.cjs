const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../nccn-parser.js');
require('../clinical-matcher.js');
const parser = window.NCCN_PARSER;
const matcher = window.CLINICAL_MATCHER;

// 模擬 PDF.js 的座標輸出：{x, end, text}
const frag = (x, text, width) => ({ x, end: x + (width ?? text.length * 4), text });
const row = (y, items) => ({ y, items });
const layout = (rows) => ({ rows, text: rows.map(r => r.items.map(i => i.text).join(' ')).join('\n') });

test('同一列的相鄰欄不得被串成一句', () => {
  // NSCLC 演算法頁：workup 欄與 treatment 欄並排，間距遠大於行內字距
  const rows = [row(400, [
    frag(24, '• FDG-PET/CT scan positive', 120),
    frag(300, 'Durvalumab', 60),
  ])];
  const options = parser.extractTreatmentOptions(layout(rows), ['systemic']);
  const labels = options.map(item => item.label);
  assert.ok(!labels.some(label => /FDG-PET\/CT scan positive Durvalumab/.test(label)),
    '跨欄文字被串成同一個候選：' + JSON.stringify(labels));
});

test('檢查與影像步驟不列為治療候選', () => {
  for (const text of ['Bronchoscopy', 'FDG-PET/CT scan', 'PFTs', 'Brain MRI with contrast', 'Biomarker testing including EGFR']) {
    assert.equal(parser.classifyModality(text, ['systemic']), 'workup', text + ' 應歸類為 workup');
  }
  // 真正的治療仍要保留原本的分類
  assert.equal(parser.classifyModality('Osimertinib', ['systemic']), 'systemic');
  assert.equal(parser.classifyModality('Lobectomy', ['surgery']), 'surgery');
  assert.equal(parser.classifyModality('SBRT', ['radiation']), 'radiation');
});

test('沒有治療語意的敘述不再沿用頁面型別', () => {
  const narrative = 'A non-lung cancer diagnosis is at least moderately likely';
  assert.notEqual(parser.classifyModality(narrative, ['systemic']), 'systemic');
});

test('截斷的欄位文字要被修掉', () => {
  const clean = (raw) => parser.normalizeTreatmentOption(raw, { id: 'review', label: 'x' })?.label;
  assert.equal(clean('or Lazertinib'), 'Lazertinib');
  assert.equal(clean('Durvalumab (if'), 'Durvalumab');
  assert.equal(clean('Osimertinib and'), 'Osimertinib');
});

test('全大寫欄位標題不是治療選項', () => {
  for (const heading of ['FIRST-LINE THERAPY', 'ADJUVANT SYSTEMIC THERAPY', 'SUBSEQUENT TREATMENT']) {
    assert.equal(parser.normalizeTreatmentOption(heading, { id: 'review', label: 'x' }), null, heading);
  }
  // 一般大小寫的療程名稱不受影響
  assert.ok(parser.normalizeTreatmentOption('Adjuvant systemic therapy', { id: 'review', label: 'x' }));
});

test('條件命中數相同時，列出具名藥物的頁面優先', () => {
  const pages = [
    { page: 10, sectionCode: 'NSCL-17', role: 'pathway', types: ['systemic'],
      keywords: ['metastatic', 'first-line', 'egfr'], options: [{ label: 'Systemic therapy', modality: 'systemic' }] },
    { page: 20, sectionCode: 'NSCL-21', role: 'pathway', types: ['systemic'],
      keywords: ['metastatic', 'first-line', 'egfr'], options: [
        { label: 'Osimertinib (category 1)', modality: 'systemic' },
        { label: 'Afatinib (category 1)', modality: 'systemic' },
        { label: 'Erlotinib (category 1)', modality: 'systemic' },
      ] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [
    { label: '病程情境', value: '轉移／全身性' },
    { label: '治療階段／線別', value: '第一線' },
    { label: 'NSCLC 驅動基因／可標靶變異', value: 'EGFR sensitizing' },
  ]);
  assert.equal(matches[0].page.sectionCode, 'NSCL-21');
});
