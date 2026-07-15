(() => {
  'use strict';

  const UNKNOWN = /待檢|待確認|未評估|未做|不適用|unknown|pending|not assessed/i;
  const NEGATIVE = /陰性|未檢出|無已知|無相關|wild\s*-?type|negative|not detected|pMMR|MSS|IHC\s*[01]\+|ISH\s*陰性|低表現/i;
  const MARKERS = [
    ['pd-l1', /PD\s*-?\s*L1/i], ['her2', /HER\s*-?\s*2|ERBB2/i], ['egfr', /\bEGFR\b/i],
    ['alk', /\bALK\b/i], ['ros1', /\bROS1\b/i], ['braf', /\bBRAF\b/i], ['brca', /\bBRCA1?\/?2?\b/i],
    ['ntrk', /\bNTRK(?:1\/?2\/?3)?\b/i], ['ret', /\bRET\b/i], ['kras', /\bKRAS\b/i],
    ['met', /\bMET\b/i], ['fgfr', /\bFGFR[1-4]?\b/i], ['idh', /\bIDH[12]?\b/i], ['nrg1', /\bNRG1\b/i],
    ['sstr', /\bSSTR\b/i], ['ki-67', /Ki\s*-?\s*67/i], ['msi-h/dmmr', /MSI\s*-?\s*H|dMMR|MMRd|MMR\s+loss/i],
    ['tmb-h', /TMB\s*-?\s*(?:H|High)|tumou?r mutational burden\s*-?\s*high/i],
    ['cldn18.2', /CLDN\s*18\.2/i], ['hrd', /\bHRD\b/i], ['folr1', /FOLR1|FR\s*alpha|FRα/i],
    ['psma', /\bPSMA\b/i], ['pik3ca', /\bPIK3CA\b/i], ['esr1', /\bESR1\b/i], ['akt1', /\bAKT1\b/i],
    ['pten', /\bPTEN\b/i], ['pole', /\bPOLE\b/i], ['flt3', /\bFLT3\b/i], ['npm1', /\bNPM1\b/i],
    ['pdgfra', /\bPDGFRA\b/i], ['pdgfrb', /\bPDGFRB\b/i], ['jak2', /\bJAK2\b/i], ['kit', /\bKIT(?:\s+D816V)?\b/i], ['myd88', /\bMYD88\b/i], ['cxcr4', /\bCXCR4\b/i],
  ];

  const FEATURE_LABELS = {
    metastatic: '轉移／全身性', unresectable: '不可切除', resectable: '可切除', recurrent: '復發',
    followup: '治療後追蹤', 'first-line': '第一線', 'second-line': '第二線／後線',
    neoadjuvant: '術前／誘導', adjuvant: '術後／鞏固', 'poorly differentiated nec': '低分化 NEC',
    'well-differentiated net': '高分化 NET', 'limited-stage-sclc': '侷限期 SCLC',
    'extensive-stage-sclc': '廣泛期 SCLC',
    'mixed-hcc-cca': '混合型 HCC-CCA',
    'mpn-pv': 'PV', 'mpn-et': 'ET', 'mpn-mf': 'PMF/pre-PMF',
  };

  const CONTEXT_PATTERNS = {
    metastatic: /metastatic|distant metast|\bM1\b|stage iv/i,
    unresectable: /unresectable|inoperable/i,
    resectable: /(?:^|[^a-z])resectable|operable/i,
    recurrent: /recurren|relapse/i,
    followup: /surveillance|follow-up|monitoring|restaging/i,
    'first-line': /first[- ]line|initial (?:systemic )?therapy|previously untreated/i,
    'second-line': /second[- ]line|subsequent|progression|previously treated/i,
    neoadjuvant: /neoadjuvant|preoperative|induction/i,
    adjuvant: /adjuvant|postoperative|consolidation/i,
    'poorly differentiated nec': /poorly differentiated|neuroendocrine carcinoma|\bNEC\b/i,
    'well-differentiated net': /well[- ]differentiated|neuroendocrine tumor|\bNET\b/i,
    'mixed-hcc-cca': /mixed\s+HCC[- ]CCA|combined hepatocellular[- ]cholangiocarcinoma/i,
    'limited-stage-sclc': /limited[- ]stage/i,
    'extensive-stage-sclc': /extensive[- ]stage/i,
  };

  function featureMatchesText(key, value) {
    const text = normalize(value);
    if (CONTEXT_PATTERNS[key]) return CONTEXT_PATTERNS[key].test(text);
    const marker = MARKERS.find(([markerKey]) => markerKey === key);
    if (marker) {
      marker[1].lastIndex = 0;
      return marker[1].test(text);
    }
    const bclc = key.match(/^bclc-([0abcd])$/);
    if (bclc) return new RegExp('BCLC\\s*(?:stage\\s*)?' + bclc[1] + '\\b', 'i').test(text);
    const ecog = key.match(/^ecog-([0-4])$/);
    if (ecog) return new RegExp('ECOG(?:\\s*PS)?\\s*[:=]?\\s*' + ecog[1] + '\\b', 'i').test(text);
    return text.toLowerCase().includes(String(key || '').toLowerCase());
  }

  function featurePolarityInText(key, value) {
    const text = normalize(value);
    const marker = MARKERS.find(([markerKey]) => markerKey === key);
    if (!marker) return featureMatchesText(key, text) ? 'positive' : null;
    marker[1].lastIndex = 0;
    const match = marker[1].exec(text);
    if (!match) return null;
    const local = text.slice(Math.max(0, match.index - 28), match.index + match[0].length + 40);
    if (key === 'msi-h/dmmr') {
      return /pMMR|MSS|MMR\s*(?:proficient|intact)|microsatellite stable/i.test(local) ? 'negative' : 'positive';
    }
    return NEGATIVE.test(local) || /(?:^|\s)[-−](?:\s|$)/.test(local) ? 'negative' : 'positive';
  }

  const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const hasValue = (value) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '';

  function addFeature(output, key, polarity, field, value) {
    if (!key || polarity === 'unknown') return;
    if (output.some(item => item.key === key && item.polarity === polarity)) return;
    output.push({ key, polarity, field: field.label || '', value: normalize(value), label: FEATURE_LABELS[key] || key.toUpperCase() });
  }

  function markerPolarity(value) {
    const text = normalize(value);
    if (UNKNOWN.test(text)) return 'unknown';
    if (NEGATIVE.test(text) || /HER2\s*[-−]/i.test(text)) return 'negative';
    return 'positive';
  }

  function extractClinicalFeatures(fields) {
    const output = [];
    for (const field of fields || []) {
      if (!hasValue(field.value)) continue;
      const values = Array.isArray(field.value) ? field.value : [field.value];
      for (const value of values) {
        const label = normalize(field.label);
        const raw = normalize(value);
        const combined = label + ' ' + raw;
        const lower = combined.toLowerCase();

        if (/轉移|全身性|metastatic/.test(lower)) addFeature(output, 'metastatic', 'positive', field, value);
        if (/(?:stage|分期)\s*(?:iv|4)(?:[abc])?\b|m1(?!\d)|第四期/i.test(lower)) addFeature(output, 'metastatic', 'positive', field, value);
        if (/局部晚期|不可切除|unresectable/.test(lower)) addFeature(output, 'unresectable', 'positive', field, value);
        if (/初診局限|可切除|resectable/.test(lower) && !/不可切除|unresectable/.test(lower)) addFeature(output, 'resectable', 'positive', field, value);
        if (/復發|recurr/.test(lower)) addFeature(output, 'recurrent', 'positive', field, value);
        if (/治療後追蹤|追蹤|surveillance|follow-up/.test(lower)) addFeature(output, 'followup', 'positive', field, value);
        if (/第一線|first[- ]line/.test(lower)) addFeature(output, 'first-line', 'positive', field, value);
        if (/第二線|第三線|後線|second[- ]line|subsequent/.test(lower)) addFeature(output, 'second-line', 'positive', field, value);
        if (/primary (?:systemic )?(?:therapy|treatment)|newly diagnosed|previously untreated/.test(lower)) addFeature(output, 'first-line', 'positive', field, value);
        if (/previously treated|relapsed/.test(lower)) addFeature(output, 'second-line', 'positive', field, value);
        if (/術前|誘導|neoadjuvant|induction/.test(lower)) addFeature(output, 'neoadjuvant', 'positive', field, value);
        if (/術後|鞏固|adjuvant|consolidation/.test(lower)) addFeature(output, 'adjuvant', 'positive', field, value);
        if (/poorly differentiated nec/.test(lower)) addFeature(output, 'poorly differentiated nec', 'positive', field, value);
        if (/well[- ]differentiated net/.test(lower)) addFeature(output, 'well-differentiated net', 'positive', field, value);
        if (/mixed\s+hcc[- ]cca|combined hepatocellular[- ]cholangiocarcinoma/.test(lower)) addFeature(output, 'mixed-hcc-cca', 'positive', field, value);
        if (/sclc.*侷限期|侷限期.*sclc|limited[- ]stage/.test(lower)) addFeature(output, 'limited-stage-sclc', 'positive', field, value);
        if (/sclc.*廣泛期|廣泛期.*sclc|extensive[- ]stage/.test(lower)) addFeature(output, 'extensive-stage-sclc', 'positive', field, value);

        const bclc = /BCLC/i.test(label) ? raw.match(/^(0|A|B|C|D)$/i) : null;
        if (bclc) addFeature(output, 'bclc-' + bclc[1].toLowerCase(), 'positive', field, value);
        if (/MPN/i.test(label) && /(?:subtype|\u4e9e\u578b)/i.test(label)) {
          if (/\bPV\b/i.test(raw)) addFeature(output, 'mpn-pv', 'positive', field, value);
          if (/\bET\b/i.test(raw)) addFeature(output, 'mpn-et', 'positive', field, value);
          if (/\b(?:PMF|pre-PMF)\b/i.test(raw)) addFeature(output, 'mpn-mf', 'positive', field, value);
        }
        const ecog = /ECOG/i.test(label) ? raw.match(/^[0-4]$/) : null;
        if (/mastocytosis/i.test(label)) {
          if (/aggressive/i.test(raw)) addFeature(output, 'sm-aggressive', 'positive', field, value);
          if (/mast cell leukemia/i.test(raw)) addFeature(output, 'sm-mcl', 'positive', field, value);
          if (/associated hematologic|SM-AHN/i.test(raw)) addFeature(output, 'sm-ahn', 'positive', field, value);
        }
        if (ecog) addFeature(output, 'ecog-' + ecog[0], 'positive', field, value);

        for (const [key, pattern] of MARKERS) {
          pattern.lastIndex = 0;
          if (!pattern.test(combined)) continue;
          addFeature(output, key, markerPolarity(raw), field, value);
        }
        if (/MMR|MSI/i.test(label) && /pMMR|MSS/i.test(raw)) addFeature(output, 'msi-h/dmmr', 'negative', field, value);
      }
    }
    return output;
  }

  function optionText(option) {
    if (typeof option === 'string') return option.toLowerCase();
    return [option?.label, option?.group, option?.context, ...(option?.conditions || [])].filter(Boolean).join(' ').toLowerCase();
  }

  function optionAssessment(option, features) {
    const text = optionText(option);
    let score = 0;
    const conflicts = [];
    for (const feature of features || []) {
      const optionPolarity = featurePolarityInText(feature.key, text);
      if (!optionPolarity) continue;
      if (feature.polarity !== optionPolarity) conflicts.push(feature.label + '條件方向不符');
      else score += 2;
    }
    return { score, conflicts, blocked: conflicts.length > 0 };
  }

  function pageModality(page) {
    const counts = new Map();
    for (const option of page.options || []) {
      const modality = typeof option === 'string' ? '' : option.modality;
      if (!['surgery', 'radiation', 'followup', 'systemic'].includes(modality)) continue;
      counts.set(modality, (counts.get(modality) || 0) + 1);
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant) return dominant[0];
    const types = page.types || [];
    if (types.includes('surgery')) return 'surgery';
    if (types.includes('radiation')) return 'radiation';
    if (types.includes('followup')) return 'followup';
    if (types.includes('systemic')) return 'systemic';
    return 'treatment';
  }
  function pageRoleScore(role) {
    return ({ recommendation: 4, pathway: 3, principles: 1, workup: 0, supporting: -1 })[role] ?? 0;
  }

  function isHccDocument(doc) {
    return /hepatocellular|\bHCC\b/i.test([doc?.title, doc?.fileName, doc?.source, doc?.guidelineName].filter(Boolean).join(' '));
  }
  function hccFeatureMatchesPage(feature, page, pageKeywords) {
    const options = page.options || [];
    const hasModality = modality => options.some(option => typeof option !== 'string' && option.modality === modality);
    if (['bclc-0', 'bclc-a'].includes(feature.key)) {
      return pageKeywords.has('resectable') && hasModality('surgery');
    }
    if (feature.key === 'bclc-b') {
      return pageKeywords.has('unresectable') && options.some(option => /ablation|arterially directed|locoregional|embolization/i.test(optionText(option)));
    }
    const isSystemicRecommendation = page.role === 'recommendation' && (page.types?.includes('systemic') || hasModality('systemic'));
    if (feature.key === 'bclc-c') {
      return isSystemicRecommendation ||
        ['HCC-6', 'HCC-H'].includes(page.sectionCode);
    }
    return ['metastatic', 'unresectable'].includes(feature.key) && isSystemicRecommendation;
  }

  function diseaseSpecificFeatureMatchesPage(feature, page) {
    const code = String(page.sectionCode || '').toUpperCase();
    if (feature.key === 'mpn-pv') return /^PV-/.test(code);
    if (feature.key === 'mpn-et') return /^ET-/.test(code);
    if (feature.key === 'mpn-mf') return /^MF-/.test(code);
    if (feature.key === 'sm-aggressive') return /AGGRESSIVE SYSTEMIC MASTOCYTOSIS/i.test(page.title || '');
    if (feature.key === 'sm-mcl') return /MAST CELL LEUKEMIA/i.test(page.title || '');
    if (feature.key === 'sm-ahn') return /ASSOCIATED HEMATOLOGIC|\bAHN\b/i.test(page.title || '');
    return false;
  }
  function matchTreatmentPages(documents, fields, limit = 12) {
    const features = extractClinicalFeatures(fields);
    const positive = features.filter(item => item.polarity === 'positive');
    if (!positive.length) return [];
    const matches = [];
    for (const doc of documents || []) {
      const hccDocument = isHccDocument(doc);
      for (const page of doc.nccnStructure?.treatmentPages || []) {
        const pageKeywords = new Set((page.keywords || []).map(value => String(value).toLowerCase()));
        if (hccDocument && page.sectionCode === 'HCC-C' && !positive.some(feature => feature.key === 'mixed-hcc-cca')) continue;
        const reasons = positive.filter(feature =>
          pageKeywords.has(feature.key) ||
          (hccDocument && hccFeatureMatchesPage(feature, page, pageKeywords)) ||
          diseaseSpecificFeatureMatchesPage(feature, page)
        ).map(feature => feature.key);
        if (!reasons.length) continue;
        const modality = pageModality(page);
        const score = reasons.length * 4 + pageRoleScore(page.role);
        matches.push({ doc, page, score, reasons, features, modality });
      }
    }
    matches.sort((a, b) => b.score - a.score || a.page.page - b.page.page);
    const selected = [];
    for (const modality of ['surgery', 'radiation', 'systemic', 'followup', 'treatment']) {
      for (const item of matches.filter(match => match.modality === modality).slice(0, 2)) {
        if (!selected.includes(item)) selected.push(item);
      }
    }
    for (const item of matches) {
      if (selected.length >= limit) break;
      if (!selected.includes(item)) selected.push(item);
    }
    selected.sort((a, b) => b.score - a.score || a.page.page - b.page.page);
    return selected.slice(0, limit);
  }

  window.CLINICAL_MATCHER = Object.freeze({
    extractClinicalFeatures,
    matchTreatmentPages,
    optionAssessment,
    featureLabel: (key) => FEATURE_LABELS[key] || String(key || '').toUpperCase(),
  });
})();
