(() => {
  'use strict';

  const field = (label, value) => ({ label, value });
  const expect = (modality, label, sectionPattern, optionPatterns = []) => ({
    modality, label, sectionPattern, optionPatterns,
  });

  const scenarios = [
    {
      id: 'hcc-early-surgery',
      cancerId: 'hepatocellular_carcinoma',
      label: 'HCC BCLC A 手術路徑',
      fields: [field('BCLC stage', 'A')],
      required: ['surgery'],
      expectations: [expect('surgery', 'HCC 手術／局部治療頁', /^HCC-/, [/resect|surg|transplant|ablation/i])],
    },
    {
      id: 'hcc-advanced-systemic',
      cancerId: 'hepatocellular_carcinoma',
      label: 'HCC BCLC C 全身治療',
      fields: [field('BCLC stage', 'C')],
      required: ['systemic'],
      expectations: [expect('systemic', 'HCC 全身治療建議', /^HCC-/, [
        /atezolizumab|bevacizumab|durvalumab|tremelimumab|nivolumab|cabozantinib|lenvatinib|sorafenib/i,
      ])],
    },
    {
      id: 'nsclc-metastatic-first-line',
      cancerId: 'nsclc',
      label: 'NSCLC ROS1 轉移第一線',
      fields: [
        field('病程情境', '轉移／全身性'),
        field('治療階段／線別', '第一線'),
        field('分子／生物標記摘要', 'ROS1 fusion'),
      ],
      required: ['systemic'],
      expectations: [expect('systemic', 'ROS1 標靶治療', /^NSCL-/, [/crizotinib|entrectinib|repotrectinib|ROS1/i])],
      forbiddenOptions: [/osimertinib(?![\s\S]*ROS1)/i],
    },
    {
      id: 'sclc-limited-rt',
      cancerId: 'sclc',
      label: 'SCLC 侷限期放化療',
      fields: [field('SCLC 分期', '侷限期')],
      required: ['radiation', 'systemic'],
      expectations: [
        expect('radiation', 'SCLC 胸腔放射治療頁', /^SCL-/),
        expect('systemic', 'SCLC 含 platinum／etoposide 療程', /^SCL-/, [/cisplatin|carboplatin|etoposide/i]),
      ],
    },
    {
      id: 'crc-resectable-surgery',
      cancerId: 'colorectal_cancer',
      label: '大腸直腸癌可切除手術',
      fields: [field('病程情境', '初診局限')],
      required: ['surgery'],
      expectations: [expect('surgery', '大腸直腸癌切除路徑', /^(COL|REC)-/, [/colectomy|resect|surg|excision/i])],
    },
    {
      id: 'crc-metastatic-later-line',
      cancerId: 'colorectal_cancer',
      label: '大腸直腸癌轉移後線',
      fields: [
        field('病程情境', '轉移／全身性'),
        field('治療階段／線別', '第二線'),
        field('MMR／MSI', 'pMMR／MSS'),
      ],
      required: ['systemic'],
      expectations: [expect('systemic', '轉移後線全身治療', /^(COL|REC)-/, [
        /FOLFOX|FOLFIRI|irinotecan|oxaliplatin|fruquintinib|regorafenib|trifluridine|tipiracil/i,
      ])],
      forbiddenOptions: [/pembrolizumab[\s\S]*(?:MSI-H|dMMR)|(?:MSI-H|dMMR)[\s\S]*pembrolizumab/i],
    },
    {
      id: 'breast-followup',
      cancerId: 'breast_cancer',
      label: '乳癌治療後追蹤',
      fields: [field('病程情境', '治療後追蹤')],
      required: ['followup'],
      expectations: [expect('followup', '乳癌追蹤頁', /^(BINV|DCIS)-/, [/surveillance|follow-up|monitor|mammog|observation/i])],
    },
    {
      id: 'net-metastatic-systemic',
      cancerId: 'neuroendocrine_tumor',
      label: '神經內分泌腫瘤轉移治療',
      fields: [
        field('病程情境', '轉移／全身性'),
        field('治療階段／線別', '第二線'),
        field('分化／分類', 'well-differentiated NET'),
      ],
      required: ['systemic'],
      expectations: [expect('systemic', 'NET 全身治療頁', /^(NET|NE)-/, [
        /everolimus|sunitinib|cabozantinib|lutetium|octreotide|lanreotide|temozolomide|capecitabine/i,
      ])],
    },
  ];

  function optionText(option) {
    return typeof option === 'string'
      ? option
      : [option?.label, option?.sourceText, option?.context, ...(option?.conditions || [])].filter(Boolean).join(' ');
  }

  function activeOptions(match, matcher) {
    return (match.page?.options || []).filter(option => {
      if (typeof option === 'string' || typeof matcher?.optionAssessment !== 'function') return true;
      return !matcher.optionAssessment(option, match.features || []).blocked;
    });
  }

  function patternMatches(pattern, value) {
    if (!pattern) return true;
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(String(value || ''));
    }
    return String(value || '').toLowerCase().includes(String(pattern).toLowerCase());
  }

  function expectationMatches(expectation, match, matcher) {
    if (expectation.modality && match.modality !== expectation.modality) return false;
    if (expectation.sectionPattern && !patternMatches(expectation.sectionPattern, match.page?.sectionCode)) return false;
    if (!expectation.optionPatterns?.length) return true;
    return activeOptions(match, matcher).some(option =>
      expectation.optionPatterns.some(pattern => patternMatches(pattern, optionText(option)))
    );
  }

  function forbiddenMatches(pattern, match, matcher) {
    return activeOptions(match, matcher)
      .map(optionText)
      .find(text => patternMatches(pattern, text));
  }

  function runScenario(scenario, documents, matcher) {
    const related = (documents || []).filter(doc => (doc.cancerIds || []).includes(scenario.cancerId));
    const parsed = related.filter(doc => Array.isArray(doc.nccnStructure?.treatmentPages));
    if (!related.length) return { scenario, status: 'missing_pdf', matches: [], missing: scenario.required, violations: [] };
    if (!parsed.length) return { scenario, status: 'unparsed', matches: [], missing: scenario.required, violations: [] };
    const matches = matcher.matchTreatmentPages(parsed, scenario.fields, 20);
    const expectations = scenario.expectations?.length
      ? scenario.expectations
      : (scenario.required || []).map(modality => ({ modality, label: modality }));
    const missing = expectations
      .filter(expectation => !matches.some(match => expectationMatches(expectation, match, matcher)))
      .map(expectation => expectation.label || expectation.modality);
    const violations = [];
    for (const pattern of scenario.forbiddenOptions || []) {
      for (const match of matches) {
        const text = forbiddenMatches(pattern, match, matcher);
        if (text) violations.push({ pattern: String(pattern), text, page: match.page?.page, sectionCode: match.page?.sectionCode });
      }
    }
    return { scenario, status: missing.length || violations.length ? 'review' : 'pass', matches, missing, violations };
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

  globalThis.CLINICAL_SCENARIOS = Object.freeze({ scenarios, runScenario, summarize });
})();
