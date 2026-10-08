(function () {
  'use strict';
  const workflow = typeof module !== 'undefined' && module.exports ? require('./case-workflow.js') : window.CASE_WORKFLOW;
  const branchEvidence = typeof module !== 'undefined' && module.exports ? require('./branch-evidence.js') : window.BRANCH_EVIDENCE;
  const text = value => String(value ?? '').trim();
  const pageKey = ({ doc, page }) => JSON.stringify([
    doc?.id || doc?.storageKey || doc?.title || '',
    doc?.nccnStructure?.version || doc?.version || '', page?.sectionCode || '', page?.page || '',
  ]);
  const uniquePages = pairs => [...new Map(pairs.filter(item => item?.page).map(item => [pageKey(item), item]).reverse()).values()].reverse();
  const LIMITS = Object.freeze({ pages: 12, pageChars: 16000, totalChars: 60000, packetBytes: 480000 });
  const ROLES = ['primary', 'regimen', 'candidate', 'footnotes', 'eligibility'];
  const packetBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

  function phaseExclusion(page, context) {
    // Only explicit page headings, not incidental words in footnotes, exclude a page.
    const title = text(page.title);
    if (context.phase === 'postoperative' && /\b(?:METASTATIC|STAGE IV|RECURRENT)\b/i.test(title) && !/\bADJUVANT\b/i.test(title)) return '本次為術後情境，此頁標題為復發／轉移治療。';
    if (context.phase !== 'followup' && /^(?:SURVEILLANCE|FOLLOW[ -]?UP)(?:\s|$)/i.test(title)) return '此頁為追蹤流程，不是本次治療決策頁。';
    return '';
  }

  function planEvidence(sourcePages, displayedMatches, assessment) {
    const entries = new Map(), blockers = [], deferred = [];
    const primary = new Set((assessment.pages || []).map(pageKey));
    const catalog = doc => uniquePages([
      ...(doc.nccnStructure?.treatmentPages || []).map(page => ({ doc, page })),
      ...(doc.nccnStructure?.sections || []).filter(page => !page.updatePage && !page.navigationPage && (!page.supportingPage || page.sourceContext?.footnotesFor?.length))
        .map(page => ({ doc, page: { ...page, sectionCode: page.code || page.sectionCode, sectionPart: page.part || page.sectionPart } })),
    ]);
    const add = (pair, role, reason) => {
      const key = pageKey(pair);
      if (!entries.has(key)) {
        const canonical = catalog(pair.doc).find(item => pageKey(item) === key);
        const page = canonical?.page || pair.page;
        const isFootnotes = page.sourceContext?.footnotesFor?.length > 0;
        entries.set(key, { ...pair, page, role: isFootnotes ? 'footnotes' : role, selectionReasons: [isFootnotes ? `明確的連結腳註：${page.sourceContext.footnotesFor.join('、')}。` : reason], requiredKeys: [] });
      } else if (!entries.get(key).selectionReasons.includes(reason)) entries.get(key).selectionReasons.push(reason);
      return key;
    };
    for (const pair of uniquePages([...sourcePages, ...displayedMatches])) add(pair,
      primary.has(pageKey(pair)) ? 'primary' : pair.role==='eligibility' ? 'eligibility' : assessment.active ? 'regimen' : 'candidate',
      primary.has(pageKey(pair)) ? '由目前病程及已填條件定位的主決策頁。' : assessment.active ? '本次分支對應的支持／療程頁。' : `符合本次檢索條件：${(pair.reasons || []).join('、') || '候選頁，仍需核對適用分支'}。`);
    // Map iteration includes appended dependencies; keys make cycles finite.
    for (const entry of entries.values()) {
      const { doc, page } = entry;
      const pages = catalog(doc);
      const context = page.sourceContext;
      if (context?.version !== 2 || !context.textExtracted || !text(page.sourceText)) blockers.push(`${page.sectionCode} p.${page.page} 缺少已檢查的來源關係，請重新解析 PDF。`);
      const link = (target, kind, reason) => {
        const key = add(target, kind === 'eligibility' ? 'eligibility' : 'footnotes', reason);
        if (key !== pageKey(entry) && !entry.requiredKeys.includes(key)) entry.requiredKeys.push(key);
      };
      for (const target of pages.filter(item => item.page.sourceContext?.footnotesFor?.includes(page.sectionCode))) {
        link(target, 'footnotes', `${page.sectionCode} 明確標示的連結腳註。`);
      }
      for (const ref of context?.requiredReferences || []) {
        const targets = pages.filter(item => item.page.sectionCode === ref.code && (!ref.part || Number(item.page.sectionPart) === Number(ref.part)));
        if (targets.length !== 1) blockers.push(`${page.sectionCode} 所需 ${ref.code}${ref.part ? ` 第 ${ref.part} 部分` : ''} ${targets.length ? '無法唯一定位' : '缺少同一文件的來源頁'}；請核對原 PDF。`);
        else link(targets[0], ref.kind, `${page.sectionCode} 指向的必要${ref.kind === 'eligibility' ? '適用條件' : '腳註'}。`);
      }
      for (const ref of page.relatedReferences || page.nextSteps || []) deferred.push({ from: `${page.sectionCode} p.${page.page}`, code: ref.code, reason: '一般延伸連結；未自動視為本次治療適用證據。' });
    }
    return { evidencePages: [...entries.values()], evidenceBlockers: [...new Set(blockers)], deferred };
  }

  function inspectEvidencePacket(input) {
    const issues = [], audit = input?.evidenceAudit, evidence = input?.evidence;
    if (!audit || audit.version !== 1 || !Array.isArray(evidence)) return ['缺少可核對的選頁清單；請重新查詢。'];
    if (audit.status !== 'ready' || !Array.isArray(audit.blockers) || audit.blockers.length) issues.push(...(Array.isArray(audit.blockers) ? audit.blockers : []), '來源包尚未通過檢查。');
    if (!evidence.length || evidence.length > LIMITS.pages || audit.selectedPageCount !== evidence.length || audit.sentPageCount !== evidence.length) issues.push('來源頁數或傳送清單不完整。');
    const refs = new Set(evidence.map(item => item?.reference));
    if (refs.size !== evidence.length || !Array.isArray(audit.inventory) || audit.inventory.length !== evidence.length || new Set(audit.inventory).size !== refs.size || audit.inventory.some(ref => !refs.has(ref))) issues.push('來源清單不一致。');
    let chars = 0;
    for (const item of evidence) {
      const sourceText = text(item?.pageText); chars += sourceText.length;
      if (!sourceText || sourceText.length > LIMITS.pageChars || item.contextComplete !== true || item.truncated !== false || item.sourceContextVersion !== 2) issues.push('來源文字缺漏、過長或尚未重新解析。');
      if (!ROLES.includes(item.role) || !Array.isArray(item.selectionReasons) || !item.selectionReasons.length) issues.push('缺少來源用途或入選理由。');
      if (!Array.isArray(item.requiredReferences) || item.requiredReferences.some(ref => !refs.has(ref))) issues.push('必要連結來源未完整提供。');
      if (item.branch && (!['located','whole_page'].includes(item.branch.status) || !Array.isArray(item.branch.passages) ||
        (item.branch.status==='located' && (!item.branch.passages.length || item.branch.passages.some(p=>typeof p.text!=='string'||!p.text.trim()||!branchEvidence.validBox(p.box)))))) issues.push('頁內分支定位資料不完整。');
    }
    if (chars > LIMITS.totalChars || packetBytes(input) > LIMITS.packetBytes) issues.push('來源文字總量超過上限，請縮小本次問題。');
    return [...new Set(issues)];
  }
  // These versions are the local source set inspected for this implementation,
  // not a statement that they are the latest published guidelines.
  const REVIEWED_VERSIONS = { breast_cancer: '5.2026', nsclc: '6.2026', colon_cancer: '2.2026', rectal_cancer: '2.2026' };
  function groupFields(fields, context) {
    const entryKeys = ['base-disease-setting', 'base-treatment-setting', 'base-ecog'];
    const entry = entryKeys.flatMap(key => fields.filter(field => field.sourceTemplateKey === key));
    const rest = fields.filter(field => !entry.includes(field));
    const secondary = field => {
      const key = field.sourceTemplateKey || '';
      if (context.phase === 'postoperative') {
        if (['breast-advanced-alterations', 'breast-pdl1-cps'].includes(key)) return true;
        const path = text(fields.find(item => item.sourceTemplateKey === 'breast-surgery-path')?.value);
        if (path.includes('先手術') && /^breast-initial-/.test(key)) return true;
      }
      return key === 'breast-oncotype-rs' && fields.find(item => item.sourceTemplateKey === 'breast-genomic-assay')?.value !== 'Oncotype DX';
    };
    return { entry, relevant: rest.filter(field => !secondary(field)), secondary: rest.filter(secondary) };
  }

  function selectEvidence(cancerId, assessment, matches, context) {
    const sourcePages = uniquePages([...(assessment.pages || []), ...(assessment.supportingPages || [])]);
    const sourceKeys = new Set(sourcePages.map(pageKey));
    const conflicts = [...(context.conflicts || []), ...(assessment.conflicts || [])];
    const issues = [...conflicts];
    if (context.phase === 'unknown') issues.push('請先確認目前病程與治療階段，再定位本次問題。');
    if (assessment.active && !assessment.pages?.length) issues.push('缺少本次分支的 NCCN 主決策頁；目前只整理條件，不確認治療方向。');
    if (assessment.active && sourcePages.some(({ doc }) => {
      const version = text(doc?.nccnStructure?.version || doc?.version).match(/\b(\d+\.20\d{2})\b/)?.[1];
      return version !== REVIEWED_VERSIONS[cancerId];
    })) issues.push('來源版本尚未完成本分支核對；請核對原頁，不沿用舊版本規則結論。');
    const blocked = issues.length > 0 || assessment.status === 'missing' || assessment.status === 'conflict';
    const candidates = conflicts.length ? [] : assessment.active
      ? matches.filter(item => sourceKeys.has(pageKey(item))) : matches;
    const excludedPages = matches.filter(item => !candidates.includes(item)).map(item => ({ ...item, exclusionReason: conflicts.length ? '個案資料有矛盾。' : '不在本次規則分支的來源清單內。' }));
    const displayedMatches = candidates.filter(item => {
      let reason = assessment.active ? '' : phaseExclusion(item.page, context);
      const matcher = typeof window !== 'undefined' ? window.CLINICAL_MATCHER : null;
      // Exclude only complete recommendation lists whose every option conflicts.
      // A mixed algorithm page, or unknown marker, is not a negative result.
      if (!reason && !assessment.active && item.page.role === 'recommendation' && item.features?.length && item.page.options?.length && matcher) {
        const checks = item.page.options.map(option => matcher.optionAssessment(option, item.features));
        if (checks.every(check => check.blocked)) reason = '此療程頁所有已擷取選項均與已填條件衝突：' + [...new Set(checks.flatMap(check => check.conflicts))].join('、');
      }
      if (reason) excludedPages.push({ ...item, exclusionReason: reason });
      return !reason;
    });
    const treatmentEvidence = blocked ? [] : assessment.active
      ? (assessment.decision?.regimens || []).filter(item => item?.option && !item.option.needsReview && sourceKeys.has(pageKey(item))).map(({ doc, page, option }) => ({ doc, page: { ...page, options: [option] }, reasons: ['adjuvant'] }))
      : displayedMatches;
    const selectedSources = conflicts.length ? [] : sourcePages;
    return { sourcePages: selectedSources, displayedMatches, treatmentEvidence, blocked, issues, conflicts, excludedPages,
      ...planEvidence(selectedSources, displayedMatches, assessment) };
  }

  function buildPayload({ cancer, fields, assessment, context, selection, treatmentHistory, focus = 'overview' }) {
    const pairs = selection.evidencePages || [];
    const references = new Map(pairs.map((pair, index) => [pageKey(pair), `E${index + 1} | ${pair.doc?.nccnStructure?.version || pair.doc?.version || '版本未知'} | ${pair.page.sectionCode || 'NCCN'} · PDF p.${pair.page.page}`]));
    const blockers = [...(selection.evidenceBlockers || []), ...(selection.blocked ? selection.issues.length ? selection.issues : ['個案分支或必要資料尚未確認。'] : [])];
    if (!pairs.length) blockers.push('沒有可供本次判讀的來源頁。');
    if (pairs.length > LIMITS.pages) blockers.push(`選入 ${pairs.length} 頁，超過 ${LIMITS.pages} 頁數上限；請縮小病程／治療問題，不自動截頁。`);
    if (pairs.some(({ page }) => text(page.sourceText).length > LIMITS.pageChars) || pairs.reduce((sum, { page }) => sum + text(page.sourceText).length, 0) > LIMITS.totalChars) blockers.push('來源文字超過單頁或總量上限；請縮小本次問題，不自動截斷。');
    const evidence = pairs.map(({ doc, page, role, selectionReasons, requiredKeys }) => ({
      reference: references.get(pageKey({ doc, page })), role, selectionReasons,
      requiredReferences: (requiredKeys || []).map(key => references.get(key)), sourceContextVersion: page.sourceContext?.version || 0,
      conditionalReferences: page.sourceContext?.conditionalReferences || [],
      source: [doc?.title, doc?.nccnStructure?.version || doc?.version].filter(Boolean).join(' · '),
      version: doc?.nccnStructure?.version || doc?.version || '',
      branch: branchEvidence.locate({cancerId:cancer.id,fields,context,page,version:doc?.nccnStructure?.version || doc?.version || ''}),
      sectionCode: page.sectionCode, page: page.page, title: page.title || '',
      pageText: text(page.sourceText),
      contextComplete: page.sourceContext?.version === 2 && page.sourceContext?.textExtracted === true && !!text(page.sourceText),
      options: (page.options || []).map(option => typeof option === 'string'
        ? { label: option, sourceText: option, needsReview: true }
        : { label: option.label, sourceText: option.sourceText || option.label, context: option.context || '', group: option.group || '', recommendation: option.recommendation, needsReview: !!option.needsReview }),
      truncated: false,
    }));
    // Explicit allowlist: never send storage keys from PDF blobs, patient IDs,
    // or arbitrary treatment-history properties as case data.
    const payload = {
      schemaVersion: 3, cancer, context, focus,
      caseFields: fields.map(field => ({ key: field.sourceTemplateKey || field.id, label: field.label, value: Array.isArray(field.value) ? field.value : [field.value] })),
      treatmentHistory: (treatmentHistory || []).map(item => Object.fromEntries(
        ['phase', 'treatment', 'status', 'completedCycles', 'plannedCycles', 'stopReason', 'toxicity'].map(key => [key, item[key] ?? ''])
      )),
      deterministicAssessment: {
        branch: assessment.branchLabel || '', headline: assessment.decision?.headline || assessment.message || '',
        basis: assessment.decision?.basis || '', level: selection.blocked ? 'review' : assessment.decision?.level || 'review',
        reasons: assessment.decision?.items || [], missing: assessment.missing || [],
        caveats: assessment.decision?.caveats || [], reviewItems: [...(assessment.reviewItems || []), ...selection.issues],
        blocked: selection.blocked,
        regimens: selection.treatmentEvidence.flatMap(item => item.page.options || []).map(option => typeof option === 'string' ? option : option.label),
      },
      evidence,
      evidenceAudit: { version: 1, status: 'ready', selectedPageCount: pairs.length, sentPageCount: evidence.length,
        inventory: evidence.map(item => item.reference), blockers: [] },
      evidenceLimitations: ['僅檢查已辨識的來源關係與傳送完整性；不代表 PDF 箭頭、所有腳註或醫療適用性已獨立驗證。'],
    };
    if (packetBytes(payload) > LIMITS.packetBytes) blockers.push('來源文字封包超過傳送上限；請縮小本次問題。');
    if (blockers.length) {
      payload.evidence = [];
      payload.evidenceAudit = { ...payload.evidenceAudit, status: 'blocked', sentPageCount: 0, blockers: [...new Set(blockers)] };
      payload.evidenceLimitations.push(...payload.evidenceAudit.blockers);
    }
    payload.therapyChecks = workflow.fromPayload(payload);
    // Added branch/eligibility metadata counts towards the same transport budget.
    if (packetBytes(payload) > LIMITS.packetBytes) {
      payload.evidence=[];payload.evidenceAudit.status='blocked';payload.evidenceAudit.sentPageCount=0;
      payload.evidenceAudit.blockers.push('含分支／條件檢查的封包超過上限；請縮小本次問題。');
      payload.therapyChecks=workflow.fromPayload(payload);
    }
    return payload;
  }
  const api = Object.freeze({ pageKey, uniquePages, selectEvidence, buildPayload, groupFields, REVIEWED_VERSIONS, LIMITS, inspectEvidencePacket });
  if (typeof window !== 'undefined') window.CASE_REVIEW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
