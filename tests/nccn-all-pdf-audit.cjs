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
if (!pdfRoot) throw new Error('Set NCCN_PDF_DIR to the folder containing all NCCN PDFs.');
function normalizeNccnTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/\bnccn\b|\bguidelines?\b|\bversion\b|\b20\d{2}\b|\bv\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function loadExpectedCatalog() {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const guidelineBlock = html.match(/const NCCN_GUIDELINES = \[([\s\S]*?)\n    \]\.map/)?.[1] || '';
  const guidelines = [...guidelineBlock.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)]
    .map(match => ({ id: match[1], title: match[2] }));
  const aliasBlock = html.match(/const NCCN_GUIDELINE_TITLE_ALIASES = \{([\s\S]*?)\n    \};/)?.[1] || '';
  const aliases = Object.fromEntries([...aliasBlock.matchAll(/'(\d+)':\s*\[([^\]]*)\]/g)]
    .map(match => [match[1], [...match[2].matchAll(/'([^']+)'/g)].map(alias => alias[1])]));
  return { guidelines, aliases };
}

function missingCatalogGuidelines(files) {
  const { guidelines, aliases } = loadExpectedCatalog();
  assert.equal(guidelines.length, 69, 'Expected 69 NCCN guideline families in the App catalog');
  const recognized = new Set();
  for (const file of files) {
    const normalizedFile = ` ${normalizeNccnTitle(file)} `;
    for (const guideline of guidelines) {
      const titles = [guideline.title, ...(aliases[guideline.id] || [])];
      if (titles.some(title => normalizedFile.includes(` ${normalizeNccnTitle(title)} `))) recognized.add(guideline.id);
    }
  }
  return guidelines.filter(guideline => !recognized.has(guideline.id)).map(guideline => guideline.title);
}


const commonScenarios = {
  metastatic_first_line: [
    { label: 'Disease setting', value: 'metastatic' },
    { label: 'Treatment line', value: 'first-line' },
  ],
  unresectable_first_line: [
    { label: 'Disease setting', value: 'unresectable' },
    { label: 'Treatment line', value: 'first-line' },
  ],
  recurrent_second_line: [
    { label: 'Disease setting', value: 'recurrent' },
    { label: 'Treatment line', value: 'second-line' },
  ],
  resectable_initial: [
    { label: 'Disease setting', value: 'resectable' },
    { label: 'Treatment line', value: 'initial therapy' },
  ],
  adjuvant: [{ label: 'Treatment setting', value: 'adjuvant' }],
  followup: [{ label: 'Treatment setting', value: 'follow-up surveillance' }],
};

function specializedScenarios(file) {
  const scenarios = {};
  if (/Myeloproliferative/i.test(file)) scenarios.mpn_pmf = [{ label: 'MPN subtype', value: 'PMF' }];
  if (/Systemic Mastocytosis/i.test(file)) scenarios.sm_aggressive = [{ label: 'Systemic mastocytosis subtype', value: 'aggressive systemic mastocytosis' }];
  if (/Eosinophilia.*Kinase Gene Fusions/i.test(file)) scenarios.mlne_fgfr1 = [{ label: 'Tyrosine kinase fusion', value: 'FGFR1' }];
  return scenarios;
}

function matchedSystemicOptions(doc, fields) {
  const matches = matcher.matchTreatmentPages([doc], fields, 20);
  return matches.reduce((sum, match) => sum + (match.page.options || [])
    .filter(option => option.modality === 'systemic' && !option.needsReview).length, 0);
}

async function main() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../vendor/pdf.min.mjs')).href;
  const workerUrl = pathToFileURL(path.resolve(__dirname, '../vendor/pdf.worker.min.mjs')).href;
  const files = fs.readdirSync(pdfRoot).filter(file => /\.pdf$/i.test(file)).sort();
  assert.ok(files.length >= 60, `Expected the full NCCN set, found ${files.length} PDFs`);
  const missingGuidelines = missingCatalogGuidelines(files);
  assert.deepEqual(missingGuidelines, [], [
    `The NCCN folder has ${files.length} PDFs but is missing ${missingGuidelines.length} expected guideline families:`,
    ...missingGuidelines.map(title => `- ${title}`),
  ].join('\n'));
  const anomalies = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const fullPath = path.join(pdfRoot, file);
    const result = await parser.extractAndParse(new Blob([fs.readFileSync(fullPath)]), { moduleUrl, workerUrl });
    assert.equal(result.schemaVersion, parser.schemaVersion, `${file}: schema`);
    const pages = result.treatmentPages || [];
    const options = pages.flatMap(page => page.options || []);
    const redirects = (result.redirectGuidelines || []).length;
    if (!redirects) {
      if (!result.sections.length) anomalies.push({ file, issue: 'no_sections' });
      if (!pages.length) anomalies.push({ file, issue: 'no_treatment_pages' });
      if (!options.length) anomalies.push({ file, issue: 'no_options' });
    }

    const doc = { title: file.replace(/\.pdf$/i, ''), fileName: file, source: 'NCCN', nccnStructure: result };
    const scenarios = { ...commonScenarios, ...specializedScenarios(file) };
    const exposedSystemic = Object.values(scenarios).some(fields => matchedSystemicOptions(doc, fields) > 0);
    const systemicCount = options.filter(option => option.modality === 'systemic').length;
    if (systemicCount >= 3 && !exposedSystemic) {
      anomalies.push({ file, issue: 'systemic_options_not_exposed', systemicCount });
    }

    console.log(`[${index + 1}/${files.length}] ${file}: ${pages.length} treatment pages, ${options.length} options`);
  }

  assert.deepEqual(anomalies, [], JSON.stringify(anomalies, null, 2));
  console.log(`All ${files.length} NCCN PDFs passed structural and treatment-exposure checks.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
