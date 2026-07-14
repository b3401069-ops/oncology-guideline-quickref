(function () {
  'use strict';

  const SCHEMA_VERSION = 3;
  let pdfJsPromise;
  const PAGE_TYPES = [
    ['systemic', /PRINCIPLES OF (?:SYSTEMIC|ANTI-TUMOR)|SYSTEMIC (?:ANTI-TUMOR )?THERAPY/i],
    ['treatment', /(?:^|\n)\s*TREATMENT(?:\s|$)|TREATMENT OPTIONS/i],
    ['radiation', /PRINCIPLES OF RADIATION|RADIATION THERAPY/i],
    ['surgery', /PRINCIPLES OF SURGERY|SURGICAL (?:MANAGEMENT|PRINCIPLES)/i],
    ['pathology', /PRINCIPLES OF PATHOLOGY|PATHOLOGIC (?:EVALUATION|ASSESSMENT)/i],
    ['biomarker', /BIOMARKER|MOLECULAR (?:TESTING|ANALYSIS|PROFILING)/i],
    ['imaging', /PRINCIPLES OF IMAGING|IMAGING (?:WORKUP|EVALUATION)/i],
    ['followup', /SURVEILLANCE|FOLLOW-UP/i],
  ];
  const OPTION_SIGNAL = /\b(?:therapy|chemotherapy|immunotherapy|radiotherapy|resection|surgery|observation|observe|clinical trial|transplant|ablation|embolization)\b|\b(?:RT|CRT|PRRT)\b|(?:mab|nib|limus|reotide|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|folfox|folfiri|folfirinox|capox|capeox|chop|abvd|gemox)/i;
  const BOILERPLATE = /^(?:Version |NCCN Guidelines|Note:|Table of Contents|Discussion|References?|Preferred$|Other Recommended$|Useful in Certain Circumstances$|All recommendations|PRINCIPLES OF |PLEASE NOTE|Printed by|Copyright)/i;
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
  function detectSectionCode(text) {
    const lines = text.split('\n').map(cleanLine).filter(Boolean);
    const paged = lines.slice(0, 80).join(' ').match(/\b([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)\s+(\d+)\s+OF\s+(\d+)\b/i);
    if (paged) return { code: paged[1].toUpperCase(), part: Number(paged[2]), total: Number(paged[3]) };
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)(?:\s+(\d+)\s+OF\s+(\d+))?$/i);
      if (match) return { code: match[1].toUpperCase(), part: Number(match[2]) || null, total: Number(match[3]) || null };
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
      ['KRAS', /\bKRAS\b/i], ['SSTR', /\bSSTR\b/i], ['Ki-67', /Ki\s*-?\s*67/i],
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
      label.length > 100 ||
      (!OPTION_SIGNAL.test(label) && !/^None$/i.test(label));
    if (label.length < 2 || label.length > 100) return null;
    return {
      label,
      recommendation: metadata.id,
      recommendationLabel: metadata.label,
      group: metadata.group || '',
      context: metadata.context || '',
      conditions,
      references,
      needsReview,
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
  function fallbackBulletOptions(rows) {
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
          id: 'review', label: 'Needs source review', context: '', group,
        });
        if (option && !option.needsReview) options.push(option);
        if (options.length >= 40) break;
      }
      if (options.length >= 40) break;
    }
    return options;
  }
  function deduplicateOptions(options) {
    const seen = new Set();
    return options.filter(option => {
      const key = [option.label, option.recommendation, option.context].join('|').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 60);
  }
  function extractTreatmentOptions(layout) {
    const options = [];
    for (let index = 0; index < layout.rows.length; index++) {
      const headers = recommendationHeaders(layout.rows[index]);
      if (headers.length >= 2) options.push(...parseRecommendationTable(layout.rows, index, headers));
    }
    return deduplicateOptions(options.length ? options : fallbackBulletOptions(layout.rows));
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
        const section = detectSectionCode(text);
        const types = detectPageTypes(text);
        const navigationPage = isNavigationIndexPage(text);
        if (section.code && !navigationPage) sections.push({ ...section, page: pageNumber, title: pageTitle(text, section), types });
        if (section.code && !navigationPage && types.some(type => ['systemic', 'treatment', 'radiation', 'surgery'].includes(type))) {
          const treatmentOptions = extractTreatmentOptions(layout);
          if (treatmentOptions.length) treatmentPages.push({
            page: pageNumber, sectionCode: section.code, sectionPart: section.part, sectionTotal: section.total,
            title: pageTitle(text, section), types, keywords: pageKeywords(text), options: treatmentOptions,
          });
        }
        page.cleanup();
        await new Promise(resolve => setTimeout(resolve, 0));
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
    extractAndParse,
  };
})();