(() => {
  'use strict';

  const VERSION = 4;
  const PDF_BATCH_SIZE = 5;

  function documentPdfKeys(stores) {
    return [...new Set((stores?.documents || []).map(doc => doc?.storageKey).filter(Boolean))].sort();
  }

  function metadataPayload(stores, exportedAt, options = {}) {
    const pdfKeys = documentPdfKeys(stores);
    const storeCounts = Object.fromEntries(
      Object.entries(stores || {}).map(([name, items]) => [name, Array.isArray(items) ? items.length : 0])
    );
    return {
      version: VERSION,
      kind: 'metadata',
      exportedAt,
      backupSetId: options.backupSetId || '',
      manifest: {
        storeCounts,
        pdfCount: pdfKeys.length,
        pdfKeys,
        pdfBatchSize: PDF_BATCH_SIZE,
        pdfBatchCount: Math.ceil(pdfKeys.length / PDF_BATCH_SIZE),
      },
      ...stores,
    };
  }

  function planPdfBatches(documents, batchSize = PDF_BATCH_SIZE) {
    const eligible = (documents || []).filter(doc => doc?.storageKey);
    const batches = [];
    for (let index = 0; index < eligible.length; index += batchSize) batches.push(eligible.slice(index, index + batchSize));
    return batches;
  }

  function pdfBatchPayload(pdfs, batchIndex, batchCount, exportedAt, options = {}) {
    return {
      version: VERSION,
      kind: 'pdf-batch',
      exportedAt,
      backupSetId: options.backupSetId || '',
      batchIndex,
      batchCount,
      pdfs,
    };
  }

  function kind(data) {
    if (data?.version === VERSION) return data.kind || 'unknown';
    if (data?.version === 3 && data?.kind === 'metadata') return 'metadata-v3';
    if (data?.version === 3 && data?.kind === 'pdf-batch') return 'pdf-batch-v3';
    if (data?.version === 2) return 'legacy-full';
    if (data?.version === 1) return 'legacy-metadata';
    return 'unknown';
  }

  function batchProgress(batchCount, restoredIndexes) {
    const count = Math.max(0, Number(batchCount) || 0);
    const restored = [...new Set((restoredIndexes || []).map(Number).filter(index => index >= 1 && index <= count))].sort((a, b) => a - b);
    const missing = Array.from({ length: count }, (_, index) => index + 1).filter(index => !restored.includes(index));
    return { batchCount: count, restored, missing, complete: count > 0 && missing.length === 0 };
  }

  globalThis.BACKUP_FORMAT = Object.freeze({
    version: VERSION,
    pdfBatchSize: PDF_BATCH_SIZE,
    metadataPayload,
    planPdfBatches,
    pdfBatchPayload,
    kind,
    batchProgress,
  });
})();
