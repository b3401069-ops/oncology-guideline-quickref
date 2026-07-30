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

  window.CLINICAL_MATCHER = Object.freeze({
    extractClinicalFeatures,
    matchTreatmentPages,
    diagnoseTreatmentMatch,
    optionAssessment,
    breastAdjuvantAssessment,
    featureLabel: (key) => FEATURE_LABELS[key] || String(key || '').toUpperCase(),
  });
})();
