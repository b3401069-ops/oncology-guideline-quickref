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

test('處方附錄的選項要綁定其上方的情境標題', () => {
  // NSCL-J 版面：置中標題 + 底下的項目符號清單
  const rows = [
    row(490, [frag(283, 'PD-L1 ≥50% FIRST-LINE THERAPY (PS 0–2)', 200)]),
    row(446, [frag(28, '• Pembrolizumab followed by maintenance Pembrolizumab (category 1)', 300)]),
    row(434, [frag(28, '• Atezolizumab followed by maintenance Atezolizumab (category 1)', 300)]),
  ];
  const options = parser.extractTreatmentOptions(layout(rows), ['systemic']);
  assert.ok(options.length >= 1, '應擷取到療程');
  for (const option of options) {
    assert.match(option.context, /PD-L1/, option.label + ' 未綁定情境');
  }
  // 標題本身不得成為療程
  assert.ok(!options.some(item => /FIRST-LINE THERAPY \(PS/.test(item.label)));
});

test('驅動基因互斥：ALK 陽性不得看到 EGFR 情境下的處方', () => {
  const alkPositive = matcher.extractClinicalFeatures([
    { label: 'NSCLC 驅動基因／可標靶變異', value: 'ALK fusion' },
  ]);
  const egfrOption = { label: 'Osimertinib (category 1)', context: 'EGFR Exon 19 Deletion First-Line Therapy', modality: 'systemic' };
  assert.equal(matcher.optionAssessment(egfrOption, alkPositive).blocked, true);
  // 同情境的 ALK 處方不受影響
  const alkOption = { label: 'Alectinib (category 1)', context: 'ALK Rearrangement First-Line Therapy', modality: 'systemic' };
  assert.equal(matcher.optionAssessment(alkOption, alkPositive).blocked, false);
});

test('標記只出現在頁面關鍵字、無選項佐證時證據力較弱', () => {
  const pages = [
    // 附錄頁：關鍵字有 ALK，但選項全是免疫治療
    { page: 100, sectionCode: 'NSCL-J', role: 'recommendation', types: ['systemic'],
      keywords: ['metastatic', 'first-line', 'alk'],
      options: [{ label: 'Pembrolizumab', modality: 'systemic' }, { label: 'Atezolizumab', modality: 'systemic' }] },
    // ALK 專屬頁：選項就是 ALK 抑制劑
    { page: 54, sectionCode: 'NSCL-28', role: 'pathway', types: ['systemic'],
      keywords: ['metastatic', 'alk'],
      options: [{ label: 'Alectinib', modality: 'systemic' }, { label: 'Brigatinib', modality: 'systemic' }] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [
    { label: '病程情境', value: '轉移／全身性' },
    { label: '治療階段／線別', value: '第一線' },
    { label: 'NSCLC 驅動基因／可標靶變異', value: 'ALK fusion' },
  ]);
  assert.equal(matches[0].page.sectionCode, 'NSCL-28');
});
test('藥物條件判讀包含 sourceText，pMMR/MSS 要擋下 dMMR/MSI-H 長句', () => {
  const features = matcher.extractClinicalFeatures([{ label: 'MMR／MSI', value: 'pMMR／MSS' }]);
  const option = {
    label: 'Pembrolizumab',
    sourceText: 'Pembrolizumab (dMMR/MSI-H or POLE/POLD1 mutation)',
    modality: 'systemic',
  };
  assert.equal(matcher.optionAssessment(option, features).blocked, true);
});

test('已知陽性驅動基因要擋下需要其他互斥驅動基因的藥物', () => {
  const ros1 = matcher.extractClinicalFeatures([
    { label: 'NSCLC 驅動基因／可標靶變異', value: 'ROS1 fusion' },
  ]);
  const egfr = matcher.extractClinicalFeatures([
    { label: 'NSCLC 驅動基因／可標靶變異', value: 'EGFR sensitizing' },
  ]);
  assert.equal(matcher.optionAssessment({ label: 'Osimertinib', modality: 'systemic' }, ros1).blocked, true);
  assert.equal(matcher.optionAssessment({ label: 'Alectinib', modality: 'systemic' }, egfr).blocked, true);
});

test('轉移情境不混入標題明確為術前或術後的頁面', () => {
  const pages = [
    { page: 74, sectionCode: 'BINV-M', title: 'PREOPERATIVE/ADJUVANT THERAPY', role: 'pathway',
      types: ['systemic'], keywords: ['adjuvant', 'HER2'],
      options: [{ label: 'Trastuzumab + Pertuzumab', modality: 'systemic' }] },
    { page: 93, sectionCode: 'BINV-Q', title: 'SYSTEMIC THERAPY FOR METASTATIC DISEASE', role: 'recommendation',
      types: ['systemic'], keywords: ['metastatic', 'second-line', 'HER2'],
      options: [{ label: 'Fam-trastuzumab deruxtecan-nxki', modality: 'systemic' }] },
  ];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [
    { label: '病程情境', value: '轉移／全身性' },
    { label: '治療階段／線別', value: '第二線' },
    { label: 'HER2 原始結果', value: 'IHC 1+' },
  ]);
  assert.ok(matches.length > 0);
  assert.ok(!matches.some(match => match.page.page === 74));
});

test('追蹤條件命中且頁面有追蹤選項時，卡片歸類為追蹤', () => {
  const pages = [{
    page: 30, sectionCode: 'BINV-17', title: 'POST-TREATMENT MONITORING', role: 'pathway',
    types: ['surgery', 'followup'], keywords: ['followup'],
    options: [
      { label: 'Routine imaging is not indicated after mastectomy', modality: 'surgery' },
      { label: 'Post-treatment monitoring', modality: 'followup' },
    ],
  }];
  const matches = matcher.matchTreatmentPages([{ nccnStructure: { treatmentPages: pages } }], [
    { label: '病程情境', value: '治療後追蹤' },
  ]);
  assert.equal(matches[0].modality, 'followup');
});