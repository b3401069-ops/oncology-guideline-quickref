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
require('../case-review.js');
require('../clinical-scenarios.js');
const referenceCases = require('../reference-cases.js');
const workflow = require('../case-workflow.js');
const parser = window.NCCN_PARSER;
const matcher = window.CLINICAL_MATCHER;
const scenarios = global.CLINICAL_SCENARIOS;

const pdfRoot = process.env.NCCN_PDF_DIR;
if (!pdfRoot) throw new Error('Set NCCN_PDF_DIR to the folder containing the NCCN PDFs.');

const cases = [
  ['HCC', 'Hepatocellular Carcinoma.pdf'],
  ['NSCLC', 'Non-Small Cell Lung Cancer.pdf'],
  ['SCLC', 'Small Cell Lung Cancer.pdf'],
  ['Breast', 'Breast Cancer.pdf'],
  ['Colon', 'colon cancer.pdf'],
  ['Rectal', 'Rectal Cancer.pdf'],
  ['Prostate', 'Prostate Cancer.pdf'],
  ['Pancreas', 'Pancreatic Adenocarcinoma.pdf'],
  ['Gastric', 'Gastric Cancer.pdf'],
  ['Kidney', 'Kidney Cancer.pdf'],
  ['Bladder', 'Bladder Cancer.pdf'],
  ['Ovarian', 'Ovarian Cancer_Fallopian Tube Cancer_Primary Peritoneal Cancer.pdf'],
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
    assert.equal(result.schemaVersion, parser.schemaVersion, `${name}: schema`);
    assert.equal(result.evidenceContextVersion, 2, `${name}: source context capability`);
    assert.equal(result.branchContextVersion, 1, `${name}: layout context capability`);
    assert.match(result.sourceSha256, /^[a-f0-9]{64}$/, `${name}: source fingerprint`);
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
  // End-to-end source checks: these exercise the actual postoperative assessment
  // and the shared UI/AI/NHI selection, not only generic keyword matching.
  const keyed = data => Object.entries(data).map(([sourceTemplateKey, value]) => ({ sourceTemplateKey, label: sourceTemplateKey, value }));
  const breastDoc = { title: 'Breast Cancer', storageKey: 'audit-breast', nccnStructure: results.get('Breast') };
  const breastFields = keyed({
    'base-disease-setting': '初診局限', 'base-treatment-setting': '術後／鞏固',
    'breast-pathology-scope': '浸潤性乳癌', 'breast-surgery-path': '先手術（未接受術前全身治療）',
    'breast-pt': 'pT2', 'breast-pn': 'pN1（1–3 顆陽性）', 'breast-er': '低度陽性（1–10%）', 'breast-pr': '陰性',
    'breast-her2': 'IHC 2+／ISH 陰性', 'breast-subtype': 'HR+/HER2-', 'breast-menopause': '停經後',
    'breast-grade': 'Grade 3', 'breast-lvi': '有', 'breast-tumor-size-cm': '3', 'breast-ki67': '35',
    'breast-chemotherapy-candidate': '適合接受化療', 'breast-genomic-assay': '未評估', 'breast-oncotype-rs': '',
  });
  const breastAssessment = matcher.adjuvantAssessment('breast_cancer', [breastDoc], breastFields);
  const breastContext = matcher.resolveCaseContext(breastFields);
  const breastSelection = window.CASE_REVIEW.selectEvidence('breast_cancer', breastAssessment, matcher.matchTreatmentPages([breastDoc], breastFields, Infinity), breastContext);
  assert.equal(breastSelection.blocked, false, breastSelection.issues.join('; '));
  assert.match(breastAssessment.decision.headline, /優先討論輔助性化療/);
  assert.deepEqual(breastSelection.sourcePages.map(item => [item.page.sectionCode, item.page.page]), [['BINV-6', 19], ['BINV-M', 72]]);
  assert.ok(breastSelection.treatmentEvidence.length > 0, 'Original ER-low case: no source-matched chemotherapy candidates');
  assert.ok(breastSelection.treatmentEvidence.every(item => item.page.page === 72), 'Opposite-subtype or downstream regimens leaked into selection');
  assert.match(breastAssessment.pages[0].page.sourceText, /ER-low/);
  const payload = window.CASE_REVIEW.buildPayload({ cancer: { id: 'breast_cancer' }, fields: breastFields, assessment: breastAssessment, context: breastContext, selection: breastSelection, treatmentHistory: [] });
  assert.ok(payload.evidence.every(item => item.contextComplete));
  assert.equal(payload.evidence.length, 2);
  assert.deepEqual(window.CASE_REVIEW.inspectEvidencePacket(payload), []);
  assert.deepEqual(payload.evidence.map(item => item.role), ['primary', 'regimen']);
  assert.ok(payload.evidence.every(item => item.pageText === breastDoc.nccnStructure.treatmentPages.find(page => page.page === item.page).sourceText.trim()));
  console.log('PASS real-source breast assessment -> selected pages -> AI payload -> NHI candidate inputs');
  const breastBranch=payload.evidence.find(p=>p.page===19).branch;
  assert.equal(breastBranch.status,'located',JSON.stringify(breastBranch));
  assert.equal(breastBranch.id,'binv6-no-assay');
  assert.equal(breastBranch.alternatives,true);
  assert.match(breastBranch.passages.find(p=>p.kind==='footnotes').text,/ER-low/);
  for(const rs of ['0','25','26','100']) {
    const fields=breastFields.map(f=>f.sourceTemplateKey==='breast-genomic-assay'?{...f,value:'Oncotype DX'}:f.sourceTemplateKey==='breast-oncotype-rs'?{...f,value:rs}:f);
    const located=require('../branch-evidence.js').locate({cancerId:'breast_cancer',fields,context:breastContext,page:breastAssessment.pages[0].page,version:'5.2026'});
    assert.equal(located.status,'located',JSON.stringify({rs,...located}));
    assert.equal(located.id,Number(rs)>=26?'binv6-rs-high':'binv6-rs-low');
    assert.equal(located.alternatives,false);
  }
  const eligibilityFocus=workflow.focusSelection(breastAssessment,[], 'eligibility',{cancerId:'breast_cancer',fields:breastFields});
  const eligibilitySelection=window.CASE_REVIEW.selectEvidence('breast_cancer',eligibilityFocus.assessment,[],breastContext);
  const eligibilityPayload=window.CASE_REVIEW.buildPayload({cancer:{id:'breast_cancer'},fields:breastFields,assessment:eligibilityFocus.assessment,context:breastContext,selection:eligibilitySelection,treatmentHistory:[]});
  assert.ok(eligibilityPayload.evidence.some(p=>p.page===68 && p.role==='eligibility'));
  assert.equal(eligibilityPayload.therapyChecks.find(p=>p.id==='abemaciclib').status,'met');

  const lungDoc = { title: 'Non-Small Cell Lung Cancer', storageKey: 'audit-lung', nccnStructure: results.get('NSCLC') };
  const lungFields = keyed({ 'base-treatment-setting': '術後／鞏固', 'nsclc-surgery-path': '先手術（未接受術前全身治療）',
    'nsclc-path-stage': 'IB', 'nsclc-pt': 'pT2a', 'nsclc-pn': 'pN0', 'nsclc-margin': 'R0（陰性）', 'nsclc-high-risk': ['無上述特徵'], 'nsclc-drivers': ['EGFR exon 19 deletion'] });
  const lungAssessment = matcher.adjuvantAssessment('nsclc', [lungDoc], lungFields);
  assert.deepEqual(lungAssessment.pages.map(item => [item.page.sectionCode, item.page.page]), [['NSCL-4', 29]]);
  const footnotes = lungAssessment.supportingPages.find(item => item.page.sectionCode === 'NSCL-4A');
  assert.equal(footnotes?.page.page, 30);
  assert.match(footnotes.page.sourceText, /FOOTNOTES FOR NSCL-4/);
  const lungContext = matcher.resolveCaseContext(lungFields);
  const lungSelection = window.CASE_REVIEW.selectEvidence('nsclc', lungAssessment, matcher.matchTreatmentPages([lungDoc], lungFields, Infinity), lungContext);
  const lungPayload = window.CASE_REVIEW.buildPayload({ cancer: { id: 'nsclc' }, fields: lungFields, assessment: lungAssessment, context: lungContext, selection: lungSelection, treatmentHistory: [] });
  assert.deepEqual(window.CASE_REVIEW.inspectEvidencePacket(lungPayload), []);
  assert.deepEqual(lungPayload.evidence.map(item => item.page).sort((a,b) => a-b), [29, 30, 93]);
  assert.equal(lungPayload.evidence.find(item => item.page === 30).role, 'footnotes');
  assert.ok(lungPayload.evidence.find(item => item.page === 29).requiredReferences.includes(lungPayload.evidence.find(item => item.page === 30).reference));
  assert.ok(lungSelection.treatmentEvidence.every(item => item.page.page !== 30));
  console.log('PASS real-source NSCLC main algorithm and linked footnotes');

  const colonDoc = { title: 'Colon Cancer', storageKey: 'audit-colon', nccnStructure: results.get('Colon') };
  const colonFields = keyed({ 'base-treatment-setting': '術後／鞏固', 'colon-surgery-path': '先手術（未接受術前全身治療）',
    'colon-path-stage': 'IIIB', 'colon-pt': 'pT3', 'colon-pn': 'pN1', 'colon-margin': 'R0（陰性）', 'crc-mmr-msi': 'pMMR／MSS' });
  const colonAssessment = matcher.adjuvantAssessment('colon_cancer', [colonDoc], colonFields);
  const colonSelection = window.CASE_REVIEW.selectEvidence('colon_cancer', colonAssessment, matcher.matchTreatmentPages([colonDoc], colonFields), matcher.resolveCaseContext(colonFields));
  assert.deepEqual(colonAssessment.pages.map(item => [item.page.sectionCode, item.page.page]), [['COL-4', 13]]);
  assert.equal(colonSelection.blocked, false, colonSelection.issues.join('; '));
  assert.match(colonAssessment.pages[0].page.sourceText, /low-risk stage III/);
  assert.match(colonSelection.treatmentEvidence.map(item => item.page.options[0].label).join(' '), /CAPEOX/);
  assert.match(colonSelection.treatmentEvidence.map(item => item.page.options[0].label).join(' '), /FOLFOX/);
  console.log('PASS real-source colon postoperative branch and source-backed regimen selection');

  const rectalDoc = { title: 'Rectal Cancer', nccnStructure: results.get('Rectal') };
  const rectalFields = keyed({ 'base-treatment-setting': '術後／鞏固', 'rectal-surgery-path': '完成 TNT 後手術', 'rectal-path-stage': 'IIA',
    'rectal-pt': 'ypT3', 'rectal-pn': 'ypN0', 'rectal-margin': '陰性', 'rectal-crm': '陰性／未受威脅', 'crc-mmr-msi': 'pMMR／MSS' });
  const operated = matcher.adjuvantAssessment('rectal_cancer', [rectalDoc], rectalFields);
  assert.deepEqual(operated.supportingPages.map(item => [item.page.sectionCode, item.page.page]), [['REC-10', 21]]);
  const nonoperative = matcher.adjuvantAssessment('rectal_cancer', [rectalDoc], keyed({ 'base-treatment-setting': '術後／鞏固',
    'rectal-surgery-path': '免疫治療後完全臨床反應／未手術', 'crc-mmr-msi': 'dMMR／MSI-H' }));
  assert.deepEqual(nonoperative.missing, []);
  assert.deepEqual(nonoperative.supportingPages.map(item => [item.page.sectionCode, item.page.page]), [['REC-10A', 22]]);
  console.log('PASS real-source rectal operative vs nonoperative surveillance');
  const referenceResults=referenceCases.cases.map(example=>referenceCases.run(example,[breastDoc,lungDoc,colonDoc,rectalDoc],matcher,window.CASE_REVIEW));
  for(const result of referenceResults) {
    assert.equal(result.engineeringPassed,true,JSON.stringify({case:result.example.id,actual:result.actual,missing:result.missing,unexpected:result.unexpected,blocked:result.blocked}));
    if(result.example.cancerId==='colon_cancer') {
      const assessment=matcher.adjuvantAssessment('colon_cancer',[colonDoc],result.fields);
      const context=matcher.resolveCaseContext(result.fields);
      const selection=window.CASE_REVIEW.selectEvidence('colon_cancer',assessment,[],context);
      const p=window.CASE_REVIEW.buildPayload({cancer:{id:'colon_cancer'},fields:result.fields,assessment,context,selection});
      const b=p.evidence.find(p=>p.page===13).branch;
      assert.equal(b.status,'located',JSON.stringify(b));
      assert.equal(b.id,result.example.id==='colon-low-iii'?'col4-low-iii':'col4-high-iii');
      const row=b.passages.find(p=>p.kind==='branch').text;
      assert.match(row,result.example.id==='colon-low-iii'?/low-risk stage III/:/high-risk stage III/);
      assert.doesNotMatch(row,result.example.id==='colon-low-iii'?/high-risk stage III/:/low-risk stage III/);
    }
  }
  assert.equal(referenceCases.metrics(referenceResults,{}).confirmed,0);
  console.log('PASS 6 fixed source cases (engineering only; 0 clinically confirmed), breast/colon page regions and eligibility source focus');
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

  const scenarioDocuments = [
    { title: 'Hepatocellular Carcinoma', cancerIds: ['hepatocellular_carcinoma'], nccnStructure: results.get('HCC') },
    { title: 'Non-Small Cell Lung Cancer', cancerIds: ['nsclc'], nccnStructure: results.get('NSCLC') },
    { title: 'Small Cell Lung Cancer', cancerIds: ['sclc'], nccnStructure: results.get('SCLC') },
    { title: 'Breast Cancer', cancerIds: ['breast_cancer'], nccnStructure: results.get('Breast') },
    { title: 'Rectal Cancer', cancerIds: ['colorectal_cancer'], nccnStructure: results.get('Rectal') },
    { title: 'Prostate Cancer', cancerIds: ['prostate_cancer'], nccnStructure: results.get('Prostate') },
    { title: 'Pancreatic Adenocarcinoma', cancerIds: ['pancreatic_cancer'], nccnStructure: results.get('Pancreas') },
    { title: 'Gastric Cancer', cancerIds: ['gastric_cancer'], nccnStructure: results.get('Gastric') },
    { title: 'Kidney Cancer', cancerIds: ['renal_cell_carcinoma'], nccnStructure: results.get('Kidney') },
    { title: 'Bladder Cancer', cancerIds: ['bladder_cancer'], nccnStructure: results.get('Bladder') },
    { title: 'Ovarian Cancer', cancerIds: ['ovarian_cancer'], nccnStructure: results.get('Ovarian') },
    { title: 'Neuroendocrine and Adrenal Tumors', cancerIds: ['neuroendocrine_tumor'], nccnStructure: results.get('NET') },
  ];
  const scenarioSummary = scenarios.summarize(scenarioDocuments, matcher);
  for (const result of scenarioSummary.results) {
    console.log(JSON.stringify({
      scenario: result.scenario.id,
      status: result.status,
      missing: result.missing,
      violations: result.violations,
    }));
  }
  assert.equal(scenarioSummary.attention.length, 0, 'Standard clinical scenarios require review: ' + scenarioSummary.attention.map(result => result.scenario.id + ' [' + result.missing.join(', ') + ']').join('; '));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
