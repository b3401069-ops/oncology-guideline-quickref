const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('quick reference keeps NCCN, TFDA, and NHI evidence separate', () => {
  assert.match(html, /治療依據分開看/);
  assert.match(html, /window\.TFDA_REGISTRY\.match\(tfdaRecords, selectedTreatment\.label, relatedIds\)/);
  assert.match(html, /同名或療程成分候選/);
  assert.match(html, /這不代表未核准/);
  assert.match(html, /這不代表沒有給付/);
});

test('advanced NSCLC prompts for driver results even when PD-L1 already matches pages', () => {
  assert.match(html, /const nsclcNeedsDriverResult = card\.id === 'nsclc'/);
  assert.match(html, /晚期／復發 NSCLC 在採用 PD-L1 路徑前/);
  assert.match(html, /nccnPromptFields\.map\(renderNhiQueryField\)/);
  assert.match(html, /nccnPromptFields\.forEach/);
  assert.match(html, /\.\.\.nccnDiagnosticFields/);
  assert.doesNotMatch(html, /nccnMatches\.length \? \[\] : nccnDiagnosticFields/);
});

test('selected treatments expose reasons, exclusions, missing data, and source pages', () => {
  for (const label of ['為何出現', '已套用的排除邏輯', '尚缺或需核對', '原始 NCCN 證據']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /selectedNccnSourceButtons/);
  assert.match(html, /openPdf\('\$\{jsStr\(item\.doc\.storageKey\)\}'/);
});

test('TFDA registry is routed, backed up, and visible from settings', () => {
  assert.match(html, /currentRoute === '\/tfda'/);
  assert.match(html, /BACKUP_STORES = \[[^\]]*'tfdaIndications'/s);
  assert.match(html, /管理 TFDA 適應症資料/);
  assert.match(html, /TFDA 藥品許可證與核定仿單/);
});

test('TFDA label parsing exposes batch, review, and manual confirmation states', () => {
  for (const marker of [
    'parse-all-tfda-btn',
    'TFDA_PARSER.extractAndParse',
    'TFDA_REGISTRY.archiveSuperseded',
    "extractionStatus: 'confirmed'",
    '未對應癌別（不會自動命中）',
    '自動擷取待核對',
  ]) {
    assert.ok(html.includes(marker), 'missing TFDA UI marker: ' + marker);
  }
});

test('home dashboard lists actionable guideline health details', () => {
  for (const label of ['尚缺指引系列', '解析需要處理', '版本確認時效', '前往批次匯入']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /qualitySummary\.freshnessAttention/);
});

test('case-first workbench does not require a PDF and keeps unverified output explicit', () => {
  for (const label of [
    '直接開始個案',
    '不需要先匯入 NCCN PDF',
    '個案條件工作台',
    '查看快速參考與待核對事項',
    '證據狀態',
    '尚無 NCCN 原始來源',
    '不會自行產生 NCCN 療程或頁碼',
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /id="case-start-button"/);
  assert.match(html, /const quickrefEvidenceState = hasMatchedNccnPage/);
  assert.match(html, /data-evidence-state="\$\{quickrefEvidenceState\}"/);
});

test('home search tolerates legacy guideline links and exposes working quick starts', () => {
  const searchSource = html.match(/function searchCards\(cards, query\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(searchSource, 'searchCards source not found');
  const searchCards = Function(`${searchSource}; return searchCards;`)();
  const cards = [
    { id: 'breast_cancer', zhName: '乳癌', enName: 'Breast cancer', category: '乳癌', synonyms: undefined, nccnGuidelines: ['legacy link'] },
    { id: 'nsclc', zhName: '非小細胞肺癌', enName: 'NSCLC', category: '肺癌', synonyms: ['肺腺癌'], nccnGuidelines: [{ id: 'nscl', title: undefined }] },
  ];
  assert.deepEqual(searchCards(cards, '乳癌').map(card => card.id), ['breast_cancer']);
  assert.deepEqual(searchCards(cards, '肺腺癌').map(card => card.id), ['nsclc']);
  for (const marker of ['breast_cancer', 'nsclc', 'colorectal_cancer', '搜尋其他癌別', 'compositionend']) {
    assert.match(html, new RegExp(marker));
  }
});

test('quick reference leads with a compact case summary and collapses raw candidate lists', () => {
  for (const label of [
    'Gemini 個案重點',
    '規則式初步整理',
    '現在先做',
    '查看來源與本次輸入',
    '術後治療重點',
    '查看判讀依據',
    '查看必查章節與防漏清單',
    '進階：查看 NCCN 自動擷取候選',
    '選擇要核對的藥物／療程',
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /<details class="result-disclosure">[\s\S]*?displayedNccnMatches\.map\(renderNccnTreatmentMatch\)/);
  assert.match(html, /<details class="result-disclosure mb-3">[\s\S]*?nhi-treatment-options/);
  assert.match(html, /const nccnPromptFields = adjuvant\.active \? \[\]/);
  assert.match(html, /const treatmentEvidence = evidenceSelection\.treatmentEvidence/);
  assert.match(html, /allTreatmentGroups\.filter\(group => group\.fromNccn\)/);
  assert.match(html, /caseSummaryNext/);
  assert.doesNotMatch(html, /<h2 class="section-title">🎯 精準化資訊/);
  assert.doesNotMatch(html, /<details class="result-disclosure(?: mb-3)?" open>/);
});

test('Gemini summary is opt-in and only sends the prepared de-identified payload', () => {
  for (const marker of [
    '用 Gemini 整理本次個案',
    "fetch('/api/clinical-summary'",
    'JSON.stringify(aiSummaryPayload)',
    '不傳送 PDF 檔案',
    'AI 結果仍需回原頁核對',
  ]) assert.ok(html.includes(marker), 'missing Gemini UI marker: ' + marker);
  assert.match(html, /window\.CASE_REVIEW\.buildPayload/);
  assert.match(html, /fields: filledPf, assessment: adjuvant, context: caseContext/);
  assert.match(html, /id="ai-consent"/);
  assert.doesNotMatch(html, /GEMINI_API_KEY/);
});

test('adjuvant source routing also narrows raw candidates and Gemini evidence', () => {
  assert.match(html, /window\.CASE_REVIEW\.selectEvidence/);
  assert.match(html, /const displayedNccnMatches = evidenceSelection\.displayedMatches/);
  assert.match(html, /selection: evidenceSelection, treatmentHistory/);
  assert.match(html, /displayedNccnMatches\.map\(renderNccnTreatmentMatch\)/);
});

test('candidate capture has no early top-k truncation and both UI request paths block incomplete evidence', () => {
  assert.match(html, /matchTreatmentPages\(documents, fields, Infinity\)/);
  assert.match(html, /id="evidence-selection-audit"/);
  assert.match(html, /inspectEvidencePacket\(aiSummaryPayload\)/);
  assert.match(html, /aiSummaryButton.disabled = [^\n]*aiEvidenceIssues.length > 0/);
  assert.match(html, /if \(aiPending[^\n]*aiEvidenceIssues.length\) return/);
  assert.match(html, /模型逐頁適用性自查/);
  assert.match(html, /summary\.sourceCheckVersion !== 2/);
});

test('search results precede the quality dashboard and case summary is not duplicated', () => {
  assert.ok(html.indexOf('id="search-results"') < html.indexOf('class="nccn-quality"'));
  assert.match(html, /nccn-quality'\)\?\.classList.toggle\('hidden'/);
  assert.match(html, /const quickStartCards = \['breast_cancer', 'nsclc', 'colon_cancer', 'rectal_cancer'\]/);
  assert.equal((html.match(/id="case-summary-title"/g) || []).length, 1);
  assert.doesNotMatch(html, /<h2[^>]*>👉 下一步/);
  assert.match(html, /caseRuleFallback.classList.add\('hidden'\)/);
  assert.match(html, /summary.evidenceStatus !== 'quoted-source'/);
  assert.match(html, /AI 摘要未通過來源檢查，保留上方初步整理/);
  assert.match(html, /summary.evidenceSupport.map/);
  assert.match(html, /NCCN_PARSER.needsEvidenceRefresh\(doc\)/);
});
