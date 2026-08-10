const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../drug-vocabulary.js');
require('../nhi-versioning.js');
require('../nhi-selector.js');
require('../tfda-registry.js');
require('../quality-audit.js');

const audit = global.QUALITY_AUDIT;

test('separates all-cancer data readiness from standard scenario coverage', () => {
  const cards = [{ id: 'breast_cancer', zhName: '乳癌' }, { id: 'rare_cancer', zhName: '罕見癌' }];
  const documents = [{
    id: 'breast', current: true, cancerIds: ['breast_cancer'],
    nccnStructure: { schemaVersion: 9, treatmentPages: [{ page: 10, options: [{ label: 'TCHP', modality: 'systemic' }] }] },
  }];
  const result = audit.auditCancerCoverage(cards, documents, [{ cancerId: 'breast_cancer' }]);
  assert.equal(result.ready, 1);
  assert.equal(result.withScenarios, 1);
  assert.equal(result.attention[0].status, 'missing_pdf');
});

test('review queue includes parse failures and incomplete auto-extracted records only', () => {
  const result = audit.auditReviewQueue(
    [{ id: 'n1', autoExtracted: true, current: true, extractionStatus: 'review_needed', reviewItems: ['限制條件'] }],
    [{ id: 't1', genericName: 'Drug A', autoExtracted: true, current: true, extractionStatus: 'review_needed', reviewItems: ['對應癌別'] }],
    [{ id: 'd1', current: true, title: 'TFDA label', tfdaParseError: { message: '掃描 PDF' } }],
  );
  assert.equal(result.total, 3);
  assert.equal(result.documents, 1);
  assert.equal(result.tfda, 2);
  assert.equal(result.nhi, 1);
});

test('treatment audit distinguishes linked, vocabulary-only, and unmapped labels', () => {
  const documents = [{
    id: 'doc', current: true, cancerIds: ['breast_cancer'],
    nccnStructure: { treatmentPages: [{ page: 20, sectionCode: 'BINV-M', options: [
      { label: 'TCHP', modality: 'systemic' },
      { label: 'Mystery-ABC regimen', modality: 'systemic' },
      { label: 'Pembrolizumab', modality: 'systemic' },
    ] }] },
  }];
  const tfda = [{ id: 'tfda-pembro', genericName: 'Pembrolizumab', indication: 'breast cancer', cancerIds: ['breast_cancer'], current: true }];
  const result = audit.auditTreatmentCoverage(documents, tfda, []);
  assert.equal(result.items.find(item => item.label === 'Pembrolizumab').status, 'linked');
  assert.equal(result.items.find(item => item.label === 'TCHP').status, 'vocabulary_only');
  assert.equal(result.items.find(item => item.label === 'Mystery-ABC regimen').status, 'unmapped');
});

test('treatment audit excludes labels explicitly marked as non-drug content', () => {
  global.DRUG_VOCABULARY.configure([{ term: 'Treatment heading only', kind: 'ignore' }]);
  try {
    const result = audit.auditTreatmentCoverage([{
      id: 'doc', current: true, cancerIds: ['breast_cancer'],
      nccnStructure: { treatmentPages: [{ page: 1, options: [
        { label: 'Treatment heading only', modality: 'systemic' },
        { label: 'Mystery drug', modality: 'systemic' },
      ] }] },
    }], [], []);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].label, 'Mystery drug');
  } finally {
    global.DRUG_VOCABULARY.configure();
  }
});
