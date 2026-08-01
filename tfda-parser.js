(() => {
  'use strict';

  let pdfJsPromise;

  const normalizeText = value => String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000\uf9fa]/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

  function isTfdaDocument(doc) {
    return /TFDA|核定仿單|藥品仿單|電子仿單|許可證|衛(?:署|部)藥/i.test(
      [doc?.source, doc?.title, doc?.fileName].filter(Boolean).join(' ')
    );
  }

  function normalizePermit(value) {
    return normalizeText(value).replace(/\s+/g, '');
  }

  function permitNumber(text) {
    const match = normalizeText(text).match(/(?:衛署|衛部|內衛)?藥(?:製|輸|陸輸|菌疫製|菌疫輸)字第\s*[A-Z]?\d{5,7}\s*號/u);
    return match ? normalizePermit(match[0]) : '';
  }

  function fieldValue(lines, labels) {
    const pattern = new RegExp('^(?:' + labels.join('|') + ')\\s*[:：]\\s*(.+)$', 'i');
    for (const line of lines) {
      const match = normalizeText(line).match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  }

  function cleanDrugName(value) {
    return normalizeText(value)
      .replace(/^(?:each|含有|主成分為)\s*/i, '')
      .replace(/\s+(?:\d+(?:\.\d+)?\s*)?(?:mg|mcg|μg|g|ml|毫克|微克|公克|毫升)\b.*$/iu, '')
      .replace(/[，,;；].*$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function ingredientName(lines) {
    const direct = fieldValue(lines, ['主成分略述', '主成分', '有效成分', 'Active ingredient']);
    if (direct) return cleanDrugName(direct);
    const headingIndex = lines.findIndex(line => /^(?:\d+(?:\.\d+)*[.、 ]*)?(?:有效成分及含量|成分及含量|active ingredients?)$/i.test(normalizeText(line)));
    if (headingIndex < 0) return '';
    for (let index = headingIndex + 1; index < Math.min(lines.length, headingIndex + 6); index++) {
      const candidate = cleanDrugName(lines[index]);
      if (candidate && !/^\d+(?:\.\d+)*[.、 ]/.test(candidate)) return candidate;
    }
    return '';
  }

  function isoDate(year, month, day) {
    let fullYear = Number(year);
    if (fullYear < 1911) fullYear += 1911;
    const date = new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return '';
    return [fullYear, Number(month), Number(day)].map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
  }

  function approvalDate(text) {
    const scoped = normalizeText(text).match(/(?:核准|變更|修訂)(?:日期)?[:：]?[\s\S]{0,60}/u)?.[0] || '';
    const match = scoped.match(/(20\d{2}|1\d{2})\s*[年.\/-]\s*(\d{1,2})\s*[月.\/-]\s*(\d{1,2})/u);
    return match ? isoDate(match[1], match[2], match[3]) : '';
  }

  const INDICATION_HEADING = /^(?:\d+(?:\.\d+)*[.、 ]*)?(?:適應症(?:及用途)?|indications?(?: and usage)?)\s*[:：]?\s*(.*)$/i;
  const NEXT_SECTION = /^(?:\d+(?:\.\d+)*[.、 ]+\S+|用法(?:及)?用量|禁忌(?:症)?|警語|注意事項|不良反應|副作用|dosage|contraindications?|warnings?)/i;

  function indicationSection(pages) {
    const rows = pages.flatMap(page => String(page.text || '').split(/\n+/).map(text => ({ pageNumber: page.pageNumber, text: normalizeText(text) })));
    const start = rows.findIndex(row => INDICATION_HEADING.test(row.text));
    if (start < 0) return { text: '', page: 0 };
    const first = rows[start].text.match(INDICATION_HEADING)?.[1] || '';
    const content = first ? [first] : [];
    for (let index = start + 1; index < rows.length; index++) {
      const line = rows[index].text;
      if (!line) continue;
      if (NEXT_SECTION.test(line) && content.join(' ').length >= 20) break;
      content.push(line);
      if (content.join(' ').length >= 12000) break;
    }
    return {
      text: content.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      page: rows[start].pageNumber,
    };
  }

  function indicationHints(text) {
    const markerPatterns = [
      ['PD-L1', /PD\s*-?\s*L1/i], ['HER2', /HER\s*-?\s*2/i], ['EGFR', /\bEGFR\b/i],
      ['ALK', /\bALK\b/i], ['ROS1', /\bROS\s*-?\s*1\b/i], ['BRAF', /\bBRAF\b/i],
      ['BRCA', /\bBRCA\s*1?\/?2?\b/i], ['KRAS', /\bKRAS\b/i], ['NTRK', /\bNTRK\b/i],
      ['MSI-H／dMMR', /MSI\s*-?\s*H|dMMR|錯配修復/i],
    ];
    const settingPatterns = [
      ['術前', /術前|新輔助/u], ['術後／輔助', /術後|輔助治療/u], ['第一線', /第一線|一線治療/u],
      ['後線', /第二線|第三線|後線|先前治療/u], ['局部晚期', /局部晚期/u], ['復發／轉移', /復發|轉移/u],
    ];
    return {
      biomarker: markerPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label).join('、'),
      lineSetting: settingPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label).join('、'),
    };
  }

  function parsePages(pages, cards, options = {}) {
    const allLines = pages.flatMap(page => String(page.text || '').split(/\n+/)).map(normalizeText).filter(Boolean);
    const joined = pages.map(page => page.text || '').join('\n');
    const indication = indicationSection(pages);
    const genericName = ingredientName(allLines);
    const brandName = fieldValue(allLines, ['中文品名', '英文品名', '品名', 'Product name']);
    const fallbackName = cleanDrugName(options.documentTitle || '');
    const matchedCards = indication.text && globalThis.NHI_PARSER
      ? globalThis.NHI_PARSER.matchCancerCards(indication.text, cards || [])
      : [];
    const cancerIds = [...new Set(matchedCards.map(card => card.id))];
    const hints = indicationHints(indication.text);
    const permit = permitNumber(joined);
    const resolvedName = genericName || fallbackName || brandName;
    const missing = [];
    if (!permit) missing.push('許可證字號');
    if (!genericName) missing.push('學名／有效成分');
    if (!indication.text) missing.push('適應症章節');
    if (!cancerIds.length) missing.push('對應癌別');
    const candidate = indication.text && resolvedName ? {
      genericName: resolvedName,
      brandName: brandName && brandName !== resolvedName ? brandName : '',
      aliases: [brandName, fallbackName].filter(value => value && value !== resolvedName),
      permitNumber: permit,
      cancerIds,
      indication: indication.text,
      biomarker: hints.biomarker,
      lineSetting: hints.lineSetting,
      approvalDate: approvalDate(joined),
      sourcePage: indication.page,
      autoExtracted: true,
      extractionStatus: missing.length ? 'review_needed' : 'auto_extracted',
      reviewItems: missing,
    } : null;
    return {
      candidate,
      permitNumber: permit,
      indicationPage: indication.page,
      warnings: missing,
    };
  }

  async function loadPdfJs(moduleUrl, workerUrl) {
    if (!pdfJsPromise) {
      pdfJsPromise = import(moduleUrl).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }

  async function pageText(page) {
    const content = await page.getTextContent();
    let output = '';
    let lastY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5];
      const newLine = lastY != null && y != null && Math.abs(y - lastY) > 2;
      if (newLine && output && !output.endsWith('\n')) output += '\n';
      else if (output && !output.endsWith('\n') && /[a-z0-9)]$/i.test(output) && /^[a-z0-9(]/i.test(item.str)) output += ' ';
      output += item.str;
      if (item.hasEOL) output += '\n';
      if (y != null) lastY = y;
    }
    return normalizeText(output);
  }

  async function extractAndParse(blob, cards, options = {}) {
    const pdfjs = await loadPdfJs(options.moduleUrl || './vendor/pdf.min.mjs', options.workerUrl || './vendor/pdf.worker.min.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
    const pdf = await task.promise;
    const pages = [];
    let lowTextPages = 0;
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        options.onProgress?.({ pageNumber, pageCount: pdf.numPages });
        const page = await pdf.getPage(pageNumber);
        const text = await pageText(page);
        if (text.replace(/\s/g, '').length < 30) lowTextPages++;
        pages.push({ pageNumber, text });
        page.cleanup();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return {
        ...parsePages(pages, cards, options),
        pageCount: pdf.numPages,
        lowTextPages,
      };
    } finally {
      await pdf.destroy();
    }
  }

  globalThis.TFDA_PARSER = Object.freeze({
    isTfdaDocument,
    normalizeText,
    permitNumber,
    approvalDate,
    indicationSection,
    parsePages,
    extractAndParse,
  });
})();
