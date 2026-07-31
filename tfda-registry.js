(() => {
  'use strict';

  const normalize = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function active(record) {
    return record && record.current !== false && !record.archived;
  }

  function recordNames(record) {
    return [...new Set([
      record?.genericName,
      record?.brandName,
      ...((record?.aliases || []).flatMap(value => String(value || '').split(/[\n,;；]/))),
    ].map(normalize).filter(value => value.length >= 3))];
  }

  function cancerMatches(record, cancerIds) {
    const expected = new Set(cancerIds || []);
    const actual = Array.isArray(record?.cancerIds) ? record.cancerIds : [];
    if (!expected.size || !actual.length) return false;
    return actual.some(id => expected.has(id));
  }

  function matchLevel(record, treatmentLabel) {
    const treatment = normalize(treatmentLabel);
    if (!treatment) return '';
    let best = '';
    for (const name of recordNames(record)) {
      if (treatment === name) return 'exact';
      if (treatment.includes(name)) best = 'ingredient';
    }
    return best;
  }

  function match(records, treatmentLabel, cancerIds = []) {
    const priority = { exact: 0, ingredient: 1 };
    return (records || [])
      .filter(active)
      .filter(record => cancerMatches(record, cancerIds))
      .map(record => ({ record, level: matchLevel(record, treatmentLabel) }))
      .filter(item => item.level)
      .sort((a, b) => priority[a.level] - priority[b.level] ||
        String(b.record.approvalDate || '').localeCompare(String(a.record.approvalDate || '')));
  }

  function cleanImportedRecord(record, index = 0) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const genericName = String(record.genericName || '').trim();
    const indication = String(record.indication || '').trim();
    if (!genericName || !indication) return null;
    return {
      id: String(record.id || `tfda-import-${Date.now()}-${index}`),
      genericName,
      brandName: String(record.brandName || '').trim(),
      aliases: Array.isArray(record.aliases)
        ? record.aliases.map(value => String(value || '').trim()).filter(Boolean)
        : String(record.aliases || '').split(/[\n,;；]/).map(value => value.trim()).filter(Boolean),
      permitNumber: String(record.permitNumber || '').trim(),
      cancerIds: Array.isArray(record.cancerIds) ? [...new Set(record.cancerIds.map(String).filter(Boolean))] : [],
      indication,
      biomarker: String(record.biomarker || '').trim(),
      lineSetting: String(record.lineSetting || '').trim(),
      approvalDate: String(record.approvalDate || '').trim(),
      sourceUrl: String(record.sourceUrl || '').trim(),
      sourceDocumentId: String(record.sourceDocumentId || '').trim(),
      sourcePage: Math.max(0, Number(record.sourcePage) || 0),
      current: record.current !== false,
      archived: !!record.archived,
      updatedAt: String(record.updatedAt || new Date().toISOString().split('T')[0]),
    };
  }

  function parseImport(data) {
    const input = Array.isArray(data) ? data : data?.tfdaIndications;
    if (!Array.isArray(input)) throw new Error('TFDA 匯入檔需為陣列或包含 tfdaIndications 陣列');
    const records = input.map(cleanImportedRecord).filter(Boolean);
    if (!records.length) throw new Error('沒有可匯入的 TFDA 適應症資料');
    return records;
  }

  function summarize(records) {
    const activeRecords = (records || []).filter(active);
    return {
      total: (records || []).length,
      active: activeRecords.length,
      cancers: new Set(activeRecords.flatMap(record => record.cancerIds || [])).size,
      undated: activeRecords.filter(record => !record.approvalDate).length,
      withoutSource: activeRecords.filter(record => !record.sourceUrl && !record.sourceDocumentId).length,
    };
  }

  globalThis.TFDA_REGISTRY = Object.freeze({
    normalize,
    active,
    match,
    parseImport,
    cleanImportedRecord,
    summarize,
    matchLevelLabels: Object.freeze({ exact: '同名藥物', ingredient: '療程成分' }),
  });
})();