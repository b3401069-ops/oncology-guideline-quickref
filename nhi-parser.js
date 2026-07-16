(function () {
  const CANCER_ALIASES = {
    breast_cancer: ['乳癌', '乳房癌'],
    nsclc: ['非小細胞肺癌', '非小細胞肺腺癌'],
    sclc: ['小細胞肺癌'],
    colorectal_cancer: ['大腸直腸癌', '結直腸癌'],
    colon_cancer: ['結腸癌', '大腸癌'],
    rectal_cancer: ['直腸癌'],
    gastric_cancer: ['胃癌'],
    esophageal_cancer: ['食道癌', '食道胃接合處癌'],
    pancreatic_cancer: ['胰臟癌', '胰腺癌'],
    biliary_tract_cancer: ['膽道癌', '膽管癌', '膽囊癌'],
    hepatocellular_carcinoma: ['肝細胞癌', '肝癌'],
    renal_cell_carcinoma: ['腎細胞癌', '腎癌'],
    bladder_cancer: ['膀胱癌', '泌尿上皮癌'],
    prostate_cancer: ['前列腺癌', '攝護腺癌'],
    ovarian_cancer: ['卵巢癌'],
    cervical_cancer: ['子宮頸癌'],
    endometrial_cancer: ['子宮內膜癌'],
    melanoma: ['黑色素瘤'],
    soft_tissue_sarcoma: ['軟組織肉瘤'],
    lymphoma: ['淋巴瘤'],
    multiple_myeloma: ['多發性骨髓瘤', '多發性骨髓癌'],
    acute_myeloid_leukemia: ['急性骨髓性白血病', 'AML'],
    acute_lymphoblastic_leukemia: ['急性淋巴性白血病', 'ALL'],
    chronic_myeloid_leukemia: ['慢性骨髓性白血病', 'CML'],
    cll: ['慢性淋巴性白血病', 'CLL'],
    mds: ['骨髓化生不良症候群', '骨髓增生不良症候群', 'MDS'],
    mpn: ['骨髓增生性腫瘤', 'MPN'],
    gist: ['胃腸道基質瘤', 'GIST'],
    thyroid_cancer: ['甲狀腺癌'],
    brain_tumor: ['腦瘤', '腦腫瘤', '神經膠質瘤'],
    mesothelioma: ['間皮瘤'],
    neuroendocrine_tumor: ['神經內分泌腫瘤'],
    thymic_tumor: ['胸腺瘤', '胸腺癌'],
    testicular_cancer: ['睪丸癌'],
    penile_cancer: ['陰莖癌'],
    vulvar_cancer: ['外陰癌'],
    vaginal_cancer: ['陰道癌'],
  };

  const PARENT_CANCER_IDS = {
    colon_cancer: ['colorectal_cancer'],
    rectal_cancer: ['colorectal_cancer'],
  };

  function expandMatchedCards(matchedCards, cards) {
    const ids = new Set(matchedCards.map(card => card.id));
    matchedCards.forEach(card => (PARENT_CANCER_IDS[card.id] || []).forEach(id => ids.add(id)));
    const cardsById = new Map(cards.map(card => [card.id, card]));
    return [...ids].map(id => cardsById.get(id)).filter(Boolean);
  }

  const CONDITION_HINTS = [
    ['PD-L1', /PD\s*-?\s*L1/i], ['HER2', /HER\s*-?\s*2/i], ['EGFR', /\bEGFR\b/i],
    ['ALK', /\bALK\b/i], ['ROS1', /\bROS\s*-?\s*1\b/i], ['BRAF', /\bBRAF\b/i],
    ['BRCA', /\bBRCA\s*1?\/?2?\b/i], ['KRAS', /\bKRAS\b/i], ['NTRK', /\bNTRK\b/i],
    ['MSI／dMMR', /\bMSI\b|dMMR|錯配修復/i], ['治療線別', /第一線|第二線|第三線|先前治療|治療失敗/],
    ['病期／轉移', /晚期|局部晚期|轉移性|復發/], ['事前審查', /事前審查|事前申請/],
  ];

  let pdfJsPromise;

  function isNhiDocument(doc) {
    return /健保|給付|nhi|第\s*9\s*節|抗癌瘤藥物|dl-\d+-[a-f0-9-]{16,}/i.test(
      [doc?.source, doc?.title, doc?.fileName].filter(Boolean).join(' ')
    );
  }

  function normalizeText(value) {
    let text = String(value || '')
      .normalize('NFKC')
      .replace(/[\u0000\uf9fa]/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/第\s*9\s*節\s*-\s*\d+/g, '');
    for (let i = 0; i < 3; i++) {
      text = text.replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, '$1$2');
    }
    return text;
  }

  function isoDate(year, month, day) {
    let fullYear = Number(year);
    if (fullYear < 1911) fullYear += 1911;
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(fullYear, monthNumber - 1, dayNumber));
    if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() + 1 !== monthNumber || date.getUTCDate() !== dayNumber) return '';
    return String(fullYear).padStart(4, '0') + '-' + String(monthNumber).padStart(2, '0') + '-' + String(dayNumber).padStart(2, '0');
  }

  function firstDocumentDate(value) {
    const text = normalizeText(value);
    const compactRoc = text.match(/(?:^|\D)(1\d{2})(0[1-9]|1[0-2])([0-3]\d)(?=\D|$)/);
    if (compactRoc) return isoDate(compactRoc[1], compactRoc[2], compactRoc[3]);
    const separated = text.match(/(?:^|\D)(20\d{2}|1\d{2})\s*[年.\/-]\s*(\d{1,2})\s*[月.\/-]\s*(\d{1,2})/);
    return separated ? isoDate(separated[1], separated[2], separated[3]) : '';
  }

  function detectDocumentDates(value) {
    const text = normalizeText(value);
    const tagged = (pattern) => {
      const match = text.match(pattern);
      return match ? firstDocumentDate(match[0]) : '';
    };
    const publishedDate = tagged(/(?:公告|發布|修訂)(?:日期)?[:：]?[^\n]{0,30}/) || firstDocumentDate(text.split('\n')[0] || '');
    const effectiveDate = tagged(/(?:生效|施行)(?:日期)?[:：]?[^\n]{0,30}/) || publishedDate;
    return { publishedDate, effectiveDate, documentDate: effectiveDate || publishedDate };
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function termIncluded(text, term) {
    const normalizedTerm = normalizeText(term).trim();
    if (!normalizedTerm) return false;
    if (/[\u3400-\u9fff]/.test(normalizedTerm)) return text.includes(normalizedTerm);
    if (normalizedTerm.length < 3) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, 'i').test(text);
  }

  function cancerTerms(card) {
    const terms = [card.zhName, ...(CANCER_ALIASES[card.id] || [])];
    if (card.enName && /cancer|tumou?r|carcinoma|leukemia|lymphoma|myeloma|sarcoma|melanoma|neoplasm/i.test(card.enName)) {
      terms.push(card.enName);
    }
    return [...new Set(terms.filter(Boolean))];
  }

  function matchCancerCards(text, cards) {
    const normalized = normalizeText(text);
    return cards
      .map(card => {
        const matchedTerms = cancerTerms(card).filter(term => termIncluded(normalized, term));
        return { card, score: matchedTerms.reduce((max, term) => Math.max(max, normalizeText(term).length), 0) };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.card.zhName.localeCompare(b.card.zhName, 'zh-Hant'))
      .slice(0, 12)
      .map(item => item.card);
  }

  function cleanDrugLabel(heading) {
    return normalizeText(heading)
      .replace(/[（(]\s*\d{2,3}\s*\/.*$/u, '')
      .replace(/[（(]\s*如[\s\S]*$/u, '')
      .replace(/[：:].*$/u, '')
      .replace(/附表.*$/u, '')
      .replace(/\s+/g, ' ')
      .replace(/[，、；;]+$/u, '')
      .trim();
  }

  function formatRestrictions(lines) {
    const cleaned = lines
      .map(line => normalizeText(line).trim())
      .filter(line => line && !/^第9節(?:抗癌瘤藥物|\s*-)/.test(line) && !/^Antineoplastics drugs$/i.test(line));
    const groups = [];
    for (const line of cleaned) {
      const startsItem = /^(?:\d+[.、]|[（(]\d+[)）]|備註|註[:：]|限\b|需\b)/u.test(line);
      if (!groups.length || startsItem) groups.push(line);
      else groups[groups.length - 1] += (/[a-z0-9)]$/i.test(groups[groups.length - 1]) && /^[a-z0-9(]/i.test(line) ? ' ' : '') + line;
    }
    return groups.join('\n').slice(0, 14000).trim();
  }

  function conditionHints(text) {
    return CONDITION_HINTS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  }

  function parsePages(pages, cards) {
    const entries = [];
    let current = null;
    const closeCurrent = () => {
      if (!current) return;
      current.content = formatRestrictions(current.lines);
      current.label = cleanDrugLabel(current.heading);
      current.endPage = current.lastPage;
      if (current.label && !/刪除/.test(current.heading) && current.content.length >= 20) entries.push(current);
      current = null;
    };

    for (const page of pages) {
      for (const rawLine of page.text.split(/\n+/)) {
        const line = normalizeText(rawLine).trim();
        if (!line || /^第9節\s*-?\s*\d*$/.test(line)) continue;
        const heading = line.match(/^(9\.\d+(?:\.\d+){0,3})\.\s*(.+)$/);
        if (heading) {
          closeCurrent();
          current = { section: heading[1], heading: heading[2], startPage: page.pageNumber, lastPage: page.pageNumber, lines: [] };
        } else if (current) {
          current.lines.push(line);
          current.lastPage = page.pageNumber;
        }
      }
    }
    closeCurrent();

    const candidates = [];
    const unmatched = [];
    for (const entry of entries) {
      const directMatches = matchCancerCards(`${entry.heading}\n${entry.content}`, cards);
      const matchedCards = expandMatchedCards(directMatches, cards);
      const hints = conditionHints(entry.content);
      const clear = matchedCards.length > 0 && /限|給付|治療|使用|適應症|病患|患者/u.test(entry.content);
      if (!matchedCards.length) {
        unmatched.push({ section: entry.section, label: entry.label, page: entry.startPage });
        continue;
      }
      for (const card of matchedCards) {
        candidates.push({
          cancerId: card.id,
          label: entry.label,
          content: entry.content,
          coverageStatus: clear ? 'related_with_restrictions' : 'verification_needed',
          extractionStatus: clear ? 'auto_extracted' : 'review_needed',
          conditionHints: hints,
          sourceSection: entry.section,
          sourcePageStart: entry.startPage,
          sourcePageEnd: entry.endPage,
        });
      }
    }
    return { entries, candidates, unmatched };
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
    const data = new Uint8Array(await blob.arrayBuffer());
    const task = pdfjs.getDocument({ data, isEvalSupported: false });
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
      const parsed = parsePages(pages, cards);
      const joined = pages.map(page => page.text).join('\n');
      const dates = detectDocumentDates(String(options.documentTitle || '') + '\n' + joined.slice(0, 10000));
      return {
        ...parsed,
        ...dates,
        pageCount: pdf.numPages,
        lowTextPages,
        scope: /第\s*9\s*節|抗癌瘤藥物/i.test(joined) ? 'nhi-section-9' : 'nhi-' + String(options.documentTitle || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      };
    } finally {
      await pdf.destroy();
    }
  }

  window.NHI_PARSER = { isNhiDocument, normalizeText, detectDocumentDates, matchCancerCards, parsePages, extractAndParse };
})();
