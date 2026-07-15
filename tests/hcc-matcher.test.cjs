const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../clinical-matcher.js');
const matcher = window.CLINICAL_MATCHER;

const field = (label, value) => ({ label, value });
const systemicOption = label => ({ label, modality: 'systemic', recommendation: 'preferred' });

test('recognizes Stage IV and M1 free text as metastatic disease', () => {
  for (const value of ['Stage IV', 'stage 4B', 'cT3N1M1', '第四期']) {
    const features = matcher.extractClinicalFeatures([field('臨床／病理分期或風險分層', value)]);
    assert.ok(features.some(item => item.key === 'metastatic' && item.polarity === 'positive'), value);
  }
});

test('routes BCLC C to HCC systemic recommendations and excludes mixed HCC-CCA', () => {
  const pages = [
    {
      page: 17, sectionCode: 'HCC-C', role: 'principles', types: ['systemic'],
      title: 'Mixed HCC-CCA', keywords: ['metastatic'],
      options: [systemicOption('Therapy for metastatic mixed HCC-CCA')],
    },
    {
      page: 25, sectionCode: 'HCC-H', role: 'principles', types: ['radiation'],
      title: 'Radiation therapy', keywords: ['unresectable'],
      options: [{ label: 'RT for unresectable disease', modality: 'radiation', recommendation: 'review' }],
    },
    {
      page: 27, sectionCode: 'HCC-I', role: 'recommendation',
      title: 'Systemic therapy regimens', keywords: ['first-line'],
      options: [systemicOption('Atezolizumab + Bevacizumab')],
    },
  ];
  const doc = { title: 'Hepatocellular Carcinoma', nccnStructure: { treatmentPages: pages } };
  const matches = matcher.matchTreatmentPages([doc], [field('BCLC 分期', 'C')]);
  assert.equal(matches[0].page.sectionCode, 'HCC-I');
  assert.ok(matches.some(match => match.page.sectionCode === 'HCC-H'));
  assert.ok(!matches.some(match => match.page.sectionCode === 'HCC-C'));
});
