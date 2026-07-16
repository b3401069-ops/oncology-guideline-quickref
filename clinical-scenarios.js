(() => {
  'use strict';

  const field = (label, value) => ({ label, value });
  const scenarios = [
    { id: 'hcc-early-surgery', cancerId: 'hepatocellular_carcinoma', label: 'HCC BCLC A 手術路徑', fields: [field('BCLC stage', 'A')], required: ['surgery'] },
    { id: 'hcc-advanced-systemic', cancerId: 'hepatocellular_carcinoma', label: 'HCC BCLC C 全身治療', fields: [field('BCLC stage', 'C')], required: ['systemic'] },
    { id: 'nsclc-metastatic-first-line', cancerId: 'nsclc', label: 'NSCLC 轉移第一線', fields: [field('病程情境', '轉移／全身性'), field('治療階段／線別', '第一線'), field('分子／生物標記摘要', 'ROS1 fusion')], required: ['systemic'] },
    { id: 'sclc-limited-rt', cancerId: 'sclc', label: 'SCLC 侷限期放化療', fields: [field('SCLC 分期', '侷限期')], required: ['radiation', 'systemic'] },
    { id: 'crc-resectable-surgery', cancerId: 'colorectal_cancer', label: '大腸直腸癌可切除手術', fields: [field('病程情境', '初診局限')], required: ['surgery'] },
    { id: 'crc-metastatic-later-line', cancerId: 'colorectal_cancer', label: '大腸直腸癌轉移後線', fields: [field('病程情境', '轉移／全身性'), field('治療階段／線別', '第二線')], required: ['systemic'] },
    { id: 'breast-followup', cancerId: 'breast_cancer', label: '乳癌治療後追蹤', fields: [field('病程情境', '治療後追蹤')], required: ['followup'] },
    { id: 'net-metastatic-systemic', cancerId: 'neuroendocrine_tumor', label: '神經內分泌腫瘤轉移治療', fields: [field('病程情境', '轉移／全身性'), field('治療階段／線別', '第二線'), field('分化／分類', 'well-differentiated NET')], required: ['systemic'] },
  ];

  function runScenario(scenario, documents, matcher) {
    const related = (documents || []).filter(doc => (doc.cancerIds || []).includes(scenario.cancerId));
    const parsed = related.filter(doc => Array.isArray(doc.nccnStructure?.treatmentPages));
    if (!related.length) return { scenario, status: 'missing_pdf', matches: [], missing: scenario.required };
    if (!parsed.length) return { scenario, status: 'unparsed', matches: [], missing: scenario.required };
    const matches = matcher.matchTreatmentPages(parsed, scenario.fields, 20);
    const modalities = new Set(matches.map(match => match.modality));
    const missing = scenario.required.filter(modality => !modalities.has(modality));
    return { scenario, status: missing.length ? 'review' : 'pass', matches, missing };
  }

  function summarize(documents, matcher) {
    const results = scenarios.map(scenario => runScenario(scenario, documents, matcher));
    return {
      total: results.length,
      pass: results.filter(result => result.status === 'pass').length,
      results,
      attention: results.filter(result => result.status !== 'pass'),
    };
  }

  window.CLINICAL_SCENARIOS = Object.freeze({ scenarios, runScenario, summarize });
})();
