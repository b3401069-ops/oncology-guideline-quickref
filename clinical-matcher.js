(() => {
  'use strict';

  // 「未知」必須涵蓋所有「還沒測／測不出來」的說法，否則會掉進陽性預設。
  const UNKNOWN = /待檢|待確認|待測|未評估|未做|未檢測|未測|未檢驗|未送檢|無法判讀|不可評估|無法評估|檢測失敗|檢體不足|不適用|unknown|pending|not assessed|not evaluable|indeterminate|inconclusive|QNS/i;
  // 「陰性」需涵蓋 IHC 0（無加號）、無致病變異等寫法。
  const NEGATIVE = /陰性|未檢出|未發現|無已知|無相關|無致病|無突變|無變異|無擴增|無融合|無重排|wild\s*-?type|negative|not detected|no (?:known|detectable)|absent|pMMR|MSS|MMR\s*(?:proficient|intact)|IHC\s*0(?:\+|\b)|ISH\s*陰性|未表現/i;
  // 明確的陽性語意（含變異型態的寫法）。
  const POSITIVE = /陽性|positive|檢出|已檢出|突變|mutat|variant|pathogenic|致病|fusion|融合|rearrang|重排|translocation|amplif|擴增|過度表現|高表現|overexpress|deletion|缺失|insertion|skipping|exon\s*\d+|MSI\s*-?\s*H|dMMR|MMRd|TMB\s*-?\s*(?:H|high)|high|陽性表現|detected/i;
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
    'breast-invasive': '浸潤性乳癌', 'breast-dcis': 'DCIS',
    'breast-upfront-surgery': '先手術', 'breast-post-neoadjuvant': '術前治療後手術',
    'breast-residual-disease': '殘存浸潤性病灶', 'breast-pcr': 'pCR',
    'breast-hr-positive': 'HR-positive', 'breast-hr-negative': 'HR-negative',
    'breast-her2-positive': 'HER2-positive', 'breast-her2-negative': 'HER2-negative',
    'breast-node-positive': '淋巴結陽性', 'breast-node-negative': '淋巴結陰性',
    'breast-genomic-assay': '乳癌基因表現檢測',
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
    'breast-invasive': /invasive breast/i,
    'breast-dcis': /\bDCIS\b|ductal carcinoma in situ/i,
    'breast-upfront-surgery': /after upfront surgery/i,
    'breast-post-neoadjuvant': /after preoperative systemic (?:therapy|treatment)/i,
    'breast-residual-disease': /residual (?:invasive )?disease/i,
    'breast-pcr': /\bpCR\b|pathologic complete response/i,
    'breast-hr-positive': /HR[- ]POSITIVE/i,
    'breast-hr-negative': /HR[- ]NEGATIVE|triple[- ]negative/i,
    'breast-her2-positive': /HER2[- ]POSITIVE/i,
    'breast-her2-negative': /HER2[- ]NEGATIVE|triple[- ]negative/i,
    'breast-node-positive': /node[- ]positive|\bpN[1-3]\b|ypN\+/i,
    'breast-node-negative': /node[- ]negative|\bpN0\b|ypN0/i,
    'breast-genomic-assay': /gene expression assay|21[- ]gene|Oncotype|recurrence score/i,
    'limited-stage-sclc': /limited[- ]stage/i,
    'extensive-stage-sclc': /extensive[- ]stage/i,
  };

  const DIAGNOSTIC_FIELD_PATTERNS = [
    /病程情境|疾病情境|病期|分期|stage|BCLC|可切除|轉移|復發|disease setting/i,
    /治療階段|治療線別|第[一二三]線|line of therapy|treatment line|治療情境/i,
    /病理|組織|分化|分級|grade|histolog|subtype|亞型/i,
    /ECOG|performance status|體能/i,
    /分子|生物標記|基因|突變|表現|marker|mutation|PD-L1|HER2|MMR|MSI/i,
  ];

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

  function her2Polarity(text) {
    const value = normalize(text);
    if (/IHC\s*1\+|IHC\s*2\+\s*[／/]?\s*ISH\s*(?:陰性|negative)|HER2\s*[- ]?(?:low|ultralow)|低表現/i.test(value)) return 'low';
    if (/IHC\s*3\+|IHC\s*2\+\s*[／/]?\s*ISH\s*(?:陽性|positive)/i.test(value)) return 'positive';
    if (/IHC\s*0(?:\+|\b)/i.test(value)) return 'negative';
    return null;
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
    if (key === 'her2') {
      const polarity = her2Polarity(local);
      if (polarity) return polarity;
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

  const NUMERIC_VALUE = /^[<>≥≤]?\s*(\d+(?:\.\d+)?)\s*%?$/;

  // 數值型標記（PD-L1 TPS/CPS 等）只能依模板宣告的臨界值判定。
  // 未宣告臨界值就回 unknown——絕不可把「數字存在」當成陽性。
  function numericPolarity(text, field) {
    const match = normalize(text).match(NUMERIC_VALUE);
    if (!match) return null;
    if (field?.markerPolarity === 'descriptive') return 'unknown';
    const threshold = Number(field?.positiveAtLeast);
    if (!Number.isFinite(threshold)) return 'unknown';
    return Number(match[1]) >= threshold ? 'positive' : 'negative';
  }

  // 判定順序刻意由「明確否定／未知」到「明確肯定」，最後才落到 unknown。
  // 舊版預設為 positive，會把 PD-L1 0%、未檢測誤判成陽性。
  function markerPolarity(value, field, markerPattern, markerKey) {
    const text = normalize(value);
    if (!text) return 'unknown';
    if (UNKNOWN.test(text)) return 'unknown';
    if (markerKey === 'her2') {
      const polarity = her2Polarity(text);
      if (polarity) return polarity;
    }
    if (NEGATIVE.test(text) || /HER2\s*[-−]/i.test(text)) return 'negative';
    const numeric = numericPolarity(text, field);
    if (numeric) return numeric;
    if (POSITIVE.test(text)) return 'positive';
    if (markerKey === 'braf' && /V600(?:E|K)|non[- ]?V600\s+(?:alteration|mutation)/i.test(text)) return 'positive';
    // 選項本身寫出標記名（'ALK fusion'、'BRAF V600E'），代表使用者勾選它為「存在」
    if (markerPattern) {
      markerPattern.lastIndex = 0;
      if (markerPattern.test(text)) return 'positive';
    }
    return 'unknown';
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
        if (/乳癌病理範圍/.test(label)) {
          if (/浸潤性乳癌/.test(raw)) addFeature(output, 'breast-invasive', 'positive', field, value);
          if (/DCIS|非浸潤性/i.test(raw)) addFeature(output, 'breast-dcis', 'positive', field, value);
        }
        if (/手術與術前治療情境/.test(label)) {
          if (/先手術/.test(raw)) addFeature(output, 'breast-upfront-surgery', 'positive', field, value);
          if (/術前全身治療後/.test(raw)) addFeature(output, 'breast-post-neoadjuvant', 'positive', field, value);
          if (/殘存浸潤癌/.test(raw)) addFeature(output, 'breast-residual-disease', 'positive', field, value);
          if (/pCR/i.test(raw)) addFeature(output, 'breast-pcr', 'positive', field, value);
        }
        if (/乳癌臨床亞型/.test(label)) {
          if (/HR\+/.test(raw)) addFeature(output, 'breast-hr-positive', 'positive', field, value);
          if (/三陰性/.test(raw)) addFeature(output, 'breast-hr-negative', 'positive', field, value);
          if (/HER2\+/.test(raw)) addFeature(output, 'breast-her2-positive', 'positive', field, value);
          if (/HER2-/.test(raw)) addFeature(output, 'breast-her2-negative', 'positive', field, value);
          if (/三陰性/.test(raw)) addFeature(output, 'breast-her2-negative', 'positive', field, value);
        }
        if (/HER2 原始結果/.test(label)) {
          if (/IHC\s*3\+|IHC\s*2\+.*ISH\s*陽性/i.test(raw)) addFeature(output, 'breast-her2-positive', 'positive', field, value);
          if (/IHC\s*[01]\+?|IHC\s*2\+.*ISH\s*陰性/i.test(raw)) addFeature(output, 'breast-her2-negative', 'positive', field, value);
        }
        if (/病理淋巴結分期/.test(label)) {
          if (/^(?:pN0|ypN0)$/i.test(raw)) addFeature(output, 'breast-node-negative', 'positive', field, value);
          if (/^(?:pN(?:1mi|[1-3])|ypN[1-3])/i.test(raw)) addFeature(output, 'breast-node-positive', 'positive', field, value);
        }
        if (/乳癌基因表現檢測/.test(label) && !/未評估|不適用|待結果/.test(raw)) {
          addFeature(output, 'breast-genomic-assay', 'positive', field, value);
        }
        if (/poorly differentiated nec/.test(lower)) addFeature(output, 'poorly differentiated nec', 'positive', field, value);
        if (/well[- ]differentiated net/.test(lower)) addFeature(output, 'well-differentiated net', 'positive', field, value);
        if (/mixed\s+hcc[- ]cca|combined hepatocellular[- ]cholangiocarcinoma/.test(lower)) addFeature(output, 'mixed-hcc-cca', 'positive', field, value);
        if (/sclc.*侷限期|侷限期.*sclc|limited[- ]stage/.test(lower)) addFeature(output, 'limited-stage-sclc', 'positive', field, value);
        if (/sclc.*廣泛期|廣泛期.*sclc|extensive[- ]stage/.test(lower)) addFeature(output, 'extensive-stage-sclc', 'positive', field, value);

        const bclc = /BCLC/i.test(label) ? raw.match(/^(0|A|B|C|D)$/i) : null;
        if (bclc) addFeature(output, 'bclc-' + bclc[1].toLowerCase(), 'positive', field, value);
        // 分期欄位：I–IV 都要能路由（原本只有第四期會轉成 metastatic）
        if (/分期|stage|風險分層/i.test(label)) {
          // IIIA／IIB 等帶亞分期字尾也要能辨識，因此不能用 \b 收尾
          const roman = raw.match(/^\s*(?:stage\s*|第)?(IV|III|II|I|[1-4])(?![VXI\d])/i);
          const numeral = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv' };
          if (roman) {
            const token = roman[1].toLowerCase();
            addFeature(output, 'stage-' + (numeral[token] || token), 'positive', field, value);
          }
        }
        // Child-Pugh：肝癌治療選擇的關鍵條件，原本完全未擷取
        const childPugh = /child\s*-?\s*pugh/i.test(label) ? raw.match(/^\s*([ABC])/i) : null;
        if (childPugh) addFeature(output, 'child-pugh-' + childPugh[1].toLowerCase(), 'positive', field, value);
        if (/MPN/i.test(label) && /(?:subtype|亞型)/i.test(label)) {
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
          addFeature(output, key, markerPolarity(raw, field, pattern, key), field, value);
        }
        if (/MMR|MSI/i.test(label) && /pMMR|MSS/i.test(raw)) addFeature(output, 'msi-h/dmmr', 'negative', field, value);
      }
    }
    return output;
  }

  function optionText(option) {
    if (typeof option === 'string') return option.toLowerCase();
    return [option?.label, option?.sourceText, option?.group, option?.context, ...(option?.conditions || [])].filter(Boolean).join(' ').toLowerCase();
  }

  // NCCN 表格內的藥名多半不會重複標記名稱（標記寫在欄位標題或上游情境），
  // 只靠選項文字比對會讓「HER2 陰性看到 trastuzumab」這類矛盾無聲通過。
  // 僅收錄「以該標記為適應症前提」的藥物；免疫檢查點抑制劑不列入
  // （多數適應症不以 PD-L1 陽性為必要條件，列入會造成過度阻擋）。
  const DRUG_MARKER_REQUIREMENTS = [
    { pattern: /deruxtecan/i, anyOf: ['her2'], acceptedPolarities: ['positive', 'low'] },
    { pattern: /trastuzumab|pertuzumab|emtansine|lapatinib|tucatinib|neratinib|margetuximab|zanidatamab/i, anyOf: ['her2'] },
    { pattern: /osimertinib|erlotinib|gefitinib|afatinib|dacomitinib|mobocertinib|amivantamab|lazertinib/i, anyOf: ['egfr'] },
    { pattern: /lorlatinib/i, anyOf: ['alk'] },
    { pattern: /alectinib|brigatinib|ceritinib|ensartinib/i, anyOf: ['alk'] },
    { pattern: /crizotinib/i, anyOf: ['alk', 'ros1'] },
    { pattern: /entrectinib|repotrectinib/i, anyOf: ['ros1', 'ntrk'] },
    { pattern: /taletrectinib/i, anyOf: ['ros1'] },
    { pattern: /larotrectinib/i, anyOf: ['ntrk'] },
    { pattern: /olaparib|niraparib|rucaparib|talazoparib/i, anyOf: ['brca'] },
    { pattern: /vemurafenib|dabrafenib|encorafenib|tovorafenib/i, anyOf: ['braf'] },
    { pattern: /sotorasib|adagrasib/i, anyOf: ['kras'] },
    { pattern: /selpercatinib|pralsetinib/i, anyOf: ['ret'] },
    { pattern: /capmatinib|tepotinib/i, anyOf: ['met'] },
    { pattern: /pemigatinib|infigratinib|futibatinib|erdafitinib/i, anyOf: ['fgfr'] },
    { pattern: /ivosidenib|enasidenib|olutasidenib|vorasidenib/i, anyOf: ['idh'] },
    { pattern: /imatinib|avapritinib|ripretinib/i, anyOf: ['kit'] },
    { pattern: /mirvetuximab/i, anyOf: ['folr1'] },
    { pattern: /zolbetuximab/i, anyOf: ['cldn18.2'] },
    { pattern: /elacestrant/i, anyOf: ['esr1'] },
    { pattern: /capivasertib/i, anyOf: ['pik3ca', 'akt1', 'pten'] },
    { pattern: /alpelisib|inavolisib/i, anyOf: ['pik3ca'] },
    { pattern: /midostaurin|gilteritinib|quizartinib/i, anyOf: ['flt3'] },
    { pattern: /dotatate|lutathera/i, anyOf: ['sstr'] },
    { pattern: /vipivotide|pluvicto|PSMA.{0,30}(?:177|lutetium)|(?:177|lutetium).{0,30}PSMA/i, anyOf: ['psma'] },
    { pattern: /lutetium|lu\s*-?\s*177|177lu/i, anyOf: ['sstr', 'psma'] },
  ];

  function drugRequirementFor(text) {
    return DRUG_MARKER_REQUIREMENTS.find(rule => rule.pattern.test(text)) || null;
  }

  function drugRequiresMarker(text, markerKey) {
    return drugRequirementFor(text)?.anyOf.includes(markerKey) || false;
  }

  function requirementLabel(rule) {
    return rule.anyOf.map(key => FEATURE_LABELS[key] || key.toUpperCase()).join('／');
  }

  // 驅動基因變異臨床上幾乎互斥（一位病人不會同時是 EGFR 與 ALK 陽性）。
  // 處方附錄整頁列出各驅動基因的療程，若不排除，ALK 陽性的病人會看到
  // EGFR 標題底下的處方。
  const EXCLUSIVE_DRIVERS = ['egfr', 'alk', 'ros1', 'braf', 'ret', 'met', 'kras', 'ntrk', 'nrg1'];
  function conflictingDriver(text, positiveDriverKey) {
    for (const key of EXCLUSIVE_DRIVERS) {
      if (key === positiveDriverKey) continue;
      if (featurePolarityInText(key, text) === 'positive') return key;
    }
    return '';
  }

  function optionAssessment(option, features) {
    const text = optionText(option);
    let score = 0;
    const conflicts = [];
    const reviewNotes = [];
    const requirement = drugRequirementFor(text);

    for (const feature of features || []) {
      const optionPolarity = featurePolarityInText(feature.key, text);
      if (optionPolarity) {
        if (feature.polarity !== optionPolarity) conflicts.push(feature.label + '條件方向不符');
        else score += 2;
        continue;
      }
      // 病人已有某個驅動基因陽性，此選項卻掛在另一個驅動基因底下 → 不適用
      if (feature.polarity === 'positive' && EXCLUSIVE_DRIVERS.includes(feature.key)) {
        const other = conflictingDriver(text, feature.key);
        if (other) conflicts.push(feature.label + '陽性，但此項屬於 ' + other.toUpperCase() + ' 的治療情境');
      }
    }

    if (requirement) {
      const accepted = requirement.acceptedPolarities || ['positive'];
      const relevant = (features || []).filter(feature => requirement.anyOf.includes(feature.key));
      const satisfied = relevant.some(feature => accepted.includes(feature.polarity));
      const requiresExclusiveDriver = requirement.anyOf.every(key => EXCLUSIVE_DRIVERS.includes(key));
      const differentPositiveDriver = (features || []).find(feature =>
        feature.polarity === 'positive' && EXCLUSIVE_DRIVERS.includes(feature.key) && !requirement.anyOf.includes(feature.key)
      );
      if (!satisfied && requiresExclusiveDriver && differentPositiveDriver) {
        conflicts.push(differentPositiveDriver.label + '陽性，但此療程需要 ' + requirementLabel(requirement));
      }
      if (satisfied) {
        score += 2;
      } else if (relevant.length) {
        const allAlternativesKnown = requirement.anyOf.every(key => relevant.some(feature => feature.key === key));
        if (requirement.anyOf.length === 1 || allAlternativesKnown) {
          conflicts.push(requirementLabel(requirement) + '條件不符，但此療程以其中一項符合為適應症前提');
        } else {
          reviewNotes.push('此療程需符合 ' + requirementLabel(requirement) + ' 其中一項；目前資料僅排除部分標記');
        }
      } else {
        reviewNotes.push('此療程需符合 ' + requirementLabel(requirement) + ' 其中一項，尚未輸入相關標記結果');
      }
    }
    return { score, conflicts, reviewNotes, blocked: conflicts.length > 0 };
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
  // 角色權重必須大於單一條件的權重（4），否則多匹配一個條件的 workup 頁
  // 會壓過真正的治療建議頁。
  function pageRoleScore(role) {
    return ({ recommendation: 12, pathway: 8, principles: 2, workup: -6, supporting: -8 })[role] ?? 0;
  }

  // 條件命中數相同時，列出具名藥物的頁面比只提到情境的頁面更可用。
  // 上限刻意壓低，避免蓋過條件比對本身。
  const NAMED_DRUG = /(?:mab|nib|zomib|fusp|parib|ciclib|toclax|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|cycline|asone|mustine|phalan|cristine|blastine|vedotin|deruxtecan)\b/i;
  const isMarkerFeature = (key) => MARKERS.some(([markerKey]) => markerKey === key);
  const isActionablePolarity = (polarity) => polarity === 'positive' || polarity === 'low';
  // 該頁是否有「選項本身或其情境」提到此標記，或有以該標記為前提的藥物
  function pageHasOptionEvidence(page, feature) {
    return (page.options || []).some(option => {
      const text = optionText(option);
      return ['positive', 'low'].includes(featurePolarityInText(feature.key, text)) || drugRequiresMarker(text, feature.key);
    });
  }

  function namedDrugBonus(page) {
    const count = (page.options || []).filter(option =>
      typeof option !== 'string' && NAMED_DRUG.test(String(option.label || ''))).length;
    return Math.min(count, 3);
  }

  function isHccDocument(doc) {
    return /hepatocellular|\bHCC\b/i.test([doc?.title, doc?.fileName, doc?.source, doc?.guidelineName].filter(Boolean).join(' '));
  }
  function isBreastDocument(doc) {
    return /breast cancer|乳癌/i.test([doc?.title, doc?.fileName, doc?.source, doc?.guidelineName].filter(Boolean).join(' '));
  }
  function isBreastAdjuvantPage(page, features) {
    const code = String(page.sectionCode || '').toUpperCase();
    const selected = new Set((features || []).filter(feature => feature.polarity === 'positive').map(feature => feature.key));
    if (selected.has('breast-dcis')) return /^DCIS-/.test(code);
    if (!/^BINV-(?:[4-9]|1[0-7]|M)$/.test(code)) return false;
    if (selected.has('breast-post-neoadjuvant') && !/^BINV-(?:1[4-6]|M)$/.test(code)) return false;
    if (selected.has('breast-upfront-surgery') && !/^BINV-(?:[4-9]|1[01]|M)$/.test(code)) return false;
    const title = String(page.title || '');
    if (selected.has('breast-hr-positive') && /HR[- ]NEGATIVE/i.test(title)) return false;
    if (selected.has('breast-hr-negative') && /HR[- ]POSITIVE/i.test(title)) return false;
    if (selected.has('breast-her2-positive') && /HER2[- ]NEGATIVE/i.test(title)) return false;
    if (selected.has('breast-her2-negative') && /HER2[- ]POSITIVE/i.test(title)) return false;
    return true;
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
  function featureMatchesPage(doc, page, feature) {
    const pageKeywords = new Set((page.keywords || []).map(value => String(value).toLowerCase()));
    const hccDocument = isHccDocument(doc);
    if (hccDocument && page.sectionCode === 'HCC-C' && feature.key !== 'mixed-hcc-cca') return false;
    return pageKeywords.has(feature.key) ||
      (hccDocument && hccFeatureMatchesPage(feature, page, pageKeywords)) ||
      diseaseSpecificFeatureMatchesPage(feature, page);
  }

  function diagnosticFieldRank(field) {
    const label = normalize(field?.label);
    const rank = DIAGNOSTIC_FIELD_PATTERNS.findIndex(pattern => pattern.test(label));
    return rank < 0 ? DIAGNOSTIC_FIELD_PATTERNS.length : rank;
  }

  // 解析器不會產生對應關鍵字的條件（例如 ECOG）永遠無法匹配任何頁面，
  // 不該被當成「找不到對應頁面」的證據，應明示為僅供記錄。
  const ROUTABLE_EXTRA_KEYS = /^(?:mpn-|sm-|bclc-|child-pugh-|stage-)/;
  function isRoutableFeature(key) {
    const vocabulary = window.NCCN_PARSER?.KEYWORD_VOCABULARY;
    if (!vocabulary) return true;
    return vocabulary.includes(String(key).toLowerCase()) || ROUTABLE_EXTRA_KEYS.test(String(key));
  }

  function diagnoseTreatmentMatch(documents, fields) {
    const pages = (documents || []).flatMap(doc =>
      (doc.nccnStructure?.treatmentPages || []).map(page => ({ doc, page }))
    );
    const features = extractClinicalFeatures(fields);
    const allPositive = features.filter(item => isActionablePolarity(item.polarity));
    const recordOnlyFeatures = allPositive.filter(item => !isRoutableFeature(item.key));
    const positiveFeatures = allPositive.filter(item => isRoutableFeature(item.key));
    const suggestedFields = (fields || []).filter(field => !hasValue(field.value))
      .filter(field => diagnosticFieldRank(field) < DIAGNOSTIC_FIELD_PATTERNS.length)
      .sort((a, b) => diagnosticFieldRank(a) - diagnosticFieldRank(b))
      .slice(0, 4);

    if (!pages.length) {
      return { code: 'no_index', positiveFeatures, unmatchedFeatures: [], recordOnlyFeatures, suggestedFields };
    }
    if (!positiveFeatures.length) {
      return { code: 'insufficient_conditions', positiveFeatures, unmatchedFeatures: [], recordOnlyFeatures, suggestedFields };
    }
    const unmatchedFeatures = positiveFeatures.filter(feature =>
      !pages.some(({ doc, page }) => featureMatchesPage(doc, page, feature))
    );
    return {
      code: unmatchedFeatures.length === positiveFeatures.length ? 'no_matching_page' : 'partial_match',
      positiveFeatures,
      unmatchedFeatures,
      recordOnlyFeatures,
      suggestedFields,
    };
  }

  function matchTreatmentPages(documents, fields, limit = 12) {
    const features = extractClinicalFeatures(fields);
    const positive = features.filter(item => isActionablePolarity(item.polarity));
    if (!positive.length) return [];
    const matches = [];
    for (const doc of documents || []) {
      for (const page of doc.nccnStructure?.treatmentPages || []) {
        const matched = positive.filter(feature => featureMatchesPage(doc, page, feature));
        const reasons = matched.map(feature => feature.key);
        if (!reasons.length) continue;
        if (isBreastDocument(doc) && positive.some(feature => feature.key === 'adjuvant') && !isBreastAdjuvantPage(page, features)) continue;
        const selectedMetastatic = positive.some(feature => feature.key === 'metastatic');
        const localizedTitle = /\b(?:PREOPERATIVE|NEOADJUVANT|ADJUVANT)\b/i.test(page.title || '');
        const metastaticTitle = /\b(?:METASTATIC|RECURRENT|UNRESECTABLE)\b/i.test(page.title || '');
        if (selectedMetastatic && localizedTitle && !metastaticTitle) continue;
        const hasFollowupOption = (page.options || []).some(option => typeof option !== 'string' && option.modality === 'followup');
        const modality = matched.some(feature => feature.key === 'followup') && hasFollowupOption
          ? 'followup'
          : pageModality(page);
        // 生物標記若只出現在頁面關鍵字、卻沒有任何選項或其情境提到它，
        // 代表這頁只是「順帶提及」（例如整頁列出各驅動基因處方的附錄），
        // 證據力遠低於真正針對該標記的頁面。
        // 病人明確給了驅動基因時，能對上該標記的頁面應勝過只符合
        // 「轉移＋第一線」這類通用情境的頁面。
        const evidenceScore = matched.reduce((sum, feature) => {
          if (!isMarkerFeature(feature.key)) return sum + 4;
          return sum + (pageHasOptionEvidence(page, feature) ? 9 : 1);
        }, 0);
        const score = evidenceScore + pageRoleScore(page.role) + namedDrugBonus(page);
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

  function breastAdjuvantAssessment(documents, fields) {
    const value = (key) => {
      const field = (fields || []).find(item => item.sourceTemplateKey === key);
      return Array.isArray(field?.value) ? normalize(field.value[0]) : normalize(field?.value);
    };
    const treatmentSetting = value('base-treatment-setting');
    const surgeryPath = value('breast-surgery-path');
    const active = treatmentSetting === '術後/鞏固' || /先手術|術前全身治療後/.test(surgeryPath);
    if (!active) return { active: false, status: 'inactive', missing: [], reviewItems: [], pages: [] };

    const pathologyScope = value('breast-pathology-scope');
    const missing = [];
    const addMissing = (key, label) => {
      const current = value(key);
      if (!current || /待確認|待檢|未評估/.test(current)) missing.push(label);
      return current;
    };
    if (!pathologyScope || /待確認/.test(pathologyScope)) missing.push('乳癌病理範圍');

    const pagePairs = (documents || []).flatMap(doc =>
      (doc.nccnStructure?.treatmentPages || []).map(page => ({ doc, page }))
    );
    if (/DCIS|非浸潤性/i.test(pathologyScope)) {
      return {
        active: true,
        status: 'ready',
        branchLabel: 'DCIS 術後路徑',
        message: '此個案應使用 DCIS 術後流程，不套用浸潤性乳癌的輔助化療決策路徑。',
        missing,
        reviewItems: ['仍需依切緣、手術方式、放射治療與荷爾蒙受體狀態核對原頁。'],
        pages: pagePairs.filter(item => /^DCIS-2$/.test(String(item.page.sectionCode || ''))),
      };
    }

    const path = addMissing('breast-surgery-path', '手術與術前治療情境');
    addMissing('breast-pt', '病理腫瘤分期（pT／ypT）');
    addMissing('breast-pn', '病理淋巴結分期（pN／ypN）');
    addMissing('breast-grade', '組織學分級');
    addMissing('breast-lvi', '淋巴血管侵犯（LVI）');
    const er = addMissing('breast-er', 'ER');
    const pr = addMissing('breast-pr', 'PR');
    const her2 = addMissing('breast-her2', 'HER2 原始結果');
    if (/尚未完成手術/.test(path)) missing.push('完成手術後病理');
    if (/殘存狀態待確認/.test(path)) missing.push('術前治療後殘存病灶狀態');

    const subtype = value('breast-subtype');
    const hrPositive = subtype === 'HR+/HER2-' || /陽性|低度陽性/.test(er) || /陽性/.test(pr);
    const hrNegative = subtype === '三陰性' || (/陰性/.test(er) && /陰性/.test(pr));
    const her2Positive = subtype === 'HER2+' || /IHC\s*3\+|IHC\s*2\+.*ISH\s*陽性/i.test(her2);
    const her2Negative = subtype === 'HR+/HER2-' || subtype === '三陰性' || /IHC\s*[01]\+?|IHC\s*2\+.*ISH\s*陰性/i.test(her2);
    const codes = ['BINV-4'];
    let branchLabel = '';
    if (hrPositive && her2Positive) { branchLabel = 'HR-positive／HER2-positive 術後路徑'; codes.push('BINV-5'); }
    else if (hrPositive && her2Negative) { branchLabel = 'HR-positive／HER2-negative 術後路徑'; codes.push('BINV-6', 'BINV-7', 'BINV-8'); }
    else if (hrNegative && her2Positive) { branchLabel = 'HR-negative／HER2-positive 術後路徑'; codes.push('BINV-9'); }
    else if (hrNegative && her2Negative) { branchLabel = '三陰性乳癌術後路徑'; codes.push('BINV-10'); }
    else missing.push('可判讀的 ER／PR／HER2 臨床亞型');

    if (/術前全身治療後/.test(path)) {
      codes.splice(0, codes.length, 'BINV-14', 'BINV-15', 'BINV-16');
      branchLabel = branchLabel ? branchLabel + '（術前治療後）' : '術前治療後的術後路徑';
    }
    const reviewItems = [];
    if (hrPositive && her2Negative) {
      const menopause = value('breast-menopause');
      const assay = value('breast-genomic-assay');
      const recurrenceScore = value('breast-oncotype-rs');
      if (!menopause || /待確認|不適用/.test(menopause)) reviewItems.push('補充停經狀態；它會影響 HR+/HER2- 的術後系統治療判讀。');
      if (!assay || assay === '未評估') reviewItems.push('依 pT／pN 與臨床風險確認是否適用基因表現檢測。');
      if (assay === 'Oncotype DX' && recurrenceScore === '') reviewItems.push('已選 Oncotype DX，但尚未輸入 Recurrence Score。');
      if (assay === '已送檢待結果') reviewItems.push('基因表現結果尚未完成，暫時不能完成化療效益判讀。');
    }
    const pt = value('breast-pt');
    const pn = value('breast-pn');
    const grade = value('breast-grade');
    let decision = null;
    if (/先手術/.test(path) && hrNegative && her2Negative && /^pT/i.test(pt) && /^pN/i.test(pn)) {
      const nodeMicrometastatic = /^pN1mi/i.test(pn);
      const nodeMacrometastatic = /^pN[1-3](?!mi)/i.test(pn);
      const stageBasis = `${pt}、${pn}`;
      if (nodeMacrometastatic || /^pT(?:1c|[23])\b/i.test(pt)) {
        decision = {
          level: 'recommended',
          headline: '此分支支持術後輔助化療（category 1）',
          basis: stageBasis,
          items: [
            '依 BINV-10 進入術後輔助化療路徑。',
            '若有 germline BRCA1/2 pathogenic variant，需再依原頁高風險資格評估 adjuvant olaparib。',
            '放射治療與全身治療的先後順序依 BINV-I 核對。',
          ],
          caveats: [],
        };
      } else if (/^pT1a\b/i.test(pt) && /^pN0\b/i.test(pn)) {
        const highGrade = /^Grade 3$/i.test(grade);
        decision = {
          level: highGrade ? 'consider' : 'omit',
          headline: highGrade
            ? '主分支為不給予術後全身治療；但 Grade 3 觸發高風險例外，應討論化療（category 2B）'
            : 'NCCN 主分支為不給予術後全身治療',
          basis: stageBasis,
          items: highGrade
            ? ['BINV-10 的 footnote ss 允許特定高風險 pT1aN0 個案考慮輔助化療。']
            : ['目前 pT1aN0 分支未直接支持常規術後輔助化療。'],
          caveats: ['仍需核對年齡、病理高風險特徵及 BINV-10 footnote ss；App 尚未收錄所有可能影響個案討論的風險因素。'],
        };
      } else if ((/^pT1a\b/i.test(pt) && nodeMicrometastatic) || /^pT1b\b/i.test(pt)) {
        decision = {
          level: 'consider',
          headline: '此分支為考慮術後輔助化療',
          basis: stageBasis,
          items: [
            '化療不是 App 自動判定的絕對結論；應依效益、毒性與個案偏好共同決策。',
            '同頁列有 germline BRCA1/2 pathogenic variant 的 olaparib 路徑，仍須核對原頁資格門檻。',
          ],
          caveats: [],
        };
      } else {
        decision = {
          level: 'review',
          headline: '此 pT／pN 組合未落在 App 已結構化的 BINV-10 三個主要分支',
          basis: stageBasis,
          items: ['請直接開啟 BINV-10 核對流程箭頭；App 不會用鄰近分支推測治療。'],
          caveats: [],
        };
      }
    }    if (decision && /先手術/.test(path) && hrNegative && her2Negative) {
      const regimenPage = pagePairs.find(({ page }) =>
        String(page.sectionCode || '').toUpperCase() === 'BINV-M' &&
        (page.options || []).some(option => /Pembrolizumab/i.test(optionText(option))) &&
        (page.options || []).some(option => /Preferred.+stage I/i.test(optionText(option)))
      ) || pagePairs.find(({ page }) =>
        String(page.sectionCode || '').toUpperCase() === 'BINV-M' &&
        (page.options || []).some(option => /^TC \(Docetaxel\/Cyclophosphamide\)/i.test(typeof option === 'string' ? option : option.label || ''))
      );
      if (regimenPage) {
        const regimenPatterns = [
          /^Dose[- ]Dense AC \(Doxorubicin\/Cyclophosphamide\) followed by Paclitaxel every 2 weeks/i,
          /^Dose[- ]dense AC followed by Paclitaxel every 2 weeks/i,
          /^Dose[- ]Dense AC followed by weekly Paclitaxel/i,
          /^TC \(Docetaxel\/Cyclophosphamide\)/i,
        ];
        const seen = new Set();
        decision.regimens = (regimenPage.page.options || []).filter(option => {
          const label = typeof option === 'string' ? option : String(option.label || '');
          if (!regimenPatterns.some(pattern => pattern.test(label))) return false;
          const key = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 3).map(option => ({ ...regimenPage, option }));
        const stageI = /^pT1(?:mi|[abc])\b/i.test(pt) && /^pN0\b/i.test(pn);
        decision.regimenTitle = stageI
          ? '若決定化療：BINV-M Stage I 優先處方候選'
          : '若決定化療：BINV-M 可考慮處方候選';
        decision.regimenNote = stageI
          ? '以下是處方入口，不代表三者等效或已替個案選定；仍需依心臟功能、周邊神經病變風險、共病與偏好選擇。'
          : '較高病期仍須核對是否原本應採術前全身治療及 pembrolizumab 路徑，App 不會把術前療程誤列為單純術後處方。';
      }
    }    const codeSet = new Set(codes);
    const supportingPages = decision
      ? pagePairs.filter(({ page }) => String(page.sectionCode || '').toUpperCase() === 'BINV-M' &&
        (page.options || []).some(option => /Pembrolizumab|Carboplatin\/Paclitaxel|Dose[- ]Dense AC|TC \(Docetaxel/i.test(optionText(option))))
      : [];
    return {
      active: true,
      status: missing.length ? 'missing' : 'ready',
      branchLabel: branchLabel || '乳癌術後輔助治療路徑',
      message: missing.length
        ? '目前資料不足，尚不能判斷是否需要術後輔助性化療。'
        : '已定位術後決策路徑；請依原頁門檻、腳註與個案共病完成化療效益判讀。',
      missing: [...new Set(missing)],
      reviewItems,
      decision,
      pages: pagePairs.filter(item => codeSet.has(String(item.page.sectionCode || '').toUpperCase())),
      supportingPages: supportingPages.slice(0, 2),
    };
  }


  const postoperativeFieldValues = (fields, key) => {
    const field = (fields || []).find(item => item.sourceTemplateKey === key);
    const values = Array.isArray(field?.value) ? field.value : [field?.value];
    return values.map(normalize).filter(Boolean);
  };
  const postoperativeFieldValue = (fields, key) => postoperativeFieldValues(fields, key)[0] || '';
  const postoperativeUnknown = (value) => !value || /待確認|待檢|未評估|尚未完成|不適用/.test(value);
  const postoperativePages = (documents) => (documents || []).flatMap(doc =>
    (doc.nccnStructure?.treatmentPages || []).map(page => ({ doc, page }))
  );
  const pagePair = (pairs, code, titlePattern) => pairs.find(({ page }) =>
    String(page.sectionCode || '').toUpperCase() === code &&
    (!titlePattern || titlePattern.test(String(page.title || '')))
  );
  const regimenEntry = (pair, label, pattern = null, overrides = {}) => {
    if (!pair) return null;
    const existing = pattern
      ? (pair.page.options || []).find(option => pattern.test(typeof option === 'string' ? option : String(option.label || '')))
      : null;
    const option = typeof existing === 'string'
      ? { label: existing, modality: 'systemic', recommendation: 'other' }
      : existing ? { ...existing } : { label, modality: 'systemic', recommendation: 'other' };
    return { ...pair, option: { ...option, label, modality: 'systemic', ...overrides } };
  };
  const uniqueRegimens = (items) => {
    const seen = new Set();
    return items.filter(Boolean).filter(item => {
      const key = normalize(item.option?.label).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  function nsclcAdjuvantAssessment(documents, fields) {
    const value = key => postoperativeFieldValue(fields, key);
    const values = key => postoperativeFieldValues(fields, key);
    const treatmentSetting = value('base-treatment-setting');
    const path = value('nsclc-surgery-path');
    const active = treatmentSetting === '術後/鞏固' || /手術/.test(path);
    if (!active) return { active: false, status: 'inactive', missing: [], reviewItems: [], pages: [] };

    const missing = [];
    const required = (key, label) => {
      const current = value(key);
      if (postoperativeUnknown(current)) missing.push(label);
      return current;
    };
    const stage = required('nsclc-path-stage', 'NSCLC 術後病理分期');
    const pt = required('nsclc-pt', 'NSCLC 病理 T 分期');
    const pn = required('nsclc-pn', 'NSCLC 病理 N 分期');
    const margin = required('nsclc-margin', 'NSCLC 手術切緣');
    if (postoperativeUnknown(path)) missing.push('NSCLC 手術／術前治療情境');
    const highRiskValues = values('nsclc-high-risk');
    const highRiskKnown = highRiskValues.length && !highRiskValues.some(item => /待確認/.test(item));
    const hasHighRisk = highRiskValues.some(item => !/無上述特徵|待確認/.test(item));
    if (/^(?:IB|IIA)$/.test(stage) && !highRiskKnown) missing.push('NSCLC 術後高風險特徵');

    const pairs = postoperativePages(documents);
    const chemoPage = pagePair(pairs, 'NSCL-E', /^Adjuvant Chemotherapy$/i);
    const otherPage = pagePair(pairs, 'NSCL-E', /^Other Adjuvant Systemic Therapy$/i);
    const histology = value('nsclc-histology');
    const cisplatin = value('nsclc-cisplatin');
    const reviewItems = [];
    let decision = null;
    const basis = [stage, pt, pn, margin].filter(Boolean).join('、');
    const neoadjuvantChemo = /術前(?:免疫治療[+＋])?化療後手術/.test(path);
    const positiveMargin = /^R[12]/.test(margin);

    if (!missing.length) {
      if (neoadjuvantChemo) {
        decision = {
          level: 'omit',
          headline: '不應再另加一套術後輔助化療',
          basis,
          items: [
            'NSCL-E 明載：術前治療已含化療時，不再重複給予術後化療。',
            /免疫治療/.test(path)
              ? '若採 perioperative 免疫治療方案，應依原方案核對術後免疫治療的延續週期。'
              : '仍需確認術前實際週期數、病理反應及是否另有標靶治療資格。',
          ],
          caveats: [],
        };
      } else if (positiveMargin) {
        decision = {
          level: 'review',
          headline: '切緣陽性，需先處理局部殘存風險，不能只套用一般 R0 輔助化療分支',
          basis,
          items: ['依 NSCL-4 討論再次切除（preferred）、放射治療及全身治療的組合與順序。'],
          caveats: ['R1 與 R2 的處置不同，應由胸腔外科、放射腫瘤科與腫瘤內科共同判讀原流程。'],
        };
      } else if (/^IA/.test(stage)) {
        decision = {
          level: 'omit',
          headline: '此分支不支持常規術後輔助化療',
          basis,
          items: ['R0 切除的 Stage IA 以術後監測路徑為主。'],
          caveats: [],
        };
      } else if (/^(?:IB|IIA)$/.test(stage)) {
        decision = {
          level: hasHighRisk ? 'recommended' : 'omit',
          headline: hasHighRisk
            ? '此分支建議術後輔助化療（具高風險特徵）'
            : '未辨識到高風險特徵，主分支不支持常規術後輔助化療',
          basis: basis + (highRiskValues.length ? '；高風險：' + highRiskValues.join('、') : ''),
          items: hasHighRisk
            ? ['NSCL-E 對 Stage IB／IIA 且具高風險特徵者建議 adjuvant chemotherapy。']
            : ['腫瘤大小增加仍是重要變項；請核對 NSCL-4A 與完整病理。'],
          caveats: [],
        };
      } else if (/^(?:IIB|IIIA|IIIB)/.test(stage)) {
        decision = {
          level: 'recommended',
          headline: '此分支建議術後含鉑雙藥輔助化療',
          basis,
          items: ['NSCL-E 對已切除 Stage IIB、IIIA 及所列 IIIB 分支建議 adjuvant chemotherapy。'],
          caveats: [],
        };
      } else {
        decision = {
          level: 'review',
          headline: '目前分期未落在 App 已結構化的 NSCL-E 術後分支',
          basis,
          items: ['請直接開啟 NSCL-4 與 NSCL-E 核對流程。'],
          caveats: [],
        };
      }
    }

    if (decision && !neoadjuvantChemo && !positiveMargin) {
      const chemoEligible = ['recommended', 'consider'].includes(decision.level);
      if (chemoEligible && postoperativeUnknown(histology)) reviewItems.push('補充 NSCLC 組織型，才能排除不適合的 pemetrexed／gemcitabine 組合。');
      if (chemoEligible && postoperativeUnknown(cisplatin)) reviewItems.push('補充 cisplatin 適用性，才能在 cisplatin 與 carboplatin 候選間縮小範圍。');
      const nonsquamous = /腺癌|非鱗/i.test(histology);
      const squamous = /鱗狀/.test(histology);
      const useCarboplatin = /^不適合 cisplatin/.test(cisplatin);
      const useCisplatin = /^適合 cisplatin/.test(cisplatin) && !useCarboplatin;
      const chemo = [];
      if (chemoEligible && (useCisplatin || !useCarboplatin)) {
        if (nonsquamous) chemo.push(regimenEntry(chemoPage, 'Cisplatin/Pemetrexed（非鱗狀）', new RegExp('^Cisplatin/Pemetrexed', 'i')));
        if (squamous) chemo.push(regimenEntry(chemoPage, 'Cisplatin/Gemcitabine（鱗狀）', new RegExp('^Cisplatin/Gemcitabine', 'i')));
        chemo.push(regimenEntry(chemoPage, 'Cisplatin/Vinorelbine', new RegExp('^Cisplatin/Vinorelbine', 'i')));
        if (!nonsquamous && !squamous) chemo.push(regimenEntry(chemoPage, 'Cisplatin/Docetaxel', new RegExp('^Cisplatin/Docetaxel', 'i')));
      }
      if (chemoEligible && (useCarboplatin || !useCisplatin)) {
        if (nonsquamous) chemo.push(regimenEntry(chemoPage, 'Carboplatin/Pemetrexed（非鱗狀）', new RegExp('^Carboplatin/Pemetrexed', 'i')));
        if (squamous) chemo.push(regimenEntry(chemoPage, 'Carboplatin/Gemcitabine（鱗狀）', new RegExp('^Carboplatin/Gemcitabine', 'i')));
        chemo.push(regimenEntry(chemoPage, 'Carboplatin/Paclitaxel', new RegExp('^Carboplatin/Paclitaxel', 'i')));
      }

      const drivers = values('nsclc-drivers');
      const driverText = drivers.join(' ');
      const nodePositive = /(?:p|yp)N[1-3]/i.test(pn);
      const size = Number(value('nsclc-tumor-size-cm'));
      const largeOrNodePositive = (Number.isFinite(size) && size >= 4) || nodePositive;
      const targeted = [];
      const eligibleTargetStage = /^(?:IB|IIA|IIB|IIIA|IIIB)/.test(stage);
      if (eligibleTargetStage && /EGFR exon 19 deletion|EGFR L858R/i.test(driverText)) {
        targeted.push(regimenEntry(otherPage, 'Osimertinib（EGFR exon 19 deletion／L858R）', /^Osimertinib/i));
      } else if (eligibleTargetStage && /EGFR sensitizing/.test(driverText)) {
        targeted.push(regimenEntry(otherPage, 'Osimertinib（須先確認為 EGFR exon 19 deletion 或 L858R）', /^Osimertinib/i, { needsReview: true }));
        reviewItems.push('目前只記錄 EGFR sensitizing，需補回 exon 19 deletion 或 L858R 原始型別。');
      }
      if (eligibleTargetStage && /ALK fusion/i.test(driverText) && largeOrNodePositive) {
        targeted.push(regimenEntry(otherPage, 'Alectinib（ALK fusion；腫瘤 ≥4 cm 或淋巴結陽性）', /^Alectinib/i));
      }
      if (/RET fusion/i.test(driverText) && /^(?:IB|IIA|IIB|IIIA)$/.test(stage)) {
        targeted.push(regimenEntry(otherPage, 'Selpercatinib（RET fusion）', /^Selpercatinib/i));
      }
      const noEgfrAlk = !/EGFR|ALK/.test(driverText) && drivers.length && !drivers.some(item => /待檢/.test(item));
      const pdl1 = Number(value('nsclc-pdl1-tps'));
      if (chemoEligible && largeOrNodePositive && noEgfrAlk && Number.isFinite(pdl1) && pdl1 >= 1) {
        targeted.push(regimenEntry(otherPage, 'Atezolizumab（PD-L1 ≥1%，且無 EGFR／ALK）', /^Atezolizumab/i));
      }
      if (chemoEligible && largeOrNodePositive && noEgfrAlk) {
        targeted.push(regimenEntry(otherPage, 'Pembrolizumab（無 EGFR／ALK；PD-L1 <1% 效益不明確）', /^Pembrolizumab/i));
      }
      decision.regimens = uniqueRegimens([...chemo, ...targeted]);
      if (targeted.length && !chemoEligible) {
        decision.level = targeted.some(item => item.option?.needsReview) ? 'consider' : 'recommended';
        decision.headline = '不建議常規輔助化療，但需評估術後標靶治療資格';
        decision.items.push('NSCL-E 的術後標靶治療資格與化療適應性需分開判讀。');
      }
      decision.regimenTitle = chemo.length && targeted.length
        ? '術後含鉑化療與後續標靶／免疫治療資格候選'
        : targeted.length ? 'NSCL-E 術後標靶治療資格候選' : 'NSCL-E 術後含鉑雙藥候選';
      decision.regimenNote = '各候選不是彼此等效；需依組織型、腎功能、聽力、周邊神經病變、驅動基因、PD-L1 與既往術前治療逐一縮小。';
    }

    return {
      active: true,
      title: '非小細胞肺癌術後輔助治療評估',
      decisionLabel: '依本次手術、切緣與病理分期命中的個案分支',
      status: missing.length ? 'missing' : 'ready',
      branchLabel: neoadjuvantChemo ? '術前治療後手術路徑' : '先手術後的輔助治療路徑',
      message: missing.length ? '目前資料不足，尚不能完成 NSCLC 術後治療判讀。' : '已定位 NSCLC 術後決策分支與處方入口。',
      missing: [...new Set(missing)],
      reviewItems: [...new Set(reviewItems)],
      decision,
      pages: pairs.filter(({ page }) => {
        const code = String(page.sectionCode || '').toUpperCase();
        return /^NSCL-4A?$/.test(code) ||
          (code === 'NSCL-E' && /^(?:Adjuvant Chemotherapy|Other Adjuvant Systemic Therapy)$/i.test(String(page.title || '')));
      }),
      supportingPages: [],
    };
  }

  function colonAdjuvantAssessment(documents, fields) {
    const value = key => postoperativeFieldValue(fields, key);
    const values = key => postoperativeFieldValues(fields, key);
    const treatmentSetting = value('base-treatment-setting');
    const path = value('colon-surgery-path');
    const active = treatmentSetting === '術後/鞏固' || /手術/.test(path);
    if (!active) return { active: false, status: 'inactive', missing: [], reviewItems: [], pages: [] };

    const missing = [];
    const required = (key, label) => {
      const current = value(key);
      if (postoperativeUnknown(current)) missing.push(label);
      return current;
    };
    if (postoperativeUnknown(path)) missing.push('結腸癌手術／術前治療情境');
    const stage = required('colon-path-stage', '結腸癌術後病理分期');
    const pt = required('colon-pt', '結腸癌病理 T 分期');
    const pn = required('colon-pn', '結腸癌病理 N 分期');
    const margin = required('colon-margin', '結腸癌手術切緣');
    const mmr = required('crc-mmr-msi', 'MMR／MSI');
    const highRiskValues = values('colon-high-risk');
    const stageII = /^II[ABC]$/.test(stage);
    if (stageII && (!highRiskValues.length || highRiskValues.some(item => /待確認/.test(item)))) {
      missing.push('結腸癌 Stage II 高風險特徵');
    }

    const pairs = postoperativePages(documents);
    const dmmr = /dMMR|MSI-H/i.test(mmr);
    const decisionPage = pagePair(pairs, dmmr ? 'COL-13' : 'COL-4');
    const reviewItems = [];
    const basis = [stage, pt, pn, mmr, margin].filter(Boolean).join('、');
    const nodeCount = Number(value('colon-nodes-examined'));
    if (stageII && !Number.isFinite(nodeCount)) reviewItems.push('補充檢查淋巴結數；少於 12 顆屬 Stage II 高風險特徵。');
    const hasHighRisk = /pT4/i.test(pt) ||
      highRiskValues.some(item => !/無上述特徵|待確認/.test(item)) ||
      (Number.isFinite(nodeCount) && nodeCount < 12) ||
      /close|陽性/i.test(margin);
    const lowRiskIII = /pT[1-3]/i.test(pt) && /pN1/i.test(pn);
    const highRiskIII = /pT4/i.test(pt) || /pN2/i.test(pn);
    let decision = null;

    if (!missing.length) {
      if (/^(?:0|I)$/.test(stage)) {
        decision = {
          level: 'omit',
          headline: '此分支以觀察／術後監測為主，不給予常規輔助化療',
          basis,
          items: ['COL-4／COL-13 的 Stage 0–I 分支為 observation。'],
          caveats: [],
        };
      } else if (dmmr && /^(?:IIA|IIB)$/.test(stage)) {
        decision = {
          level: 'omit',
          headline: 'dMMR／MSI-H Stage IIA–IIB 以觀察為主',
          basis,
          items: ['COL-13 對 Tis–T4a N0（Stage 0–IIB）列為 observation。'],
          caveats: ['Stage II MSI-H 癌症不從 fluorouracil 單藥輔助治療獲益；若病理實為 T4b／Stage IIC，應改走下一分支。'],
        };
      } else if (dmmr && stage === 'IIC') {
        decision = {
          level: 'consider',
          headline: '可觀察，或依低風險 Stage III 方案考慮輔助全身治療',
          basis,
          items: ['COL-13 對 T4b N0（Stage IIC）列出 observation 或低風險 Stage III 的 adjuvant systemic therapy。'],
          caveats: [],
        };
      } else if (stageII) {
        decision = {
          level: hasHighRisk ? 'consider' : 'omit',
          headline: hasHighRisk
            ? 'Stage II 具高風險特徵：可考慮輔助化療，也保留觀察選項'
            : 'Stage II 未辨識高風險特徵：observation 為 preferred',
          basis: basis + (highRiskValues.length ? '；高風險：' + highRiskValues.join('、') : ''),
          items: hasHighRisk
            ? ['COL-4 列出 capecitabine／5-FU-LV、FOLFOX、CAPEOX 或 observation；選擇需依風險與毒性討論。']
            : ['COL-4 對 T3N0、無高風險特徵列 observation（preferred），亦可考慮 fluoropyrimidine 單藥。'],
          caveats: ['Stage II 使用 oxaliplatin 的存活效益未被證實，App 不會自動把雙藥列為必選。'],
        };
      } else if (/^III/.test(stage)) {
        decision = {
          level: 'recommended',
          headline: highRiskIII
            ? '高風險 Stage III：建議術後輔助化療'
            : lowRiskIII ? '低風險 Stage III：建議術後輔助化療' : 'Stage III：建議術後輔助化療，需由 pT／pN 確認療程長度',
          basis,
          items: [highRiskIII
            ? 'T4 N1–2 或任何 T、N2：CAPEOX 3–6 個月或 FOLFOX 6 個月。'
            : 'T1–3 N1：CAPEOX 3 個月或 FOLFOX 3–6 個月。'],
          caveats: [],
        };
      } else {
        decision = {
          level: 'review',
          headline: '目前病理分期未落在 App 已結構化的 COL-4／COL-13 分支',
          basis,
          items: ['請直接開啟原頁核對。'],
          caveats: [],
        };
      }
    }

    if (decision && ['recommended', 'consider'].includes(decision.level)) {
      const labels = [];
      if (dmmr && (stage === 'IIC' || /^III/.test(stage))) {
        labels.push('FOLFOX + Atezolizumab', 'CAPEOX + Atezolizumab');
      }
      if (/^III/.test(stage) || (stageII && hasHighRisk) || (dmmr && stage === 'IIC')) {
        labels.push(highRiskIII ? 'CAPEOX（3–6 個月）' : 'CAPEOX（3 個月）');
        labels.push(highRiskIII ? 'FOLFOX（6 個月）' : 'FOLFOX（3–6 個月）');
      }
      if (!dmmr && stageII) labels.push('Capecitabine（6 個月）', 'Fluorouracil/Leucovorin（6 個月）');
      decision.regimens = uniqueRegimens(labels.map(label => regimenEntry(
        decisionPage,
        label,
        new RegExp(label.split('（')[0].replace(/[+]/g, '\\+'), 'i')
      )));
      decision.regimenTitle = '依 COL-' + (dmmr ? '13' : '4') + ' 分支對接的術後療程候選';
      decision.regimenNote = '療程長度依 T／N 風險、術前已接受週期、神經毒性、年齡與共病調整；全程 perioperative treatment 通常不超過原頁規範。';
    }

    const pi3k = values('crc-extended-markers').some(item => /PIK3CA|PIK3R1|PTEN/i.test(item));
    if (pi3k && /^(?:II|III)/.test(stage)) {
      reviewItems.push('已記錄 PI3K pathway alteration：COL-4／COL-13 建議術後恢復後評估 aspirin 100–162 mg/day、共 3 年（無禁忌時）；須核對出血風險與原頁。');
    }
    return {
      active: true,
      title: '結腸癌術後輔助治療評估',
      decisionLabel: '依本次 pT／pN、MMR／MSI 與高風險特徵命中的個案分支',
      status: missing.length ? 'missing' : 'ready',
      branchLabel: dmmr ? 'dMMR／MSI-H（COL-13）術後路徑' : 'pMMR／MSS（COL-4）術後路徑',
      message: missing.length ? '目前資料不足，尚不能完成結腸癌術後治療判讀。' : '已定位結腸癌術後分支、風險層級與療程長度入口。',
      missing: [...new Set(missing)],
      reviewItems: [...new Set(reviewItems)],
      decision,
      pages: pairs.filter(({ page }) => [dmmr ? 'COL-13' : 'COL-4', 'COL-8'].includes(String(page.sectionCode || '').toUpperCase())),
      supportingPages: [],
    };
  }

  function rectalAdjuvantAssessment(documents, fields) {
    const value = key => postoperativeFieldValue(fields, key);
    const values = key => postoperativeFieldValues(fields, key);
    const treatmentSetting = value('base-treatment-setting');
    const path = value('rectal-surgery-path');
    const active = treatmentSetting === '術後/鞏固' || /手術|切除|完全臨床反應/.test(path);
    if (!active) return { active: false, status: 'inactive', missing: [], reviewItems: [], pages: [] };

    const pairs = postoperativePages(documents);
    const missing = [];
    if (postoperativeUnknown(path)) missing.push('直腸癌手術／術前治療情境');
    const nonoperative = /完全臨床反應／未手術/.test(path);
    const notOperated = /尚未完成手術/.test(path);
    const mmr = value('crc-mmr-msi');
    if (postoperativeUnknown(mmr)) missing.push('MMR／MSI');
    const required = (key, label) => {
      const current = value(key);
      if (!nonoperative && !notOperated && postoperativeUnknown(current)) missing.push(label);
      return current;
    };
    const stage = required('rectal-path-stage', '直腸癌術後病理分期');
    const pt = required('rectal-pt', '直腸癌病理 T 分期');
    const pn = required('rectal-pn', '直腸癌病理 N 分期');
    const margin = required('rectal-margin', '直腸癌切緣');
    const crm = required('rectal-crm', '直腸癌環周切緣（CRM）');
    const dmmr = /dMMR|MSI-H/i.test(mmr);
    const highRiskValues = values('rectal-high-risk');
    const highRisk = highRiskValues.some(item => !/無上述特徵|待確認/.test(item));
    const nodePositive = /(?:p|yp)N[12]/i.test(pn);
    const localRtRisk = /陽性|受威脅|close/i.test(margin + ' ' + crm) ||
      /incomplete/i.test(value('rectal-mesorectal-grade'));
    const positiveLocalRisk = localRtRisk || highRisk;
    const basis = [path, stage, pt, pn, mmr, margin, crm].filter(Boolean).join('、');
    const reviewItems = [];
    let decision = null;

    if (!missing.length) {
      if (nonoperative) {
        decision = {
          level: 'review',
          headline: '這是非手術管理／免疫治療反應路徑，不套用一般術後輔助化療',
          basis,
          items: ['依 dMMR／MSI-H 專屬流程持續反應評估與密集 surveillance。'],
          caveats: ['應由有經驗的多專科團隊執行 watch-and-wait，App 不以術後 pT／pN 推測。'],
        };
      } else if (/完成 TNT 後手術/.test(path)) {
        decision = {
          level: 'omit',
          headline: '已完成 TNT：不應自動再加一套術後化療',
          basis,
          items: ['先核對 TNT 已完成的化療週期與放療內容；手術後通常轉入 surveillance。'],
          caveats: ['若 TNT 未完成、術前治療中斷或有特殊高風險病理，需個別討論剩餘療程，不能只看 ypStage。'],
        };
      } else if (dmmr) {
        decision = {
          level: 'review',
          headline: 'dMMR／MSI-H 應回到專屬免疫治療流程，不能直接套用 pMMR／MSS 的 REC-5',
          basis,
          items: ['請核對 REC-14 起的 dMMR／MSI-H 路徑及既往是否已接受 checkpoint inhibitor。'],
          caveats: [],
        };
      } else if (/經肛門局部切除/.test(path)) {
        const adverseLocal = highRisk || /pT2/i.test(pt);
        decision = {
          level: adverseLocal ? 'recommended' : 'omit',
          headline: adverseLocal
            ? '局部切除後有高風險／pT2：優先評估追加經腹切除；不適合時討論放化療'
            : 'pT1 局部切除且無高風險特徵：以 observation 為主',
          basis,
          items: adverseLocal
            ? ['REC-4 的 preferred 分支是 transabdominal resection；另列 long-course chemo/RT 或 short-course RT 搭配 FOLFOX／CAPEOX 的選項。']
            : ['REC-4 對 pT1、無高風險特徵列為 observe／surveillance。'],
          caveats: [],
        };
      } else if (/先做經腹切除/.test(path)) {
        if (/pT[12]/i.test(pt) && /pN0/i.test(pn) && !positiveLocalRisk) {
          decision = {
            level: 'omit',
            headline: 'pT1–2 N0 且切緣無高風險：以 observation 為主',
            basis,
            items: ['REC-5 對 pT1–2 N0 M0 列為 observe。'],
            caveats: [],
          };
        } else if (/pT3/i.test(pt) && /pN0/i.test(pn)) {
          const selectObservation = value('rectal-location') === '上段直腸' && !positiveLocalRisk;
          decision = {
            level: selectObservation ? 'consider' : 'recommended',
            headline: selectObservation
              ? 'pT3 N0 上段直腸且目前未見高風險：可討論 observation，但尚需原頁條件'
              : 'pT3 N0：應討論 FOLFOX／CAPEOX 與選擇性 long-course chemo/RT',
            basis,
            items: selectObservation
              ? ['REC-5 僅允許非常選擇性的上段直腸 pT3N0 觀察：需 well/moderately differentiated、進入 mesorectum <2 mm、且無淋巴／靜脈侵犯。']
              : ['REC-5 列出 chemo/RT 與 FOLFOX／CAPEOX 的不同先後順序，也列 FOLFOX／CAPEOX alone。'],
            caveats: selectObservation ? ['App 尚無法由目前欄位確認 mesorectal invasion <2 mm，必須開原頁與病理報告核對。'] : [],
          };
        } else if (/pT4/i.test(pt) || nodePositive) {
          decision = {
            level: 'recommended',
            headline: 'pT4 或 N1–2：建議術後全身治療，並評估 long-course chemo/RT',
            basis,
            items: [
              'REC-5 列出 FOLFOX／CAPEOX 與 long-course chemo/RT 的不同順序。',
              /pT[1-3]/i.test(pt) && /pN1/i.test(pn) ? 'pT1–3 N1 可考慮 FOLFOX／CAPEOX alone。' : '較高局部／淋巴結風險不應只由 App 省略放療評估。',
            ],
            caveats: [],
          };
        }
      } else if (/術前化放療後手術/.test(path)) {
        decision = {
          level: 'consider',
          headline: '術前化放療後手術：依已完成療程補足 perioperative systemic therapy',
          basis,
          items: ['核對術前是否已完成 FOLFOX／CAPEOX；REC-D 的全程治療上限與術後病理共同決定是否還需補足。'],
          caveats: ['不能只因 ypStage 降期就假設已完成全部 TNT。'],
        };
      }
    }
    if (!decision && !missing.length) {
      decision = {
        level: 'review',
        headline: '目前資料未落在 App 已結構化的 REC-4／REC-5 術後分支',
        basis,
        items: ['請直接開啟原頁核對流程箭頭。'],
        caveats: [],
      };
    }
    if (localRtRisk && decision && !nonoperative) {
      reviewItems.push('切緣／CRM／直腸系膜品質提示局部復發風險：術後 RT 僅應高度選擇性使用，需多專科核對 REC-5 footnote w。');
    }

    if (decision && ['recommended', 'consider'].includes(decision.level) && !dmmr) {
      const rec5 = pagePair(pairs, 'REC-5');
      const regimens = [];
      if (!/經肛門局部切除/.test(path) || /pT2/i.test(pt) || highRisk) {
        regimens.push(regimenEntry(rec5, 'FOLFOX', /FOLFOX/i));
        regimens.push(regimenEntry(rec5, 'CAPEOX', /CAPEOX/i));
      }
      if (/先做經腹切除|經肛門局部切除/.test(path) && (positiveLocalRisk || /pT[34]/i.test(pt) || nodePositive)) {
        regimens.push(regimenEntry(rec5, 'Long-course chemo/RT：Capecitabine', /capecitabine/i));
        regimens.push(regimenEntry(rec5, 'Long-course chemo/RT：Infusional fluorouracil', /infusional fluorouracil/i));
      }
      decision.regimens = uniqueRegimens(regimens);
      decision.regimenTitle = 'REC-4／REC-5 對接的全身治療與放化療候選';
      decision.regimenNote = '此處列的是方案組件與入口；先後順序、總療程長度及是否可省略放療，需依術前已完成治療與局部風險決定。';
    }

    const rectalPageCodes = dmmr || nonoperative
      ? ['REC-14', 'REC-10A']
      : /完成 TNT/.test(path) ? ['REC-6', 'REC-10A']
        : /經肛門局部切除/.test(path) ? ['REC-4', 'REC-5', 'REC-10A']
          : ['REC-5', 'REC-10A'];
    return {
      active: true,
      title: '直腸癌術後輔助治療評估',
      decisionLabel: '依本次術前治療、手術方式、pT／pN 與切緣命中的個案分支',
      status: missing.length ? 'missing' : 'ready',
      branchLabel: dmmr ? 'dMMR／MSI-H 專屬路徑' : /完成 TNT/.test(path) ? 'TNT 完成後手術路徑' : 'REC-4／REC-5 術後路徑',
      message: missing.length ? '目前資料不足，尚不能完成直腸癌術後治療判讀。' : '已定位直腸癌術後分支與全程治療入口。',
      missing: [...new Set(missing)],
      reviewItems: [...new Set(reviewItems)],
      decision,
      pages: pairs.filter(({ page }) => rectalPageCodes.includes(String(page.sectionCode || '').toUpperCase())),
      supportingPages: [],
    };
  }

  function adjuvantAssessment(cancerId, documents, fields) {
    if (cancerId === 'breast_cancer') {
      const result = breastAdjuvantAssessment(documents, fields);
      return {
        title: '乳癌術後輔助治療評估',
        decisionLabel: '依本次 pT／pN 命中的個案分支',
        ...result,
      };
    }
    if (cancerId === 'nsclc') return nsclcAdjuvantAssessment(documents, fields);
    if (cancerId === 'colon_cancer') return colonAdjuvantAssessment(documents, fields);
    if (cancerId === 'rectal_cancer') return rectalAdjuvantAssessment(documents, fields);
    return { active: false, status: 'inactive', missing: [], reviewItems: [], pages: [] };
  }

  window.CLINICAL_MATCHER = Object.freeze({
    extractClinicalFeatures,
    matchTreatmentPages,
    diagnoseTreatmentMatch,
    optionAssessment,
    breastAdjuvantAssessment,
    nsclcAdjuvantAssessment,
    colonAdjuvantAssessment,
    rectalAdjuvantAssessment,
    adjuvantAssessment,
    featureLabel: (key) => FEATURE_LABELS[key] || String(key || '').toUpperCase(),
  });
})();
