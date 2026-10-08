const test=require('node:test'),assert=require('node:assert/strict');
const branch=require('../branch-evidence.js');
const fields=values=>Object.entries(values).map(([key,value])=>({key,value}));
const page={sectionCode:'COL-4',page:13,sourceText:'low-risk stage III high-risk stage III',sourceLayout:{version:1,rows:[
  {top:.16,items:[{left:.03,text:'pMMR/MSS ADJUVANT TREATMENT'}]},
  {top:.47,items:[{left:.04,text:'T1–3 N1 low-risk stage III'},{left:.24,text:'CAPEOX (3 mo) or FOLFOX (3–6 mo)'}]},
  {top:.60,items:[{left:.04,text:'T4 N1–2 high-risk stage III'},{left:.24,text:'FOLFOX (6 mo)'}]},
  {top:.80,items:[{left:.04,text:'ctDNA is prognostic, but not predictive. Negative conditions and exceptions.'}]},
  {top:.93,items:[{left:.03,text:'All recommendations are category 2A unless otherwise indicated.'}]},
]}};
const args={cancerId:'colon_cancer',version:'2.2026',page,context:{phase:'postoperative'},fields:fields({'crc-mmr-msi':'pMMR／MSS','colon-pt':'pT3','colon-pn':'pN1'})};
test('located branch excludes opposite row but preserves headings, caveats and category notes',()=>{
  const result=branch.locate(args);assert.equal(result.status,'located');assert.equal(result.id,'col4-low-iii');
  assert.match(result.passages.map(x=>x.text).join(' '),/ctDNA/);assert.doesNotMatch(result.passages.map(x=>x.text).join(' '),/high-risk stage III/);
});
test('wrong version, missing layout, altered anchor and unknown stage fall back to whole page',()=>{
  for(const change of [{version:'3.2026'},{page:{...page,sourceLayout:null}},{page:{...page,sourceText:'Changed PDF'}},{fields:fields({'crc-mmr-msi':'pMMR／MSS','colon-pt':'','colon-pn':'pN1'})}]) assert.equal(branch.locate({...args,...change}).status,'whole_page');
});
test('PDF highlight boxes reject malformed, out-of-range and inverted coordinates',()=>{
  assert.equal(branch.validBox([0,.1,1,.9]),true);
  for(const value of [null,[],[0,0,1],[0,0,NaN,1],[0,-1,1,1],[1,.1,.2,.3],['0',0,1,1]])assert.equal(branch.validBox(value),false);
});
test('malformed imported layout falls back without crashing or inventing a branch',()=>{
  for(const rows of [{},[null],[{top:.5,items:null}],[{top:'0.5',items:[]}],[{top:.5,items:[null]}]])assert.equal(branch.locate({...args,page:{...page,sourceLayout:{version:1,rows}}}).status,'whole_page');
});
