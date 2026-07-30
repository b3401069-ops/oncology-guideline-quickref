(function () {
  'use strict';

  const SCHEMA_VERSION = 8;
  let pdfJsPromise;
  const PAGE_TYPES = [
    ['systemic', /PRINCIPLES OF (?:SYSTEMIC|ANTI-TUMOR)|SYSTEMIC (?:ANTI-TUMOR )?THERAPY/i],
    ['treatment', /(?:^|\n)\s*TREATMENT(?:\s|$)|TREATMENT OPTIONS/i],
    ['radiation', /PRINCIPLES OF RADIATION|RADIATION THERAPY/i],
    ['surgery', /PRINCIPLES OF SURGERY|SURGICAL (?:MANAGEMENT|PRINCIPLES)/i],
    ['pathology', /PRINCIPLES OF PATHOLOGY|PATHOLOGIC (?:EVALUATION|ASSESSMENT)/i],
    ['biomarker', /BIOMARKER|MOLECULAR (?:TESTING|ANALYSIS|PROFILING)/i],
    ['imaging', /PRINCIPLES OF IMAGING|IMAGING (?:WORKUP|EVALUATION)/i],
    ['followup', /SURVEILLANCE|FOLLOW-UP|FOLLOW UP|MONITORING|POST-TREATMENT/i],
  ];
  const OPTION_SIGNAL = /\b(?:therapy|chemotherapy|immunotherapy|radiotherapy|resection|surgery|observation|observe|monitoring|surveillance|follow-up|clinical trial|transplant|ablation|embolization|excision|dissection|lobectomy|mastectomy|colectomy|prostatectomy|metastasectomy)\b|\b(?:RT|CRT|PRRT|SBRT|SRS|EBRT|IMRT|ADT|ARPI|SSA)\b|(?:mab|nib|zomib|fusp|parib|ciclib|toclax|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|cycline|asone|amide|azine|mustine|phalan|cristine|blastine|folfox|folfiri|folfirinox|capox|capeox|chop|abvd|gemox)/i;
  const BOILERPLATE = /^(?:Version |NCCN Guidelines|Note:|Table of Contents|Discussion|References?|Preferred$|Other Recommended$|Useful in Certain Circumstances$|All recommendations|PRINCIPLES OF |PLEASE NOTE|Printed by|Copyright)/i;
  const CITATION_LINE = /\bet al\b|J Clin Oncol|N Engl J Med|Lancet|Cancer Res|Ann Oncol|Radiat Oncol|\bdoi\b|\b20\d{2};\d+/i;
  const BULLET = /^[\u0017•◊◦▪●■◆\uf0b7]/u;
  const CATEGORY_DEFS = [
    { id: 'preferred', label: 'Preferred', pattern: /^Preferred(?: Regimens?)?$/i },
    { id: 'other', label: 'Other Recommended', pattern: /^Other Recommended(?: Regimens?)?$/i },
    { id: 'useful', label: 'Useful in Certain Circumstances', pattern: /^Useful in Certain Circumstances$/i },
  ];

  function isNccnDocument(doc) {
    return /\bnccn\b/i.test([doc?.source, doc?.title, doc?.fileName].filter(Boolean).join(' ')) || !!doc?.nccnGuidelineId;
  }
  function normalizeText(value) {
    return String(value || '').normalize('NFKC').replace(/[\u0000\ufeff]/g, '').replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  function cleanLine(value) {
    return normalizeText(value).replace(/^[\u0017•◊◦▪●■◆\uf0b7\s]+/u, '')
      .replace(/\s+/g, ' ').trim();
  }
  function detectVersion(text) {
    const match = text.match(/Version\s+(\d+(?:\.\d+)+)\s*[,—-]?\s*(?:\d{2}\/\d{2}\/)?(20\d{2})?/i);
    return match ? match[1] + (match[2] && !match[1].includes(match[2]) ? ' (' + match[2] + ')' : '') : '';
  }
  function detectVersionDate(text) {
    return text.match(/Version\s+\d+(?:\.\d+)+\s*[—-]\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i)?.[1] || '';
  }
  const SECTION_CODE = /^([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)(?:\s+(\d+)\s+OF\s+(\d+))?$/i;
  const NON_SECTION_CODES = /^(?:LOW-RISK|HIGH-RISK|INTERMEDIATE-RISK|VERY-HIGH-RISK|RE-EVALUATE|FIRST-LINE|SECOND-LINE|SUBSEQUENT-LINE|POST-TREATMENT)$/i;
  function sectionMatch(value) {
    const match = cleanLine(value).match(SECTION_CODE);
    if (!match || NON_SECTION_CODES.test(match[1])) return null;
    return { code: match[1].toUpperCase(), part: Number(match[2]) || null, total: Number(match[3]) || null };
  }
  function detectSectionCode(text, rows = []) {
    const footerMatches = rows
      .filter(row => row.y <= 55)
      .flatMap(row => rowSegments(row).map(sectionMatch))
      .filter(Boolean);
    if (footerMatches.length) return footerMatches[0];
    const lines = text.split('\n').map(cleanLine).filter(Boolean);
    const paged = lines.slice(0, 80).join(' ').match(/\b([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)\s+(\d+)\s+OF\s+(\d+)\b/i);
    if (paged && !NON_SECTION_CODES.test(paged[1])) return { code: paged[1].toUpperCase(), part: Number(paged[2]), total: Number(paged[3]) };
    for (let i = 0; i < lines.length; i++) {
      const match = sectionMatch(lines[i]);
      if (match) return match;
    }
    return { code: '', part: null, total: null };
  }
  function detectPageTypes(text) {
    return PAGE_TYPES.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
  }
  function detectRedirectGuidelines(text) {
    if (!/has been separated into the:/i.test(text)) return [];
    return text.split('\n').map(cleanLine)
      .filter(line => /^NCCN Guidelines for /i.test(line))
      .map(line => line.replace(/^NCCN Guidelines for /i, '').trim())
      .filter(Boolean);
  }
  function isNavigationIndexPage(text) {
    const recommendationHeadings = (text.match(/(?:^|\n)\s*(?:Preferred|Other Recommended|Useful in Certain Circumstances)\s*(?:\n|$)/gim) || []).length;
    const recommendationBullets = (text.match(/(?:^|\n)\s*[\u0017•◊◦▪●■◆\uf0b7]/gu) || []).length;
    // 原則頁可能同時列出多個「下一頁」連結；只要頁內已有實際推薦清單，就不是目錄頁。
    if (recommendationHeadings && recommendationBullets >= 2) return false;
    return /NCCN Guidelines Index[\s\S]{0,200}Table of Contents/i.test(text) &&
      (text.match(/\([A-Z][A-Z0-9-]+\s+\d+\s+of\s+\d+\)/gi) || []).length >= 3;
  }
  function pageTitle(text, section) {
    const lines = text.split('\n').map(cleanLine).filter(Boolean);
    return lines.slice(0, 80).find(line =>
      line.length >= 8 && line.length <= 120 &&
      /TREATMENT|THERAPY|PATHOLOGY|BIOMARKER|SURGERY|SURVEILLANCE|IMAGING|WORKUP|DIAGNOSIS/i.test(line) &&
      !BOILERPLATE.test(line) && line !== section.code
    ) || section.code || 'NCCN treatment page';
  }
  function extractOptionLines(text) {
    const options = [];
    for (const line of text.split('\n').map(cleanLine).filter(Boolean)) {
      if (line.length < 3 || line.length > 180 || BOILERPLATE.test(line) || !OPTION_SIGNAL.test(line)) continue;
      if (line.length > 120 && /patients|substituted|data are limited|for information/i.test(line)) continue;
      const cleaned = line.replace(/\s*\d+(?:[-,]\d+)*\s*$/u, '').trim();
      if (cleaned && !options.some(item => item.toLowerCase() === cleaned.toLowerCase())) options.push(cleaned);
      if (options.length >= 24) break;
    }
    return options;
  }
  const KEYWORD_TERMS = [
      ['first-line', /first[- ]line|initial systemic|primary (?:systemic )?(?:therapy|treatment)|newly diagnosed/i], ['second-line', /second[- ]line|subsequent therapy|progression|previously treated|relapsed/i],
      ['metastatic', /metastatic|distant metast/i], ['unresectable', /unresectable/i], ['resectable', /\bresectable\b/i],
      ['neoadjuvant', /neoadjuvant|preoperative/i], ['adjuvant', /adjuvant|postoperative/i],
      ['breast-hr-positive', /HR[- ]POSITIVE/i], ['breast-hr-negative', /HR[- ]NEGATIVE|triple[- ]negative/i],
      ['breast-her2-positive', /HER2[- ]POSITIVE/i], ['breast-her2-negative', /HER2[- ]NEGATIVE|triple[- ]negative/i],
      ['breast-dcis', /\bDCIS\b|ductal carcinoma in situ/i],
      ['breast-upfront-surgery', /after upfront surgery/i],
      ['breast-post-neoadjuvant', /after preoperative systemic (?:therapy|treatment)/i],
      ['breast-residual-disease', /residual (?:invasive )?disease/i], ['breast-pcr', /\bpCR\b|pathologic complete response/i],
      ['breast-node-positive', /node[- ]positive|\bpN[1-3]\b|ypN\+/i], ['breast-node-negative', /node[- ]negative|\bpN0\b|ypN0/i],
      ['breast-genomic-assay', /gene expression assay|21[- ]gene|Oncotype|recurrence score/i],
      ['MSI-H/dMMR', /MSI-H|dMMR/i], ['TMB-H', /TMB-H|tumor mutational burden-high/i],
      ['PD-L1', /PD\s*-?\s*L1/i], ['HER2', /HER\s*-?\s*2/i], ['EGFR', /\bEGFR\b/i], ['ALK', /\bALK\b/i],
      ['BRAF', /\bBRAF\b/i], ['BRCA', /\bBRCA1?\/?2?\b/i], ['NTRK', /\bNTRK\b/i], ['RET', /\bRET\b/i],
      ['KRAS', /\bKRAS\b/i], ['ROS1', /\bROS1\b/i], ['MET', /\bMET\b/i], ['FGFR', /\bFGFR[1-4]?\b/i],
      ['IDH', /\bIDH[12]?\b/i], ['NRG1', /\bNRG1\b/i], ['CLDN18.2', /CLDN\s*18\.2/i], ['HRD', /\bHRD\b/i],
      ['pdgfra', /\bPDGFRA\b/i], ['pdgfrb', /\bPDGFRB\b/i], ['jak2', /\bJAK2\b/i], ['kit', /\bKIT(?:\s+D816V)?\b/i],
      ['myd88', /\bMYD88\b/i], ['cxcr4', /\bCXCR4\b/i],
      ['FOLR1', /FOLR1|FR\s*alpha|FRα/i], ['PSMA', /\bPSMA\b/i], ['PIK3CA', /\bPIK3CA\b/i],
      ['ESR1', /\bESR1\b/i], ['AKT1', /\bAKT1\b/i], ['PTEN', /\bPTEN\b/i], ['POLE', /\bPOLE\b/i],
      ['FLT3', /\bFLT3\b/i], ['NPM1', /\bNPM1\b/i], ['SSTR', /\bSSTR\b/i], ['Ki-67', /Ki\s*-?\s*67/i],
      ['limited-stage-sclc', /limited[- ]stage/i], ['extensive-stage-sclc', /extensive[- ]stage/i],
      ['bclc-0', /BCLC\s*(?:stage\s*)?0\b/i], ['bclc-a', /BCLC\s*(?:stage\s*)?A\b/i],
      ['bclc-b', /BCLC\s*(?:stage\s*)?B\b/i], ['bclc-c', /BCLC\s*(?:stage\s*)?C\b/i], ['bclc-d', /BCLC\s*(?:stage\s*)?D\b/i],
      ['stage-i', /\bstage\s*(?:I|1)(?![IVX\d])/i], ['stage-ii', /\bstage\s*(?:II|2)(?![IVX\d])/i],
      ['stage-iii', /\bstage\s*(?:III|3)(?![IVX\d])/i], ['stage-iv', /\bstage\s*(?:IV|4)(?![IVX\d])/i],
      ['child-pugh-a', /Child\s*-?\s*Pugh(?:\s+class)?\s*[-:：]?\s*A\d?\b/i],
      ['child-pugh-b', /Child\s*-?\s*Pugh(?:\s+class)?\s*[-:：]?\s*B\d?\b/i],
      ['child-pugh-c', /Child\s*-?\s*Pugh(?:\s+class)?\s*[-:：]?\s*C\d?\b/i],
      ['recurrent', /recurren|relapse/i], ['followup', /surveillance|follow-up|monitoring/i],
      ['poorly differentiated NEC', /poorly differentiated[\s\S]{0,80}(?:NEC|neuroendocrine carcinoma)/i],
      ['well-differentiated NET', /well differentiated[\s\S]{0,80}(?:NET|neuroendocrine tumor)/i],
  ];
  function pageKeywords(text) {
    return KEYWORD_TERMS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  }
  // 比對器用來判斷哪些病患條件真的能路由到頁面；
  // 不在此清單中的條件屬「僅供記錄」，不應被當成「找不到對應頁面」的證據。
  const KEYWORD_VOCABULARY = Object.freeze(KEYWORD_TERMS.map(([label]) => String(label).toLowerCase()));
  function isReferenceMarker(value) {
    const text = String(value || '').trim();
    return /^\d+(?:[-,]\d+)*$/.test(text) || /^[a-z]{1,3}(?:,[a-z]{1,3})*(?:,\d+(?:-\d+)?)*$/.test(text);
  }
  // NCCN 演算法頁是多欄版面。同一 y 座標上的片段可能來自不同欄，
  // 直接串起來會把相鄰欄的文字接成一句（例如把 workup 欄和 treatment 欄
  // 併成「Brain MRI ... Positive mediastinal nodes ...」）。
  // 實測片段間距呈雙峰：行內 0–9pt、欄界 30pt 以上，故以 24pt 切欄。
  const COLUMN_GAP = 24;
  function joinFragments(items) {
    let output = '';
    let previousEnd = null;
    for (const item of items) {
      const text = String(item.text || '').trim();
      if (!text || isReferenceMarker(text)) continue;
      const gap = previousEnd == null ? 0 : Number(item.x || 0) - previousEnd;
      previousEnd = Number(item.end ?? item.x ?? 0);
      if (!output) output = text;
      else if (gap >= COLUMN_GAP) output += '\n' + text;
      else if (/^[,.;:)\]\/]/.test(text) || /[-\/]$/.test(output)) output += text;
      else output += ' ' + text;
    }
    return normalizeText(output);
  }
  // 整列文字：跨欄的部分會落在不同行
  function rowText(row) {
    return joinFragments(row.items);
  }
  // 需要單一字串時（例如比對章節代碼）逐段取用
  function rowSegments(row) {
    return rowText(row).split('\n').map(part => part.trim()).filter(Boolean);
  }
  // 保留每個欄位分段的起始座標，供「這個選項屬於哪個標題底下」判斷
  function rowColumns(row) {
    const columns = [];
    let current = null;
    let previousEnd = null;
    for (const item of row.items) {
      const text = String(item.text || '').trim();
      if (!text || isReferenceMarker(text)) continue;
      const gap = previousEnd == null ? 0 : Number(item.x || 0) - previousEnd;
      previousEnd = Number(item.end ?? item.x ?? 0);
      if (!current || gap >= COLUMN_GAP) {
        current = { x: Number(item.x || 0), end: previousEnd, text };
        columns.push(current);
      } else {
        current.text += (/^[,.;:)\]\/]/.test(text) || /[-\/]$/.test(current.text) ? '' : ' ') + text;
        current.end = previousEnd;
      }
    }
    return columns.map(column => ({ ...column, text: normalizeText(column.text) }));
  }
  // 只取目前欄的內容。cleanLine 會把換行收合成空白，
  // 若直接丟進去會把相鄰欄的文字又接回同一句。
  function firstColumn(value) {
    return String(value || '').split('\n')[0].trim();
  }
  function recommendationHeaders(row) {
    const headers = [];
    for (const item of row.items) {
      const text = normalizeText(item.text);
      const definition = CATEGORY_DEFS.find(candidate => candidate.pattern.test(text));
      if (definition) headers.push({ ...definition, x: item.x });
    }
    return headers.sort((a, b) => a.x - b.x);
  }
  function contextBlocks(rows, firstColumnX) {
    const blocks = [];
    let current = null;
    for (const row of rows) {
      const text = firstColumn(joinFragments(row.items.filter(item => item.x < firstColumnX - 4)));
      if (!text || text.length > 140 || BOILERPLATE.test(text) || isReferenceMarker(text)) continue;
      if (!current || current.lastY - row.y > 14.5) {
        current = { startY: row.y, lastY: row.y, text };
        blocks.push(current);
      } else {
        current.text = normalizeText(current.text + ' ' + text);
        current.lastY = row.y;
      }
    }
    return blocks;
  }
  function nearestContext(blocks, y) {
    return blocks.filter(block => block.startY >= y)
      .sort((a, b) => (a.startY - y) - (b.startY - y))[0]?.text || '';
  }
  // NCCN 演算法頁的欄位標題（全大寫）不是治療選項，
  // 例如 FIRST-LINE THERAPY、ADJUVANT SYSTEMIC THERAPY、SUBSEQUENT THERAPY。
  function isColumnHeading(text) {
    const value = String(text || '').trim();
    if (value.length < 5 || value.length > 60) return false;
    if (/[a-z]/.test(value)) return false;
    return /\b(?:THERAPY|TREATMENT|WORKUP|EVALUATION|SURVEILLANCE|FINDINGS|PRESENTATION|ASSESSMENT|DIAGNOSIS|STAGE|RISK)\b/.test(value);
  }
  function isGroupHeading(text) {
    return /^(?:Chemotherapy|Immunotherapy|Targeted therapy|Systemic therapy|Radiation therapy|Chemoradiation|Endocrine therapy|Surgery|Local therapy|Other therapy|Treatment):$/i.test(text);
  }
  // 檢查／分期／病理判讀等步驟不是治療選項。演算法頁的 workup 欄常與治療欄並排，
  // 若讓它們沿用頁面型別，就會變成假的「全身治療」候選（Bronchoscopy、FDG-PET/CT…）。
  const DIAGNOSTIC_SIGNAL = /\b(?:bronchoscopy|mediastinoscopy|thoracentesis|biopsy|aspiration|cytology|pathology review|histolog\w*|PFTs?|pulmonary function|spirometry|MRI|CT scan|CT with|FDG-PET|PET\/CT|PET scan|ultrasound|endoscopy|EUS|EBUS|colonoscopy|mammograph\w*|bone scan|x-ray|radiograph\w*|laborator\w*|blood tests?|CBC|LFTs?|molecular testing|biomarker testing|genetic testing|germline testing|staging workup|workup|evaluation|assessment|screening|smoking cessation|multidisciplinary)\b/i;
  const TREATMENT_SIGNAL = /\b(?:therapy|chemotherapy|immunotherapy|radiotherapy|chemoradiation|resection|surgery|transplant|ablation|embolization|excision|dissection|ectomy|observation|surveillance|clinical trial)\b|(?:mab|nib|zomib|fusp|parib|ciclib|toclax|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|cycline|asone|amide|azine|mustine|phalan|cristine|blastine)\b/i;

  function classifyModality(value, pageTypes = []) {
    const text = normalizeText(value);
    if (/surg|resect|excision|dissection|ectomy|transplant|\boperative\b/i.test(text)) return 'surgery';
    if (/radiation|radiotherapy|\bRT\b|SBRT|SRS|EBRT|IMRT|brachy/i.test(text)) return 'radiation';
    if (/surveillance|follow-up|monitoring|observation|restaging/i.test(text)) return 'followup';
    if (/systemic|chemotherapy|immunotherapy|targeted|endocrine|\bADT\b|\bARPI\b|\bSSA\b|mab|nib|zomib|fusp|parib|ciclib|toclax|platin|taxel|rubicin|citabine|lutamide|cycline|asone|amide|azine|mustine|phalan|cristine|blastine/i.test(text)) return 'systemic';
    // 明顯是檢查步驟就標成 workup，之後會被排除在治療候選之外
    if (DIAGNOSTIC_SIGNAL.test(text)) return 'workup';
    // 沒有任何治療訊號時不再沿用頁面型別，避免把敘述文字誤標成治療
    if (!TREATMENT_SIGNAL.test(text)) return 'other';
    for (const type of ['surgery', 'radiation', 'followup', 'systemic']) if (pageTypes.includes(type)) return type;
    return 'other';
  }
  function normalizeTreatmentOption(raw, metadata) {
    const sourceText = normalizeText(raw).replace(/([A-Za-z])-\s+([a-z])/g, '$1-$2').replace(/\s+([,.;:)\]])/g, '$1');
    if (!sourceText) return null;
    const conditions = [];
    const references = [];
    let label = sourceText.replace(/\(([A-Z]{2,8}(?:-[A-Z0-9]+)+)\)/g, (match, reference) => {
      references.push(reference);
      return '';
    }).replace(/\((?:(?:if|when|only for|for patients?|in patients?)[\s\S]*?)\)/gi, match => {
      conditions.push(match.slice(1, -1).trim());
      return '';
    }).replace(/\s+/g, ' ').trim();
    // 欄位被切斷時常留下連接詞或未閉合括號（'or Lazertinib'、'Durvalumab (if'）
    label = label.replace(/^(?:or|and|plus|then|followed by|±)\s+/i, '').trim();
    label = label.replace(/\s*\((?:[^()]*)?$/, '').trim();
    label = label.replace(/[;,.]+$/, '').trim();
    label = label.replace(/\s+(?:or|and|plus|with|for|if|in|of|the|to)$/i, '').trim();
    if (isColumnHeading(label)) return null;
    const needsReview = (label.match(/\(/g) || []).length !== (label.match(/\)/g) || []).length ||
      label.length > 140 ||
      (!OPTION_SIGNAL.test(label) && !/^None$/i.test(label));
    if (label.length < 2 || label.length > 220) return null;
    return {
      label,
      recommendation: metadata.id,
      recommendationLabel: metadata.label,
      group: metadata.group || '',
      context: metadata.context || '',
      conditions,
      references,
      needsReview,
      modality: classifyModality([metadata.group, metadata.context, label].filter(Boolean).join(' '), metadata.pageTypes || []),
      sourceText,
    };
  }
  const DRUG_ENDING = /(?:mab|nib|zomib|fusp|parib|ciclib|toclax|platin|taxel|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|reotide|limus|cycline|asone|amide|azine|mustine|phalan|cristine|blastine)$/i;
  function narrativeDrugCandidates(option) {
    if (!option?.needsReview || option.modality !== 'systemic' || option.label.length < 100) return [];
    const tokens = option.label.match(/\b[A-Za-z][A-Za-z0-9]*(?:-[a-z0-9]+)?\b/g) || [];
    const labels = [];
    for (const token of tokens) {
      const stem = token.split('-')[0];
      if (!DRUG_ENDING.test(stem) || labels.some(label => label.toLowerCase() === token.toLowerCase())) continue;
      labels.push(token);
    }
    return labels.slice(0, 8).map(label => ({
      ...option,
      label,
      needsReview: false,
      sourceNeedsReview: true,
      derivedFromNarrative: true,
      modality: 'systemic',
    }));
  }
  function parseRecommendationTable(rows, headerIndex, headers) {
    const tableRows = rows.slice(headerIndex + 1).filter(row => row.y > 55);
    const firstColumnX = headers[0].x;
    const contexts = contextBlocks(tableRows, firstColumnX);
    const options = [];
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
      const header = headers[columnIndex];
      const columnEnd = headers[columnIndex + 1]?.x ?? Number.POSITIVE_INFINITY;
      let group = '';
      let current = null;
      const finish = () => {
        if (!current) return;
        const option = normalizeTreatmentOption(current.raw, {
          ...header,
          group: current.group,
          context: nearestContext(contexts, current.y),
          pageTypes: header.pageTypes || [],
        });
        if (option) options.push(option);
        current = null;
      };
      for (const row of tableRows) {
        const text = firstColumn(joinFragments(row.items.filter(item => item.x >= header.x - 2 && item.x < columnEnd - 2)));
        if (!text) continue;
        if (isGroupHeading(text)) {
          finish();
          group = text.replace(/:$/, '');
          continue;
        }
        if (BULLET.test(text)) {
          finish();
          current = { raw: text.replace(BULLET, '').trim(), y: row.y, lastY: row.y, group };
          continue;
        }
        if (current && current.lastY - row.y <= 14.5 && !BOILERPLATE.test(text)) {
          current.raw = normalizeText(current.raw + ' ' + text);
          current.lastY = row.y;
        } else if (current && current.lastY - row.y > 14.5) {
          finish();
        }
      }
      finish();
    }
    return options;
  }
  // 處方附錄頁（NSCL-J 之類）的選項是純項目符號清單，沒有推薦欄標題，
  // 但上方會有「EGFR Exon 19 Deletion … First-Line Therapy」這種情境標題。
  // 不綁定的話，整頁的處方都會被視為適用於頁面上出現過的任一標記。
  const CONTEXT_HEADING = /\b(?:EGFR|ALK|ROS1|BRAF|RET|MET|KRAS|NTRK|NRG1|HER2|PD-L1|MSI|dMMR|TMB|exon|mutation|rearrangement|fusion|positive|negative|first-line|second-line|subsequent|maintenance|adjuvant|neoadjuvant|metastatic|unresectable|recurrent|stage)\b/i;
  const DRUG_TOKEN = /(?:mab|nib|zomib|fusp|parib|ciclib|toclax|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|cycline|asone|mustine|phalan|cristine|blastine|vedotin|deruxtecan)\b/i;
  // 「EGFR Exon 19 Deletion … First-Line Therapy」「PD-L1 ≥50% First-Line Therapy」
  // 這類是情境標題，不是療程本身：帶臨床情境字樣但不含藥名。
  function isContextHeading(text) {
    const value = cleanLine(text);
    if (value.length < 6 || value.length > 80) return false;
    if (DRUG_TOKEN.test(value)) return false;
    if (BOILERPLATE.test(value) || CITATION_LINE.test(value)) return false;
    return CONTEXT_HEADING.test(value);
  }
  // 以 x 座標分欄記錄目前生效的情境標題
  const columnBucket = (x) => Math.round(Number(x || 0) / 40);

  function fallbackBulletOptions(rows, pageTypes = []) {
    const options = [];
    const bulletXs = [...new Set(rows.flatMap(row => row.items.filter(item => BULLET.test(item.text)).map(item => Math.round(item.x))))].sort((a, b) => a - b);
    // 依閱讀順序累積情境標題。標題有時置中跨越整張表（PD-L1 ≥50% FIRST-LINE
    // THERAPY），有時對齊單一欄，因此同時保留頁面層級與欄位層級兩種。
    const contextByColumn = new Map();
    let pageContext = '';
    let group = '';
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      // 沒有項目符號、且看起來是情境標題的分段，更新該欄的情境
      for (const column of rowColumns(row)) {
        if (BULLET.test(column.text) || !isContextHeading(column.text)) continue;
        const heading = cleanLine(column.text);
        contextByColumn.set(columnBucket(column.x), heading);
        pageContext = heading;
      }
      const items = row.items.filter(item => !isReferenceMarker(item.text));
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        if (!BULLET.test(item.text)) continue;
        const nextBullet = items.slice(itemIndex + 1).find(candidate => BULLET.test(candidate.text));
        const nextColumnX = bulletXs.find(x => x > item.x + 120);
        const columnEnd = Math.min(nextBullet?.x ?? Number.POSITIVE_INFINITY, nextColumnX ?? Number.POSITIVE_INFINITY);
        const firstLineEnd = items.findIndex((fragment, index) => index > itemIndex && fragment.x >= columnEnd);
        const firstLine = items.slice(itemIndex, firstLineEnd >= 0 ? firstLineEnd : items.length)
          .map((fragment, index) => index ? fragment : { ...fragment, text: fragment.text.replace(BULLET, '').trim() });
        let raw = firstColumn(joinFragments(firstLine));
        let lastY = row.y;
        // 相鄰欄若沒有項目符號，columnEnd 會是無限大，續行就會誤抓右側欄的文字。
        // 改以本欄第一行的實際右緣加上欄距作為邊界。
        const firstLineRight = firstLine.reduce((max, fragment) => Math.max(max, Number(fragment.end ?? fragment.x ?? 0)), item.x);
        const effectiveEnd = Number.isFinite(columnEnd) ? columnEnd : firstLineRight + COLUMN_GAP;
        for (let nextIndex = rowIndex + 1; nextIndex < rows.length; nextIndex++) {
          const nextRow = rows[nextIndex];
          if (lastY - nextRow.y > 18) break;
          const continuationItems = nextRow.items.filter(fragment =>
            fragment.x >= item.x - 2 && fragment.x < effectiveEnd - 2 && !isReferenceMarker(fragment.text)
          );
          if (continuationItems.some(fragment => BULLET.test(fragment.text))) break;
          const continuation = firstColumn(joinFragments(continuationItems));
          if (!continuation || BOILERPLATE.test(continuation)) continue;
          raw = normalizeText(raw + ' ' + continuation);
          lastY = nextRow.y;
        }
        const cleaned = cleanLine(raw);
        if (isGroupHeading(cleaned)) {
          group = cleaned.replace(/:$/, '');
          continue;
        }
        // 標題本身不是療程；記錄為情境後跳過
        if (isContextHeading(cleaned)) {
          contextByColumn.set(columnBucket(item.x), cleaned);
          pageContext = cleaned;
          continue;
        }
        const bucket = columnBucket(item.x);
        const context = contextByColumn.get(bucket)
          ?? contextByColumn.get(bucket - 1) ?? contextByColumn.get(bucket + 1) ?? pageContext;
        const option = normalizeTreatmentOption(cleaned, {
          id: 'review', label: 'Needs source review', context, group, pageTypes,
        });
        if (option) options.push(option);
        if (options.length >= 40) break;
      }
      if (options.length >= 40) break;
    }
    return options;
  }
  // Some NCCN pathway tables place treatment sentences in a flowchart column
  // without bullets or recommendation headers. Breast BINV-5 through BINV-10
  // use this layout, so the ordinary fallbacks otherwise return histology labels
  // such as "Ductal/NST" instead of the actual adjuvant treatment branches.
  const UNBULLETED_TREATMENT_START = /^(?:No adjuvant therapy|Consider adjuvant (?:chemotherapy|endocrine therapy|abemaciclib|ribociclib)|Adjuvant (?:chemotherapy|endocrine therapy))/i;
  function fallbackUnbulletedTreatmentOptions(layout, pageTypes = []) {
    if (!/SYSTEMIC ADJUVANT TREATMENT:/i.test(layout.text || '')) return [];
    const rows = layout.rows || [];
    const rightBoundaries = rows.flatMap(row => rowColumns(row))
      .filter(column => /^(?:Adjuvant whole|breast RT|or PMRT|Follow-up)\b/i.test(column.text))
      .map(column => column.x);
    const options = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      for (const column of rowColumns(row)) {
        const initial = cleanLine(column.text);
        if (column.x < 250 || column.x > 670 || BULLET.test(initial) || !UNBULLETED_TREATMENT_START.test(initial)) continue;
        const rightBoundary = rightBoundaries.filter(x => x > column.x + 60).sort((a, b) => a - b)[0]
          ?? column.x + 250;
        const treatmentText = (items) => normalizeText(items
          .filter(item => !isReferenceMarker(item.text))
          .map(item => String(item.text || '').trim())
          .filter(Boolean).join(' '));
        let raw = treatmentText(row.items.filter(item => item.x >= column.x - 3 && item.x < rightBoundary - 2));
        let lastY = row.y;
        for (let nextIndex = rowIndex + 1; nextIndex < rows.length; nextIndex++) {
          const nextRow = rows[nextIndex];
          if (lastY - nextRow.y > 18) break;
          const continuationColumns = rowColumns(nextRow).filter(candidate =>
            candidate.x >= column.x - 3 && candidate.x < rightBoundary - 2
          );
          if (continuationColumns.some(candidate => UNBULLETED_TREATMENT_START.test(cleanLine(candidate.text)))) break;
          const continuation = treatmentText(nextRow.items.filter(item =>
            item.x >= column.x - 3 && item.x < rightBoundary - 2
          ));
          if (!continuation || BOILERPLATE.test(continuation)) continue;
          raw = normalizeText(raw + ' ' + continuation);
          lastY = nextRow.y;
        }
        const option = normalizeTreatmentOption(raw, {
          id: 'review', label: 'Needs source review', context: '', group: '', pageTypes,
        });
        if (!option) continue;
        option.label = option.label.replace(/chemotherapy adjuvant olaparib/i, 'chemotherapy and adjuvant olaparib');
        option.modality = 'systemic';
        if (/HR-NEGATIVE\s*[–-]\s*HER2-NEGATIVE/i.test(layout.text || '')) {
          if (/^No adjuvant therapy/i.test(option.label)) {
            option.conditions.push('pT1a（≤0.5 cm）且 pN0');
          } else if (/^Consider adjuvant chemotherapy/i.test(option.label)) {
            option.conditions.push('pT1a 且 pN1mi，或 pT1b');
          } else if (/^Adjuvant chemotherapy/i.test(option.label)) {
            option.conditions.push('pT1c–pT3（>1 cm），或 pN+（轉移灶 >2 mm）');
          }
        }
        options.push(option);
      }
    }
    return options;
  }  function deduplicateOptions(options) {
    const seen = new Set();
    return options.filter(option => {
      const key = option.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 60);
  }
  function fallbackSignalOptions(rows, pageTypes = []) {
    const options = [];
    for (const row of rows) {
      // 逐欄檢視，避免把相鄰欄的文字併成一個候選
      for (const text of rowSegments(row)) {
        if (text.length < 3 || text.length > 220 || BOILERPLATE.test(text) || CITATION_LINE.test(text) || !OPTION_SIGNAL.test(text)) continue;
        const option = normalizeTreatmentOption(text, {
          id: 'review', label: 'Needs source review', context: '', group: '', pageTypes,
        });
        if (option) options.push(option);
        if (options.length >= 40) break;
      }
      if (options.length >= 40) break;
    }
    return options;
  }
  // 表格上方（常置中）的情境標題，供推薦表路徑補上 context
  function headingAbove(rows, y) {
    let best = null;
    for (const row of rows) {
      if (row.y <= y) continue;
      for (const column of rowColumns(row)) {
        if (BULLET.test(column.text) || !isContextHeading(column.text)) continue;
        if (!best || row.y - y < best.distance) best = { distance: row.y - y, text: cleanLine(column.text) };
      }
    }
    return best?.text || '';
  }
  function extractTreatmentOptions(layout, pageTypes = []) {
    const options = [];
    for (let index = 0; index < layout.rows.length; index++) {
      const headers = recommendationHeaders(layout.rows[index]);
      if (headers.length < 2) continue;
      const fallbackContext = headingAbove(layout.rows, layout.rows[index].y);
      const tableOptions = parseRecommendationTable(layout.rows, index, headers.map(header => ({ ...header, pageTypes })));
      for (const option of tableOptions) if (!option.context) option.context = fallbackContext;
      options.push(...tableOptions);
    }
    options.push(...fallbackBulletOptions(layout.rows, pageTypes));
    options.push(...fallbackUnbulletedTreatmentOptions(layout, pageTypes));
    if (!options.length) options.push(...fallbackSignalOptions(layout.rows, pageTypes));
    // 檢查步驟與無治療語意的敘述不列為治療候選；
    // 演算法頁的 workup 欄與治療欄並排，不濾掉會混進候選清單。
    // 乳癌術後流程表左側的病理型態是入口條件，不是治療選項。
    const optionPool = /SYSTEMIC ADJUVANT TREATMENT:/i.test(layout.text || '')
      ? options.filter(option => !/^(?:Ductal\/NST|Lobular|Mixed|Micropapillary|Metaplastic)$/i.test(option.label))
      : options;
    const treatments = optionPool.filter(option => !['workup', 'other'].includes(option.modality));
    const normalized = deduplicateOptions(treatments.length ? treatments : optionPool.filter(option => option.modality !== 'workup'));
    const expanded = [];
    for (const option of normalized) {
      expanded.push(option, ...narrativeDrugCandidates(option));
    }
    return deduplicateOptions(expanded);
  }
  function detectPageRole(text, options = [], section = {}) {
    if (options.some(option => typeof option !== 'string' && ['preferred', 'other', 'useful'].includes(option.recommendation))) {
      return 'recommendation';
    }
    // NCCN 慣例：數字結尾的章節代碼（HCC-4）是演算法頁，字母結尾（HCC-F）是原則／附錄。
    // 演算法頁常在腳註引用 "See Principles of Surgery"，不可因此被降級成 principles。
    const numberedAlgorithm = /-\d+$/.test(String(section.code || ''));
    const headLines = text.split('\n').slice(0, 15).map(cleanLine).filter(Boolean);
    const head = headLines.join(' ');
    if (/^PRINCIPLES OF/i.test(headLines[0] || '') || (!numberedAlgorithm && /PRINCIPLES OF/i.test(head))) return 'principles';
    if (/\b(?:TREATMENT|THERAPY|SURVEILLANCE)\b/i.test(head)) return 'pathway';
    if (/\b(?:WORKUP|EVALUATION|DIAGNOSIS)\b/i.test(head)) return 'workup';
    if (numberedAlgorithm) return 'pathway';
    if (/PRINCIPLES OF/i.test(text)) return 'principles';
    return 'supporting';
  }
  function extractNextStepReferences(text, currentCode) {
    const output = [];
    for (const line of text.split('\n').map(cleanLine).filter(Boolean)) {
      if (!/workup|treatment|follow-up|surveillance|monitoring|progression|recurrence|relapse|next|see principles/i.test(line)) continue;
      for (const match of line.matchAll(/\(?([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)\)?/g)) {
        const code = match[1].toUpperCase();
        if (code === currentCode || NON_SECTION_CODES.test(code) || output.some(item => item.code === code)) continue;
        output.push({ code, label: line.slice(0, 160) });
      }
      if (output.length >= 12) break;
    }
    return output;
  }
  async function loadPdfJs(moduleUrl, workerUrl) {
    if (!pdfJsPromise) pdfJsPromise = import(moduleUrl).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
    return pdfJsPromise;
  }
  async function pageLayout(page) {
    const content = await page.getTextContent();
    const grouped = new Map();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const x = Number(item.transform?.[4] || 0);
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2;
      if (!grouped.has(y)) grouped.set(y, []);
      grouped.get(y).push({ x, end: x + Number(item.width || 0), text: item.str });
    }
    const rows = [...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([y, items]) => ({
      y,
      items: items.sort((a, b) => a.x - b.x),
    }));
    return { rows, text: normalizeText(rows.map(rowText).join('\n')) };
  }
  async function extractAndParse(blob, options = {}) {
    const pdfjs = await loadPdfJs(options.moduleUrl || './vendor/pdf.min.mjs', options.workerUrl || './vendor/pdf.worker.min.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
    const pdf = await task.promise;
    const sections = [], treatmentPages = [];
    let version = '', versionDate = '', lowTextPages = 0, redirectGuidelines = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        options.onProgress?.({ pageNumber, pageCount: pdf.numPages });
        const page = await pdf.getPage(pageNumber);
        const layout = await pageLayout(page);
        const text = layout.text;
        if (pageNumber <= 3) {
          version ||= detectVersion(text);
          versionDate ||= detectVersionDate(text);
          if (!redirectGuidelines.length) redirectGuidelines = detectRedirectGuidelines(text);
        }
        if (text.replace(/\s/g, '').length < 30) lowTextPages++;
        const section = detectSectionCode(text, layout.rows);
        const types = detectPageTypes(text);
        const navigationPage = isNavigationIndexPage(text);
        const pageLines = text.split('\n').map(cleanLine).filter(Boolean);
        const citationLineCount = pageLines.filter(line => CITATION_LINE.test(line)).length;
        const updatePage = /UPDATES? IN VERSION|SUMMARY OF (?:THE )?GUIDELINE UPDATES|New section added:|Footnote [a-z]+ (?:added|modified):/i.test(text);
        const supportingPage = /^(?:MS|ABBR)-/.test(section.code) || updatePage ||
          pageLines.some(line => /^(?:FOOTNOTES|REFERENCES|ABBREVIATIONS)$/.test(line)) ||
          citationLineCount >= Math.max(6, Math.ceil(pageLines.length * 0.2));
        if (section.code && !navigationPage) sections.push({ ...section, page: pageNumber, title: pageTitle(text, section), types });
        if (section.code && !navigationPage && !supportingPage && types.some(type => ['systemic', 'treatment', 'radiation', 'surgery', 'followup'].includes(type))) {
          const treatmentOptions = extractTreatmentOptions(layout, types);
          if (treatmentOptions.length) treatmentPages.push({
            page: pageNumber, sectionCode: section.code, sectionPart: section.part, sectionTotal: section.total,
            title: pageTitle(text, section), types, role: detectPageRole(text, treatmentOptions, section),
            keywords: pageKeywords(text), options: treatmentOptions,
            nextStepRefs: extractNextStepReferences(text, section.code),
          });
        }
        page.cleanup();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const sectionsByCode = new Map();
      for (const section of sections) {
        if (!sectionsByCode.has(section.code)) sectionsByCode.set(section.code, []);
        sectionsByCode.get(section.code).push(section);
      }
      for (const page of treatmentPages) {
        const refs = [...(page.nextStepRefs || [])];
        if (page.sectionPart && page.sectionTotal && page.sectionPart < page.sectionTotal) {
          const nextPart = (sectionsByCode.get(page.sectionCode) || []).find(section => section.part === page.sectionPart + 1);
          if (nextPart) refs.unshift({ code: page.sectionCode, label: page.sectionCode + ' ' + nextPart.part + '/' + nextPart.total, page: nextPart.page });
        }
        page.nextSteps = refs.map(ref => {
          const target = ref.page ? { page: ref.page } : (sectionsByCode.get(ref.code) || [])[0];
          return target ? { code: ref.code, label: ref.label, page: target.page } : null;
        }).filter(Boolean).filter((item, index, all) => all.findIndex(other => other.code === item.code && other.page === item.page) === index).slice(0, 8);
        for (const option of page.options) if (typeof option !== 'string') option.referencePages = (option.references || []).map(code => ({ code, page: (sectionsByCode.get(code) || [])[0]?.page })).filter(item => item.page);
        delete page.nextStepRefs;
      }
      return {
        schemaVersion: SCHEMA_VERSION, parsedAt: new Date().toISOString(), version, versionDate, pageCount: pdf.numPages,
        lowTextPages, sections, treatmentPages, redirectGuidelines,
        status: redirectGuidelines.length ? 'redirect_notice' :
          lowTextPages > Math.max(3, Math.ceil(pdf.numPages * 0.1)) ? 'review_needed' : 'parsed',
      };
    } finally {
      await pdf.destroy();
    }
  }
  function isCurrentStructure(doc) {
    const version = Number(doc?.nccnStructure?.schemaVersion || 0);
    if (version === SCHEMA_VERSION) return true;
    if (SCHEMA_VERSION === 8 && version === 7) {
      const identity = [doc?.title, doc?.fileName, doc?.guidelineName, doc?.source].filter(Boolean).join(' ');
      return !/\bBreast Cancer\b/i.test(identity);
    }
    return false;
  }  window.NCCN_PARSER = {
    schemaVersion: SCHEMA_VERSION,
    KEYWORD_VOCABULARY,
    isNccnDocument,
    isCurrentStructure,
    normalizeText,
    detectVersion,
    detectSectionCode,
    detectRedirectGuidelines,
    isNavigationIndexPage,
    extractOptionLines,
    extractTreatmentOptions,
    pageKeywords,
    classifyModality,
    normalizeTreatmentOption,
    detectPageRole,
    extractNextStepReferences,
    extractAndParse,
  };
})();