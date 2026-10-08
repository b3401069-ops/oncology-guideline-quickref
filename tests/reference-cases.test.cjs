const test=require('node:test'),assert=require('node:assert/strict'),r=require('../reference-cases.js');
const storage=()=>{let v='';return {getItem:()=>v,setItem:(k,s)=>{v=s;}};};
const result={example:r.cases[0],sourceReady:true,engineeringPassed:true,binding:'version-a',missing:[],unexpected:[],forbidden:[]};
test('engineering success never manufactures clinical confirmation or a clinical rate',()=>{
  assert.equal(r.reviewState(result,{}),'pending');assert.equal(r.metrics([result],{}).clinicalMissingRate,null);
  assert.equal(r.metrics([result],{}).confirmed,0);
});
test('confirmation requires explicit reviewer, note, attestation and a passing source-bound case',()=>{
  for(const form of [{status:'confirmed'},{status:'confirmed',reviewer:'Reviewer',note:'Checked',attested:false}])assert.throws(()=>r.saveReview(result,form,storage()));
  const s=storage();const reviews=r.saveReview(result,{status:'confirmed',reviewer:'Synthetic reviewer',note:'Test only',attested:true},s);
  assert.equal(r.reviewState(result,reviews),'confirmed');
  assert.equal(r.reviewState({...result,binding:'version-b'},reviews),'stale');
  const regression={...result,engineeringPassed:false,missing:['BINV-6|19']};
  assert.equal(r.reviewState(regression,reviews),'confirmed');
  assert.equal(r.metrics([regression],reviews).confirmedRegressionFailures,1);
  assert.equal(r.metrics([regression],reviews).clinicalMissingRate,.5);
  assert.throws(()=>r.saveReview({...result,engineeringPassed:false},{status:'confirmed',reviewer:'R',note:'N',attested:true},s));
});
test('fixed source expectations detect missing and unexpected pages, independent of matcher result',()=>{
  const ex=r.cases[0],doc={title:ex.document,nccnStructure:{version:ex.version,sourceSha256:'a'.repeat(64)}};
  const matcher={resolveCaseContext:()=>({phase:'postoperative'}),adjuvantAssessment:()=>({}),matchTreatmentPages:()=>[]};
  const review={selectEvidence:()=>({evidencePages:[{page:{sectionCode:'BINV-7',page:20}}],blocked:false})};
  const out=r.run(ex,[doc],matcher,review);assert.equal(out.engineeringPassed,false);assert.deepEqual(out.missing,['BINV-6|19','BINV-M|72']);assert.deepEqual(out.forbidden,['BINV-7|20']);
});
