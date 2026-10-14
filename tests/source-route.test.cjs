const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../case-workflow.js');
const review = require('../case-review.js');

// Synthetic anchor fixtures; actual PDF and complete-text checks are in nccn-pdf-audit.cjs.
const fields = Object.entries({'base-treatment-setting':'尚未治療','breast-surgery-path':'尚未完成手術',
  'breast-pathology-scope':'浸潤性乳癌','breast-subtype':'HER2+','breast-her2':'IHC 3+'})
  .map(([sourceTemplateKey,value])=>({sourceTemplateKey,value}));
const pages = [
  ['BINV-12',25,'WORKUP PRIOR TO PREOPERATIVE SYSTEMIC THERAPY'],
  ['BINV-M',74,'HR-Positive or -Negative and HER2-Positive'],
  ['BINV-L',69,'PRINCIPLES OF PREOPERATIVE SYSTEMIC THERAPY'],
  ['BINV-L',70,'PRINCIPLES OF PREOPERATIVE SYSTEMIC THERAPY'],
  ['BINV-M',71,'Considerations for Those Receiving Preoperative/Adjuvant Systemic Therapy'],
  ['BINV-15',28,'INOPERABLE OR LOCALLY ADVANCED DISEASE (NON-INFLAMMATORY)'],
  ['IBC-1',113,'Inflammatory Breast Cancer'],['IBC-2',114,'Inflammatory Breast Cancer'],
].map(([code,page,sourceText])=>({code,page,sourceText,sourceContext:{version:2,textExtracted:true,requiredReferences:[]}}));
const doc={id:'fixture',nccnStructure:{version:'5.2026',sections:pages}};
const args={cancerId:'breast_cancer',fields,context:{phase:'locally-advanced'},documents:[doc]};

test('reading route preserves both clinical alternatives and does not create drug recommendations',()=>{
  const route=workflow.sourceRoute(args);
  assert.deepEqual(route.issues,[]);
  assert.deepEqual(route.pages.slice(0,2).map(p=>p.page.page),[25,74]);
  const selection=review.selectEvidence('breast_cancer',{active:false},route.pages,args.context,route);
  assert.equal(selection.evidencePages.length,8);
  assert.deepEqual(selection.treatmentEvidence,[]);
  assert.deepEqual(selection.excludedPages,[]);
  const payload=review.buildPayload({cancer:{id:'breast_cancer'},fields,assessment:{active:false},context:args.context,selection});
  assert.deepEqual(review.inspectEvidencePacket(payload),[]);
  assert.equal(payload.deterministicAssessment.level,'review');
  assert.match(payload.deterministicAssessment.reviewItems.join(' '),/發炎性/);
});

test('missing context, wrong anchors, duplicate documents or new versions fail closed',()=>{
  for(const bad of [
    [{...doc,nccnStructure:{...doc.nccnStructure,sections:pages.filter(p=>p.page!==70)}}],
    [{...doc,nccnStructure:{...doc.nccnStructure,sections:pages.map(p=>p.page===74?{...p,sourceText:'HER2-Negative'}:p)}}],
    [{...doc,nccnStructure:{...doc.nccnStructure,version:'6.2026'}}], [doc,{...doc,id:'duplicate'}],
  ]) {
    const route=workflow.sourceRoute({...args,documents:bad});
    assert.ok(route.issues.length); assert.deepEqual(route.pages,[]);
    assert.equal(review.selectEvidence('breast_cancer',{active:false},[],args.context,route).blocked,true);
  }
});

test('reading route does not silently apply to other phases, unknown markers, or metastatic staging',()=>{
  for(const context of [{phase:'advanced'},{phase:'postoperative'},{phase:'locally-advanced',conflicts:['conflict']}]) {
    assert.equal(workflow.sourceRoute({...args,context}),null);
  }
  assert.equal(workflow.sourceRoute({...args,documents:[]}),null);
  assert.equal(workflow.sourceRoute({...args,fields:fields.filter(f=>f.sourceTemplateKey!=='breast-her2')}),null);
  assert.equal(workflow.sourceRoute({...args,fields:[...fields,{sourceTemplateKey:'base-stage',value:'cT3 cN1 M1'}]}),null);
});

test('an absent explicit dependency or an oversized page remains a transport blocker',()=>{
  for(const changed of [
    pages.map(p=>p.page===74?{...p,sourceContext:{...p.sourceContext,requiredReferences:[{code:'MISSING',kind:'footnotes'}]}}:p),
    pages.map(p=>p.page===74?{...p,sourceText:p.sourceText+'x'.repeat(review.LIMITS.pageChars)}:p),
  ]) {
    const route=workflow.sourceRoute({...args,documents:[{...doc,nccnStructure:{...doc.nccnStructure,sections:changed}}]});
    const selection=review.selectEvidence('breast_cancer',{active:false},[],args.context,route);
    const payload=review.buildPayload({cancer:{id:'breast_cancer'},fields,assessment:{active:false},context:args.context,selection});
    assert.equal(payload.evidenceAudit.status,'blocked'); assert.deepEqual(payload.evidence,[]);
  }
});
