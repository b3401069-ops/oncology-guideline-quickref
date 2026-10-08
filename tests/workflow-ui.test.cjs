const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('focus, decisive question, eligibility and source-region controls are wired to shared logic',()=>{
  for(const token of ['case-focus','key-question-submit','CASE_WORKFLOW.focusSelection','CASE_WORKFLOW.questions','CASE_WORKFLOW.statementAllowed','window._openEvidenceRegion','BRANCH_EVIDENCE.validBox','context.strokeRect','pdf-evidence-region'])assert.ok(html.includes(token),token);
  assert.match(html,/const eligibleTreatmentEvidence = treatmentEvidence/);
  assert.match(html,/sourceCheckVersion !== 2/);
});
test('fixed case review does not write patient state, and export omits document blobs and storage keys',()=>{
  const reference=require('../reference-cases.js');
  const result={example:reference.cases[0],docs:[{storageKey:'NEVER-EXPORT',nccnStructure:{sourceSha256:'a'.repeat(64)}}],fields:[],binding:'case-source',sourceReady:true,engineeringPassed:true,actual:[],missing:[],unexpected:[],forbidden:[]};
  const exported=JSON.stringify(reference.exportReport([result],{}));
  assert.doesNotMatch(exported,/NEVER-EXPORT/);assert.match(exported,/sourceFingerprints/);
  const source=fs.readFileSync('reference-cases.js','utf8');
  assert.doesNotMatch(source,/CASE_STATE\.write|sessionStorage\.setItem/);
  assert.match(html,/data-reference-review/);assert.match(html,/REFERENCE_CASES.saveReview/);
});
