(() => {
  'use strict';

  const VERSION = 3;
  const PDF_BATCH_SIZE = 5;

  function metadataPayload(stores, exportedAt) {
    return { version: VERSION, kind: 'metadata', exportedAt, ...stores };
  }

  function planPdfBatches(documents, batchSize = PDF_BATCH_SIZE) {
    const eligible = (documents || []).filter(doc => doc?.storageKey);
    const batches = [];
    for (let index = 0; index < eligible.length; index += batchSize) batches.push(eligible.slice(index, index + batchSize));
    return batches;
  }

  function pdfBatchPayload(pdfs, batchIndex, batchCount, exportedAt) {
    return { version: VERSION, kind: 'pdf-batch', exportedAt, batchIndex, batchCount, pdfs };
  }

  function kind(data) {
    if (data?.version === VERSION) return data.kind || 'unknown';
    if (data?.version === 2) return 'legacy-full';
    if (data?.version === 1) return 'legacy-metadata';
    return 'unknown';
  }

  window.BACKUP_FORMAT = Object.freeze({ version: VERSION, pdfBatchSize: PDF_BATCH_SIZE, metadataPayload, planPdfBatches, pdfBatchPayload, kind });
})();
