const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../backup-format.js');
const format = window.BACKUP_FORMAT;

test('plans PDF backups in bounded batches without dropping documents', () => {
  const documents = Array.from({ length: 12 }, (_, index) => ({ id: String(index), storageKey: 'pdf-' + index }));
  documents.push({ id: 'metadata-only', storageKey: null });
  const batches = format.planPdfBatches(documents, 5);
  assert.deepEqual(batches.map(batch => batch.length), [5, 5, 2]);
  assert.equal(batches.flat().length, 12);
});

test('distinguishes metadata, PDF batch, and legacy backup formats', () => {
  assert.equal(format.kind(format.metadataPayload({}, '2026-07-16T00:00:00Z')), 'metadata');
  assert.equal(format.kind(format.pdfBatchPayload([], 1, 2, '2026-07-16T00:00:00Z')), 'pdf-batch');
  assert.equal(format.kind({ version: 2 }), 'legacy-full');
  assert.equal(format.kind({ version: 1 }), 'legacy-metadata');
});
