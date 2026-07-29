(function () {
  // 別名需涵蓋健保條文實際使用的臨床詞彙（多為組織型或舊譯名），
  // 否則像「肺腺癌」「泌尿道上皮癌」這類寫法會完全對不到癌別卡片。
  const CANCER_ALIASES = {
    breast_cancer: ['乳癌', '乳房癌'],
    nsclc: ['非小細胞肺癌', '非小細胞肺腺癌', '肺腺癌', '肺鱗狀細胞癌', '非鱗狀非小細胞肺癌'],
    sclc: ['小細胞肺癌'],
    colorectal_cancer: ['大腸直腸癌', '結直腸癌', '大腸癌及直腸癌'],
    colon_cancer: ['結腸癌', '大腸癌'],
    rectal_cancer: ['直腸癌'],
    gastric_cancer: ['胃癌', '胃腺癌'],
    esophageal_cancer: ['食道癌', '食道胃接合處癌', '胃食道接合處腺癌', '食道鱗狀細胞癌', '食道腺癌'],
    pancreatic_cancer: ['胰臟癌', '胰腺癌'],
    biliary_tract_cancer: ['膽道癌', '膽管癌', '膽囊癌'],
    ampullary_adenocarcinoma: ['壺腹癌', '壺腹部腺癌'],
    hepatocellular_carcinoma: ['肝細胞癌', '肝癌'],
    renal_cell_carcinoma: ['腎細胞癌', '腎癌'],
    bladder_cancer: ['膀胱癌', '泌尿上皮癌', '泌尿道上皮癌', '尿路上皮癌'],
    renal_pelvis_ureter_cancer: ['腎盂輸尿管癌', '上泌尿道上皮癌'],
    prostate_cancer: ['前列腺癌', '攝護腺癌'],
    ovarian_cancer: ['卵巢癌'],
    cervical_cancer: ['子宮頸癌'],
    endometrial_cancer: ['子宮內膜癌'],
    melanoma: ['黑色素瘤', '惡性黑色素瘤'],
    soft_tissue_sarcoma: ['軟組織肉瘤'],
    lymphoma: ['淋巴瘤', '非何杰金氏淋巴瘤', '非霍奇金淋巴瘤'],
    b_cell_lymphomas: ['瀰漫性大B細胞淋巴瘤', '瀰漫性大型B細胞淋巴瘤', '瀰漫性大細胞B淋巴瘤', '濾泡性淋巴瘤', '被套細胞淋巴瘤', 'DLBCL'],
    hodgkin_lymphoma: ['何杰金氏淋巴瘤', '霍奇金淋巴瘤', '何杰金氏病'],
    t_cell_lymphomas: ['周邊T細胞淋巴瘤', 'T細胞淋巴瘤'],
    multiple_myeloma: ['多發性骨髓瘤', '多發性骨髓癌'],
    acute_myeloid_leukemia: ['急性骨髓性白血病', '急性骨髓芽球性白血病', '急性前骨髓性白血病', '急性前骨髓性細胞白血病', 'AML'],
    acute_lymphoblastic_leukemia: ['急性淋巴性白血病', '急性淋巴球性白血病', '急性淋巴芽細胞白血病', 'ALL'],
    chronic_myeloid_leukemia: ['慢性骨髓性白血病', '慢性骨髓球性白血病', 'CML'],
    cll: ['慢性淋巴性白血病', '慢性淋巴球性白血病', 'CLL'],
    mds: ['骨髓化生不良症候群', '骨髓增生不良症候群', '慢性骨髓單核細胞性白血病', 'MDS'],
    mpn: ['骨髓增生性腫瘤', '骨髓纖維化', '真性紅血球增多症', 'MPN'],
    gist: ['胃腸道基質瘤', '腸胃道間質瘤', '胃腸道間質瘤', '腸胃道基質瘤', 'GIST'],
    thyroid_cancer: ['甲狀腺癌', '甲狀腺髓質癌', '分化型甲狀腺癌'],
    brain_tumor: ['腦瘤', '腦腫瘤', '神經膠質瘤', '神經膠母細胞瘤', '多形神經膠母細胞瘤', '膠質母細胞瘤', '星狀細胞瘤', '星狀瘤', '寡樹突膠質細胞瘤'],
    head_neck_cancers: ['頭頸癌', '頭頸部癌', '頭頸部鱗狀細胞癌', '頭頸部鱗狀上皮細胞癌'],
    nasopharyngeal_cancer: ['鼻咽癌'],
    mesothelioma: ['間皮瘤', '惡性肋膜間皮瘤'],
    neuroendocrine_tumor: ['神經內分泌腫瘤', '神經內分泌瘤'],
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

  // 字面上互相包含、臨床上卻互斥的癌別名稱。
  // 例：「非小細胞肺癌」含有「小細胞肺癌」字樣，但不可因此把 NSCLC 條文掛到 SCLC。
  const CONFLICTING_SUPERSTRINGS = {
    '小細胞肺癌': ['非小細胞肺癌'],
    '何杰金氏淋巴瘤': ['非何杰金氏淋巴瘤'],
    '霍奇金淋巴瘤': ['非霍奇金淋巴瘤'],
    '何杰金氏病': ['非何杰金氏病'],
  };

  // 排除語意（「本項不適用於X」不應視為適用於 X）
  const NEGATION_CUE = /不適用|不得使用|不得用|不包括|不含|除外|排除|不予給付|非屬|不適合/;
  const POSTFIX_NEGATION_CUE = /^(?:(?:患者|病人|個案|之?治療)[，、,:：;； ]*)?(?:不適用|不得使用|不得用|不包括|不含|除外|排除|不予給付|非屬|不適合)/;
  const NEGATION_WINDOW = 24;

  function stripConflictingSuperstrings(text, term) {
    let output = text;
    for (const blocker of CONFLICTING_SUPERSTRINGS[term] || []) {
      output = output.split(blocker).join('　');
    }
    return output;
  }

  // 只有在「所有出現位置都落在排除語句內」時才視為未命中，避免過度刪除
  function allOccurrencesNegated(text, term) {
    let index = text.indexOf(term);
    if (index < 0) return false;
    while (index >= 0) {
      const before = text.slice(Math.max(0, index - NEGATION_WINDOW), index);
      const after = text.slice(index + term.length, index + term.length + NEGATION_WINDOW);
      if (!NEGATION_CUE.test(before) && !POSTFIX_NEGATION_CUE.test(after)) return false;
      index = text.indexOf(term, index + term.length);
    }
    return true;
  }

  function termIncluded(text, term) {
    const normalizedTerm = normalizeText(term).trim();
    if (!normalizedTerm) return false;
    if (/[\u3400-\u9fff]/.test(normalizedTerm)) {
      // 健保條文常在中文與英文縮寫間留空白（「瀰漫性大型 B 細胞淋巴瘤」），
      // 比對時兩邊都去掉空白才不會因排版差異而漏掉
      const compact = (value) => String(value).replace(/\s+/gu, '');
      const term = compact(normalizedTerm);
      const scoped = compact(stripConflictingSuperstrings(text, normalizedTerm));
      if (!scoped.includes(term)) return false;
      return !allOccurrencesNegated(scoped, term);
    }
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

  // 健保會用類別標題涵蓋多個藥品，例如
  //   9.69.免疫檢查點抑制劑(如 atezolizumab;nivolumab;pembrolizumab;…)
  // 標題本身留作顯示名稱，但個別藥名必須保留成別名，
  // 否則 NCCN 的 Pembrolizumab 永遠對不到任何健保條目。
  // 括號是否尚未閉合（用於判斷標題是否跨行）
  function unbalancedParens(value) {
    const text = String(value || '');
    const open = (text.match(/[（(]/gu) || []).length;
    const close = (text.match(/[)）]/gu) || []).length;
    return open > close;
  }

  function drugAliases(heading) {
    const text = normalizeText(heading);
    const names = new Set();
    for (const group of text.matchAll(/[（(]\s*(?:如|包含|包括)?\s*([^（()）]*)[)）]?/gu)) {
      for (const piece of String(group[1] || '').split(/[;；,，、\/]|\s+或\s+/u)) {
        const name = piece.replace(/製劑|成分|注射劑|口服劑型|等$/gu, '').replace(/[^A-Za-z0-9\- ]/g, ' ').trim();
        if (/^[A-Za-z][A-Za-z0-9\- ]{4,40}$/.test(name)) names.add(name);
      }
    }
    // 標題本身若就是英文學名，也一併納入
    const bare = cleanDrugLabel(text).replace(/[^A-Za-z0-9\- ]/g, ' ').trim();
    if (/^[A-Za-z][A-Za-z0-9\- ]{3,40}$/.test(bare)) names.add(bare);
    return [...names];
  }

  const CONTENT_LIMIT = 14000;
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
    const joined = groups.join('\n').trim();
    // 少數藥品（免疫治療等）的限制條件很長，尾端常是事前審查與線數限制。
    // 靜默截斷會讓使用者誤以為看到的是完整條文，因此明確標示並提示看原文。
    if (joined.length <= CONTENT_LIMIT) return joined;
    return joined.slice(0, CONTENT_LIMIT).trim() + '\n⚠ 條文過長已截斷，後續內容請開啟原始 PDF 核對。';
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
      current.aliases = drugAliases(current.heading);
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
          current = { section: heading[1], heading: heading[2], startPage: page.pageNumber, lastPage: page.pageNumber, lines: [], headingOpen: unbalancedParens(heading[2]) };
        } else if (current && current.headingOpen) {
          // 類別標題的藥名清單可能跨行（…avelumab; / ipilimumab 製劑)），
          // 未接完就把後續行併回標題，否則清單尾端的藥名會被當成內文而漏掉
          current.heading += line;
          current.headingOpen = unbalancedParens(current.heading);
          current.lastPage = page.pageNumber;
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
      // 舊判準只要出現「治療」或「使用」就算擷取成功，幾乎所有條目都會通過，
      // 使「尚待核對」形同虛設。改為必須同時具備適應症語句、限制語句與可辨識結構。
      const hasIndication = /適應症|限用於|限.{0,12}使用|用於治療|得使用於|給付/u.test(entry.content);
      const hasRestriction = /限|不得|需|應|事前審查|療程|線治療|第[一二三四]線|除外|條件|病情/u.test(entry.content);
      const hasStructure = /(?:^|\n)\s*(?:\d+[.、]|[（(]\d+[)）])/u.test(entry.content) || entry.content.length >= 60;
      const clear = matchedCards.length > 0 && hasIndication && hasRestriction && hasStructure;
      if (!matchedCards.length) {
        unmatched.push({ section: entry.section, label: entry.label, page: entry.startPage });
        continue;
      }
      for (const card of matchedCards) {
        candidates.push({
          cancerId: card.id,
          label: entry.label,
          aliases: entry.aliases || [],
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
