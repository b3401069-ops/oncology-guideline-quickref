(() => {
  'use strict';

  const active = item => item?.archived !== true && item?.current !== false;
  const unique = values => [...new Set((values || []).filter(Boolean))];
  const optionLabel = option => typeof option === 'string' ? option : String(option?.label || '').trim();
  const GENERIC_SYSTEMIC_OPTION = /^(?:systemic therapy|chemotherapy|immunotherapy|targeted therapy|endocrine therapy|hormonal therapy|clinical trial|observation|best supportive care|supportive care|no adjuvant therapy|consider adjuvant chemotherapy|adjuvant chemotherapy|radiation therapy|rt|adt)$/i;

  function auditCancerCoverage(cards, documents, scenarios = [], minimumSchemaVersion = 5) {
    const currentDocs = (documents || []).filter(active);
    const results = (cards || []).map(card => {
      const docs = currentDocs.filter(doc => (doc.cancerIds || []).includes(card.id));
      const parsed = docs.filter(doc =>
        Number(doc.nccnStructure?.schemaVersion || 0) >= minimumSchemaVersion &&
        Array.isArray(doc.nccnStructure?.treatmentPages)
      );
      const pages = parsed.flatMap(doc => doc.nccnStructure.treatmentPages || []);
      const options = pages.flatMap(page => page.options || []);
      const modalities = unique(options.map(option => typeof option === 'string' ? '' : option?.modality));
      const standardScenarios = (scenarios || []).filter(scenario => scenario.cancerId === card.id);
      const status = !docs.length ? 'missing_pdf'
        : !parsed.length ? 'unparsed'
          : !options.length ? 'no_treatment_options' : 'ready';
      return {
        card,
        status,
        documentCount: docs.length,
        parsedDocumentCount: parsed.length,
        treatmentPageCount: pages.length,
        optionCount: options.length,
        modalities,
        scenarioCount: standardScenarios.length,
      };
    });
    return {
      total: results.length,
      ready: results.filter(item => item.status === 'ready').length,
      withScenarios: results.filter(item => item.scenarioCount > 0).length,
      results,
      attention: results.filter(item => item.status !== 'ready'),
      withoutScenarios: results.filter(item => item.status === 'ready' && item.scenarioCount === 0),
    };
  }

  function auditReviewQueue(nhiNotes, tfdaRecords, documents) {
    const items = [];
    for (const doc of (documents || []).filter(active)) {
      if (doc.nhiParseError) items.push({
        type: 'nhi_document', id: doc.id, title: doc.title || doc.fileName || '健保 PDF',
        reasons: [doc.nhiParseError.message || '健保 PDF 解析失敗'], sourceDocumentId: doc.id,
      });
      if (doc.tfdaParseError) items.push({
        type: 'tfda_document', id: doc.id, title: doc.title || doc.fileName || 'TFDA 仿單',
        reasons: [doc.tfdaParseError.message || 'TFDA 仿單解析失敗'], sourceDocumentId: doc.id,
      });
    }
    for (const note of (nhiNotes || []).filter(active)) {
      const reasons = [];
      if (note.extractionStatus === 'review_needed') reasons.push(...(note.reviewItems || ['自動擷取結果待核對']));
      if (note.truncated) reasons.push('條文擷取可能被截斷');
      if (note.autoExtracted && !note.cancerId) reasons.push('未對應癌別');
      if (note.autoExtracted && !String(note.label || '').trim()) reasons.push('缺少藥物／療程名稱');
      if (reasons.length) items.push({
        type: 'nhi_record', id: note.id, title: note.label || '未命名健保條文',
        reasons: unique(reasons), sourceDocumentId: note.sourceDocumentId || '', cancerId: note.cancerId || '',
      });
    }
    for (const record of (tfdaRecords || []).filter(active)) {
      const reasons = [];
      if (record.extractionStatus === 'review_needed') reasons.push(...(record.reviewItems || ['自動擷取結果待核對']));
      if (record.autoExtracted && !(record.cancerIds || []).length) reasons.push('未對應癌別');
      if (record.autoExtracted && !record.permitNumber) reasons.push('缺少許可證字號');
      if (record.autoExtracted && !record.sourceDocumentId && !record.sourceUrl) reasons.push('未連結核定仿單來源');
      if (reasons.length) items.push({
        type: 'tfda_record', id: record.id, title: record.genericName || record.brandName || '未命名 TFDA 紀錄',
        reasons: unique(reasons), sourceDocumentId: record.sourceDocumentId || '', cancerIds: record.cancerIds || [],
      });
    }
    const priority = { tfda_document: 0, nhi_document: 0, tfda_record: 1, nhi_record: 1 };
    items.sort((left, right) => (priority[left.type] ?? 9) - (priority[right.type] ?? 9) || left.title.localeCompare(right.title));
    return {
      total: items.length,
      documents: items.filter(item => item.type.endsWith('_document')).length,
      tfda: items.filter(item => item.type.startsWith('tfda_')).length,
      nhi: items.filter(item => item.type.startsWith('nhi_')).length,
      items,
    };
  }

  function nhiMatchLevel(label, cancerId, notes) {
    if (!globalThis.NHI_SELECTOR || !globalThis.NHI_VERSIONING) return 'none';
    const groups = globalThis.NHI_SELECTOR.groupTreatments(
      globalThis.NHI_SELECTOR.notesForCancer(notes || [], cancerId).map(n => ({ n }))
    );
    const key = globalThis.NHI_SELECTOR.normalizeTreatmentName(label);
    return globalThis.NHI_SELECTOR.strongestMatchLevel(groups.flatMap(group => [
      globalThis.NHI_SELECTOR.treatmentMatchLevel(key, group.key),
      ...(group.aliasKeys || []).map(alias => globalThis.NHI_SELECTOR.treatmentMatchLevel(key, alias)),
    ]));
  }

  function auditTreatmentCoverage(documents, tfdaRecords, nhiNotes) {
    const byKey = new Map();
    for (const doc of (documents || []).filter(active)) {
      for (const page of doc.nccnStructure?.treatmentPages || []) {
        for (const option of page.options || []) {
          if (typeof option === 'string' || option?.modality !== 'systemic') continue;
          const label = optionLabel(option);
          if (!label || GENERIC_SYSTEMIC_OPTION.test(label.trim())) continue;
          if (globalThis.DRUG_VOCABULARY?.isIgnored(label)) continue;
          const cancerIds = unique(doc.cancerIds || []);
          const normalized = globalThis.DRUG_VOCABULARY?.canonicalName(label) || label.toLowerCase();
          const key = cancerIds.slice().sort().join(',') + ':' + normalized;
          if (!byKey.has(key)) byKey.set(key, {
            label, cancerIds, sourceDocumentId: doc.id || '', documentTitle: doc.title || doc.fileName || '',
            page: Number(page.page) || 0, sectionCode: page.sectionCode || '', occurrences: 0,
          });
          byKey.get(key).occurrences += 1;
        }
      }
    }

    const items = [...byKey.values()].map(item => {
      const components = globalThis.DRUG_VOCABULARY?.components(item.label) || [];
      const tfdaMatches = unique(item.cancerIds.flatMap(cancerId =>
        (globalThis.TFDA_REGISTRY?.match(tfdaRecords || [], item.label, [cancerId]) || []).map(match => match.record.id)
      ));
      const nhiLevels = item.cancerIds.map(cancerId => nhiMatchLevel(item.label, cancerId, nhiNotes));
      const nhiLevel = globalThis.NHI_SELECTOR?.strongestMatchLevel(nhiLevels) || 'none';
      const linked = tfdaMatches.length > 0 || nhiLevel !== 'none';
      return {
        ...item,
        components,
        tfdaMatchCount: tfdaMatches.length,
        nhiMatchLevel: nhiLevel,
        status: linked ? 'linked' : components.length ? 'vocabulary_only' : 'unmapped',
      };
    });
    const rank = { unmapped: 0, vocabulary_only: 1, linked: 2 };
    items.sort((left, right) => rank[left.status] - rank[right.status] || left.label.localeCompare(right.label));
    return {
      total: items.length,
      linked: items.filter(item => item.status === 'linked').length,
      vocabularyOnly: items.filter(item => item.status === 'vocabulary_only').length,
      unmapped: items.filter(item => item.status === 'unmapped').length,
      items,
      attention: items.filter(item => item.status !== 'linked'),
    };
  }

  globalThis.QUALITY_AUDIT = Object.freeze({
    auditCancerCoverage,
    auditReviewQueue,
    auditTreatmentCoverage,
  });
})();
