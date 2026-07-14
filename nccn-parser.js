(function () {
  'use strict';

  const SCHEMA_VERSION = 5;
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
  const OPTION_SIGNAL = /\b(?:therapy|chemotherapy|immunotherapy|radiotherapy|resection|surgery|observation|observe|monitoring|surveillance|follow-up|clinical trial|transplant|ablation|embolization|excision|dissection|lobectomy|mastectomy|colectomy|prostatectomy|metastasectomy)\b|\b(?:RT|CRT|PRRT|SBRT|SRS|EBRT|IMRT|ADT|ARPI|SSA)\b|(?:mab|nib|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|lutamide|folfox|folfiri|folfirinox|capox|capeox|chop|abvd|gemox)/i;
  const BOILERPLATE = /^(?:Version |NCCN Guidelines|Note:|Table of Contents|Discussion|References?|Preferred$|Other Recommended$|Useful in Certain Circumstances$|All recommendations|PRINCIPLES OF |PLEASE NOTE|Printed by|Copyright)/i;
  const CITATION_LINE = /\bet al\b|J Clin Oncol|N Engl J Med|Lancet|Cancer Res|Ann Oncol|Radiat Oncol|\bdoi\b|\b20\d{2};\d+/i;
  const BULLET = /^[\u0017\u2022\u25ca\u25e6\u25aa\u25cf\u25a0\u25c6\uf0b7]/u;
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
    return normalizeText(value).replace(/^[\u0017\u2022\u25ca\u25e6\u25aa\u25cf\u25a0\u25c6\uf0b7\s]+/u, '')
      .replace(/\s+/g, ' ').trim();
  }
  function detectVersion(text) {
    const match = text.match(/Version\s+(\d+(?:\.\d+)+)\s*[,\u2014-]?\s*(?:\d{2}\/\d{2}\/)?(20\d{2})?/i);
    return match ? match[1] + (match[2] && !match[1].includes(match[2]) ? ' (' + match[2] + ')' : '') : '';
  }
  function detectVersionDate(text) {
    return text.match(/Version\s+\d+(?:\.\d+)+\s*[\u2014-]\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i)?.[1] || '';
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
      .map(row => sectionMatch(rowText(row)))
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
  function pageKeywords(text) {
    const terms = [
      ['first-line', /first[- ]line|initial systemic/i], ['second-line', /second[- ]line|subsequent therapy|progression/i],
      ['metastatic', /metastatic|distant metast/i], ['unresectable', /unresectable/i], ['resectable', /\bresectable\b/i],
      ['neoadjuvant', /neoadjuvant|preoperative/i], ['adjuvant', /adjuvant|postoperative/i],
      ['MSI-H/dMMR', /MSI-H|dMMR/i], ['TMB-H', /TMB-H|tumor mutational burden-high/i],
      ['PD-L1', /PD\s*-?\s*L1/i], ['HER2', /HER\s*-?\s*2/i], ['EGFR', /\bEGFR\b/i], ['ALK', /\bALK\b/i],
      ['BRAF', /\bBRAF\b/i], ['BRCA', /\bBRCA1?\/?2?\b/i], ['NTRK', /\bNTRK\b/i], ['RET', /\bRET\b/i],
      ['KRAS', /\bKRAS\b/i], ['ROS1', /\bROS1\b/i], ['MET', /\bMET\b/i], ['FGFR', /\bFGFR[1-4]?\b/i],
      ['IDH', /\bIDH[12]?\b/i], ['NRG1', /\bNRG1\b/i], ['CLDN18.2', /CLDN\s*18\.2/i], ['HRD', /\bHRD\b/i],
      ['FOLR1', /FOLR1|FR\s*alpha|FRα/i], ['PSMA', /\bPSMA\b/i], ['PIK3CA', /\bPIK3CA\b/i],
      ['ESR1', /\bESR1\b/i], ['AKT1', /\bAKT1\b/i], ['PTEN', /\bPTEN\b/i], ['POLE', /\bPOLE\b/i],
      ['FLT3', /\bFLT3\b/i], ['NPM1', /\bNPM1\b/i], ['SSTR', /\bSSTR\b/i], ['Ki-67', /Ki\s*-?\s*67/i],
      ['limited-stage-sclc', /limited[- ]stage/i], ['extensive-stage-sclc', /extensive[- ]stage/i],
      ['bclc-0', /BCLC\s*(?:stage\s*)?0\b/i], ['bclc-a', /BCLC\s*(?:stage\s*)?A\b/i],
      ['bclc-b', /BCLC\s*(?:stage\s*)?B\b/i], ['bclc-c', /BCLC\s*(?:stage\s*)?C\b/i], ['bclc-d', /BCLC\s*(?:stage\s*)?D\b/i],
      ['recurrent', /recurren|relapse/i], ['followup', /surveillance|follow-up|monitoring/i],
      ['poorly differentiated NEC', /poorly differentiated[\s\S]{0,80}(?:NEC|neuroendocrine carcinoma)/i],
      ['well-differentiated NET', /well differentiated[\s\S]{0,80}(?:NET|neuroendocrine tumor)/i],
    ];
    return terms.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  }
  function isReferenceMarker(value) {
    const text = String(value || '').trim();
    return /^\d+(?:[-,]\d+)*$/.test(text) || /^[a-z]{1,3}(?:,[a-z]{1,3})*(?:,\d+(?:-\d+)?)*$/.test(text);
  }
  function joinFragments(items) {
    let output = '';
    for (const item of items) {
      const text = String(item.text || '').trim();
      if (!text || isReferenceMarker(text)) continue;
      if (!output) output = text;
      else if (/^[,.;:)\]\/]/.test(text) || /[-\/]$/.test(output)) output += text;
      else output += ' ' + text;
    }
    return normalizeText(output);
  }
  function rowText(row) {
    return joinFragments(row.items);
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
      const text = joinFragments(row.items.filter(item => item.x < firstColumnX - 4));
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
  function isGroupHeading(text) {
    return /^(?:Chemotherapy|Immunotherapy|Targeted therapy|Systemic therapy|Radiation therapy|Chemoradiation|Endocrine therapy|Surgery|Local therapy|Other therapy|Treatment):$/i.test(text);
  }
  function classifyModality(value, pageTypes = []) {
    const text = normalizeText(value);
    if (/surg|resect|excision|dissection|ectomy|transplant|operative/i.test(text)) return 'surgery';
    if (/radiation|radiotherapy|\bRT\b|SBRT|SRS|EBRT|IMRT|brachy/i.test(text)) return 'radiation';
    if (/surveillance|follow-up|monitoring|observation|restaging/i.test(text)) return 'followup';
    if (/systemic|chemotherapy|immunotherapy|targeted|endocrine|\bADT\b|\bARPI\b|\bSSA\b|mab|nib|platin|taxel|rubicin|citabine|lutamide/i.test(text)) return 'systemic';
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
    label = label.replace(/[;,.]+$/, '').trim();
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
        const text = joinFragments(row.items.filter(item => item.x >= header.x - 2 && item.x < columnEnd - 2));
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
  function fallbackBulletOptions(rows, pageTypes = []) {
    const options = [];
    const bulletXs = [...new Set(rows.flatMap(row => row.items.filter(item => BULLET.test(item.text)).map(item => Math.round(item.x))))].sort((a, b) => a - b);
    let group = '';
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
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
        let raw = joinFragments(firstLine);
        let lastY = row.y;
        for (let nextIndex = rowIndex + 1; nextIndex < rows.length; nextIndex++) {
          const nextRow = rows[nextIndex];
          if (lastY - nextRow.y > 18) break;
          const continuationItems = nextRow.items.filter(fragment =>
            fragment.x >= item.x - 2 && fragment.x < columnEnd - 2 && !isReferenceMarker(fragment.text)
          );
          if (continuationItems.some(fragment => BULLET.test(fragment.text))) break;
          const continuation = joinFragments(continuationItems);
          if (!continuation || BOILERPLATE.test(continuation)) continue;
          raw = normalizeText(raw + ' ' + continuation);
          lastY = nextRow.y;
        }
        const cleaned = cleanLine(raw);
        if (isGroupHeading(cleaned)) {
          group = cleaned.replace(/:$/, '');
          continue;
        }
        const option = normalizeTreatmentOption(cleaned, {
          id: 'review', label: 'Needs source review', context: '', group, pageTypes,
        });
        if (option) options.push(option);
        if (options.length >= 40) break;
      }
      if (options.length >= 40) break;
    }
    return options;
  }
  function deduplicateOptions(options) {
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
      const text = rowText(row);
      if (text.length < 3 || text.length > 220 || BOILERPLATE.test(text) || CITATION_LINE.test(text) || !OPTION_SIGNAL.test(text)) continue;
      const option = normalizeTreatmentOption(text, {
        id: 'review', label: 'Needs source review', context: '', group: '', pageTypes,
      });
      if (option) options.push(option);
      if (options.length >= 40) break;
    }
    return options;
  }
  function extractTreatmentOptions(layout, pageTypes = []) {
    const options = [];
    for (let index = 0; index < layout.rows.length; index++) {
      const headers = recommendationHeaders(layout.rows[index]);
      if (headers.length >= 2) options.push(...parseRecommendationTable(layout.rows, index, headers.map(header => ({ ...header, pageTypes }))));
    }
    options.push(...fallbackBulletOptions(layout.rows, pageTypes));
    if (!options.length) options.push(...fallbackSignalOptions(layout.rows, pageTypes));
    return deduplicateOptions(options);
  }
  function detectPageRole(text, options = []) {
    if (options.some(option => typeof option !== 'string' && ['preferred', 'other', 'useful'].includes(option.recommendation))) {
      return 'recommendation';
    }
    if (/PRINCIPLES OF/i.test(text)) return 'principles';
    if (/(?:^|\n)\s*(?:WORKUP|EVALUATION|DIAGNOSIS)(?:\s|$)/i.test(text)) return 'workup';
    if (/(?:^|\n)\s*(?:(?:PRIMARY|INITIAL|SUBSEQUENT|ADJUVANT|NEOADJUVANT)\s+)?(?:TREATMENT|THERAPY|SURVEILLANCE)(?:\s|$)/i.test(text)) return 'pathway';
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
            title: pageTitle(text, section), types, role: detectPageRole(text, treatmentOptions),
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
  window.NCCN_PARSER = {
    schemaVersion: SCHEMA_VERSION,
    isNccnDocument,
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