(function () {
  'use strict';

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
  const OPTION_SIGNAL = /\b(?:therapy|chemotherapy|immunotherapy|radiotherapy|resection|surgery|observation|clinical trial|transplant|ablation|embolization)\b|\b(?:RT|CRT|PRRT)\b|(?:mab|nib|platin|taxel|mycin|rubicin|citabine|trexate|zolomide|toposide|otecan|folfox|folfiri|capox|capeox|chop|abvd|gemox)/i;
  const BOILERPLATE = /^(?:Version |NCCN Guidelines|Note:|Table of Contents|Discussion|References?|Preferred$|Other Recommended$|Useful in Certain Circumstances$|All recommendations|PRINCIPLES OF |PLEASE NOTE|Printed by|Copyright)/i;

  function isNccnDocument(doc) {
    return /\bnccn\b/i.test([doc?.source, doc?.title, doc?.fileName].filter(Boolean).join(' ')) || !!doc?.nccnGuidelineId;
  }
  function normalizeText(value) {
    return String(value || '').normalize('NFKC').replace(/[\u0000\ufeff]/g, '').replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  function cleanLine(value) {
    return normalizeText(value).replace(/^[\u2022\u25e6\u25aa\u25cf\u25a0\u25c6\uf0b7\s]+/u, '')
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
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      const match = lines[i].match(/^([A-Z][A-Z0-9]{1,10}(?:-[A-Z0-9]{1,8})+)(?:\s+(\d+)\s+OF\s+(\d+))?$/i);
      if (match) return { code: match[1].toUpperCase(), part: Number(match[2]) || null, total: Number(match[3]) || null };
    }
    return { code: '', part: null, total: null };
  }
  function detectPageTypes(text) {
    return PAGE_TYPES.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
  }
  function pageTitle(text, section) {
    const lines = text.split('\n').map(cleanLine).filter(Boolean);
    return lines.slice(0, 80).find(line =>
      line.length >= 8 && line.length <= 120 &&
      /TREATMENT|THERAPY|PATHOLOGY|BIOMARKER|SURGERY|SURVEILLANCE|IMAGING|WORKUP|DIAGNOSIS/i.test(line) &&
      !BOILERPLATE.test(line) && line !== section.code
    ) || section.code || '指引頁面';
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
  async function loadPdfJs(moduleUrl, workerUrl) {
    if (!pdfJsPromise) pdfJsPromise = import(moduleUrl).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
    return pdfJsPromise;
  }
  async function pageText(page) {
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const x = Number(item.transform?.[4] || 0);
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, text: item.str });
    }
    return normalizeText([...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')).join('\n'));
  }
  async function extractAndParse(blob, options = {}) {
    const pdfjs = await loadPdfJs(options.moduleUrl || './vendor/pdf.min.mjs', options.workerUrl || './vendor/pdf.worker.min.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
    const pdf = await task.promise;
    const sections = [], treatmentPages = [];
    let version = '', versionDate = '', lowTextPages = 0;
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        options.onProgress?.({ pageNumber, pageCount: pdf.numPages });
        const page = await pdf.getPage(pageNumber);
        const text = await pageText(page);
        if (pageNumber <= 3) {
          version ||= detectVersion(text);
          versionDate ||= detectVersionDate(text);
        }
        if (text.replace(/\s/g, '').length < 30) lowTextPages++;
        const section = detectSectionCode(text);
        const types = detectPageTypes(text);
        if (section.code) sections.push({ ...section, page: pageNumber, title: pageTitle(text, section), types });
        if (types.some(type => ['systemic', 'treatment', 'radiation', 'surgery'].includes(type))) {
          treatmentPages.push({
            page: pageNumber, sectionCode: section.code, sectionPart: section.part, sectionTotal: section.total,
            title: pageTitle(text, section), types, keywords: pageKeywords(text), options: extractOptionLines(text),
          });
        }
        page.cleanup();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return {
        schemaVersion: 1, parsedAt: new Date().toISOString(), version, versionDate, pageCount: pdf.numPages,
        lowTextPages, sections, treatmentPages,
        status: lowTextPages > Math.max(3, Math.ceil(pdf.numPages * 0.1)) ? 'review_needed' : 'parsed',
      };
    } finally {
      await pdf.destroy();
    }
  }
  window.NCCN_PARSER = { isNccnDocument, normalizeText, detectVersion, detectSectionCode, extractOptionLines, extractAndParse };
})();
