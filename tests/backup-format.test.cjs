const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../backup-format.js');
const format = global.BACKUP_FORMAT;

test('plans PDF backups in bounded batches without dropping documents', () => {
  const documents = Array.from({ length: 12 }, (_, index) => ({ id: String(index), storageKey: 'pdf-' + index }));
  documents.push({ id: 'metadata-only', storageKey: null });
  const batches = format.planPdfBatches(documents, 5);
  assert.deepEqual(batches.map(batch => batch.length), [5, 5, 2]);
  assert.equal(batches.flat().length, 12);
});

test('v4 metadata records one backup set and expected PDF completeness', () => {
  const data = format.metadataPayload({
    documents: [
      { id: 'a', storageKey: 'pdf-a' },
      { id: 'b', storageKey: 'pdf-b' },
      { id: 'c' },
    ],
    cancerCards: [{ id: 'cancer' }],
  }, '2026-07-17T00:00:00Z', { backupSetId: 'set-1' });
  assert.equal(data.version, 4);
  assert.equal(data.backupSetId, 'set-1');
  assert.equal(data.manifest.pdfCount, 2);
  assert.deepEqual(data.manifest.pdfKeys, ['pdf-a', 'pdf-b']);
  assert.equal(data.manifest.storeCounts.cancerCards, 1);
});

test('distinguishes current, v3, and legacy backup formats', () => {
  assert.equal(format.kind(format.metadataPayload({}, '2026-07-17T00:00:00Z')), 'metadata');
  assert.equal(format.kind(format.pdfBatchPayload([], 1, 2, '2026-07-17T00:00:00Z')), 'pdf-batch');
  assert.equal(format.kind({ version: 3, kind: 'metadata' }), 'metadata-v3');
  assert.equal(format.kind({ version: 3, kind: 'pdf-batch' }), 'pdf-batch-v3');
  assert.equal(format.kind({ version: 2 }), 'legacy-full');
  assert.equal(format.kind({ version: 1 }), 'legacy-metadata');
});

test('reports missing PDF batches without treating a partial restore as complete', () => {
  assert.deepEqual(format.batchProgress(4, [1, 3, 3]), {
    batchCount: 4,
    restored: [1, 3],
    missing: [2, 4],
    complete: false,
  });
  assert.equal(format.batchProgress(2, [1, 2]).complete, true);
});
