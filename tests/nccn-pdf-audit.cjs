const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

global.DOMMatrix = class DOMMatrix {};
global.ImageData = class ImageData {};
global.Path2D = class Path2D {};
if (!Uint8Array.prototype.toHex) Uint8Array.prototype.toHex = function toHex() { return Buffer.from(this).toString('hex'); };
global.window = {};
require('../nccn-parser.js');
require('../clinical-matcher.js');
const parser = window.NCCN_PARSER;
const matcher = window.CLINICAL_MATCHER;

const pdfRoot = process.env.NCCN_PDF_DIR;
if (!pdfRoot) throw new Error('Set NCCN_PDF_DIR to the folder containing the NCCN PDFs.');

const cases = [
  ['HCC', 'Hepatocellular Carcinoma.pdf'],
  ['NSCLC', 'Non-Small Cell Lung Cancer.pdf'],
  ['SCLC', 'Small Cell Lung Cancer.pdf'],
  ['Breast', 'Breast Cancer.pdf'],
  ['Rectal', 'Rectal Cancer.pdf'],
  ['Prostate', 'Prostate Cancer.pdf'],
  ['NET', 'Neuroendocrine and Adrenal Tumors.pdf'],
];

async function main() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../vendor/pdf.min.mjs')).href;
  const workerUrl = pathToFileURL(path.resolve(__dirname, '../vendor/pdf.worker.min.mjs')).href;
  const results = new Map();
  for (const [name, file] of cases) {
    const fullPath = path.join(pdfRoot, file);
    assert.ok(fs.existsSync(fullPath), `Missing ${file}`);
    const result = await parser.extractAndParse(new Blob([fs.readFileSync(fullPath)]), { moduleUrl, workerUrl });
    assert.equal(result.schemaVersion, 7, `${name}: schema`);
    assert.ok(result.sections.length > 0, `${name}: sections`);
    assert.ok(result.treatmentPages.length > 0, `${name}: treatment pages`);
    assert.ok(result.treatmentPages.some(page => page.options.length > 0), `${name}: options`);
    assert.ok(!result.sections.some(section => ['LOW-RISK', 'HIGH-RISK', 'RE-EVALUATE'].includes(section.code)), `${name}: false section code`);
    assert.ok(!result.treatmentPages.some(page => /^(?:MS|ABBR)-/.test(page.sectionCode)), `${name}: supporting page included`);
    assert.ok(result.treatmentPages.every(page => ['recommendation', 'pathway', 'principles', 'workup', 'supporting'].includes(page.role)), `${name}: page role`);
    results.set(name, result);
    console.log(JSON.stringify({ name, sections: result.sections.length, treatmentPages: result.treatmentPages.length, options: result.treatmentPages.reduce((sum, page) => sum + page.options.length, 0) }));
  }

  const prostate = results.get('Prostate');
  assert.equal(prostate.sections.find(section => section.page === 27)?.code, 'PROS-12');
  const pros12 = prostate.treatmentPages.find(page => page.page === 27);
  assert.ok(pros12, 'Prostate: PROS-12 treatment page');
  assert.ok(pros12.options.some(option => /Enzalutamide|Apalutamide|\bADT\b/i.test(option.label)), 'Prostate: PROS-12 systemic options');

  const nsclcKeywords = new Set(results.get('NSCLC').treatmentPages.flatMap(page => page.keywords));
  assert.ok(nsclcKeywords.has('ROS1'), 'NSCLC: ROS1 keyword');
  assert.ok(nsclcKeywords.has('MET'), 'NSCLC: MET keyword');
  const sclcKeywords = new Set(results.get('SCLC').treatmentPages.flatMap(page => page.keywords));
  assert.ok(sclcKeywords.has('limited-stage-sclc'), 'SCLC: limited-stage keyword');
  assert.ok(sclcKeywords.has('extensive-stage-sclc'), 'SCLC: extensive-stage keyword');

  const modalities = new Set([...results.values()].flatMap(result => result.treatmentPages.flatMap(page => page.options.map(option => option.modality))));
  for (const modality of ['surgery', 'radiation', 'systemic', 'followup']) assert.ok(modalities.has(modality), `Missing modality ${modality}`);
  assert.ok([...results.values()].some(result => result.treatmentPages.some(page => page.nextSteps.length)), 'No next-step links extracted');

  const asDocument = result => ({ nccnStructure: result });
  const hccDocument = { title: 'Hepatocellular Carcinoma', nccnStructure: results.get('HCC') };
  for (const [name, fields] of [
    ['Stage IV', [{ label: '臨床／病理分期或風險分層', value: 'Stage IV' }]],
    ['BCLC C', [{ label: 'BCLC 分期', value: 'C' }, { label: 'Child-Pugh', value: 'A5' }]],
  ]) {
    const hccMatches = matcher.matchTreatmentPages([hccDocument], fields);
    assert.ok(hccMatches.length > 0, `HCC ${name}: no clinical matches`);
    assert.equal(hccMatches[0].page.sectionCode, 'HCC-I', `HCC ${name}: systemic recommendations not first`);
    assert.ok(hccMatches[0].page.options.some(option => /Atezolizumab|Durvalumab|Nivolumab/i.test(option.label)), `HCC ${name}: no drug options`);
    assert.ok(!hccMatches.some(match => match.page.sectionCode === 'HCC-C'), `HCC ${name}: mixed HCC-CCA leaked into regular HCC`);
  }

  const nsclcMatches = matcher.matchTreatmentPages([asDocument(results.get('NSCLC'))], [
    { label: '病程情境', value: '轉移／全身性' },
    { label: '治療階段／線別', value: '第一線' },
    { label: 'NSCLC 驅動基因／可標靶變異', value: ['ROS1 fusion'] },
  ]);
  assert.ok(nsclcMatches.length > 0, 'NSCLC: no clinical matches');
  assert.ok(nsclcMatches.some(match => match.reasons.includes('ros1')), 'NSCLC: ROS1 clinical route');
  assert.ok(nsclcMatches.some(match => ['systemic', 'radiation', 'surgery'].includes(match.modality)), 'NSCLC: no treatment modality');

  const sclcMatches = matcher.matchTreatmentPages([asDocument(results.get('SCLC'))], [
    { label: '病程情境', value: '轉移／全身性' },
    { label: '治療階段／線別', value: '第一線' },
    { label: 'SCLC 分期', value: '廣泛期' },
  ]);
  assert.ok(sclcMatches.length > 0, 'SCLC: no clinical matches');
  assert.ok(sclcMatches.some(match => match.reasons.includes('extensive-stage-sclc')), 'SCLC: extensive-stage clinical route');
  assert.ok(sclcMatches.some(match => ['systemic', 'radiation'].includes(match.modality)), 'SCLC: no systemic or radiation route');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
