const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../case-workflow.js');
const fields = values => Object.entries(values).map(([sourceTemplateKey,value]) => ({id:sourceTemplateKey, sourceTemplateKey,label:sourceTemplateKey,value}));

test('locally advanced untreated breast case is not prompted as metastatic disease', () => {
  const f = fields({'base-treatment-setting':'尚未治療','base-disease-setting':'局部晚期／不可切除',
    'breast-subtype':'HER2+','breast-her2':'IHC 3+','breast-er':'陰性','base-stage':'',
    'breast-advanced-alterations':'','breast-pdl1-cps':'','breast-pn':'','breast-pt':'','breast-oncotype-rs':'','breast-tumor-size-cm':''});
  const args = {cancerId:'breast_cancer',fields:f,context:{phase:'locally-advanced'},diagnosis:{suggestedFields:f}};
  const q = workflow.questions(args);
  assert.deepEqual(q.map(x=>x.field.id),['base-stage']);
  assert.ok(workflow.questions({...args,context:{phase:'advanced'}}).some(x=>x.field.id==='breast-advanced-alterations'));
});

test('generic diagnostic suggestions cannot reintroduce postoperative fields in other cancers', () => {
  for (const cancerId of ['breast_cancer','nsclc','colon_cancer','rectal_cancer']) {
    const prefix = cancerId.replace('_cancer','');
    const f = fields({[prefix+'-pt']:'',[prefix+'-pn']:'',[prefix+'-margin']:''});
    for (const phase of ['initial','preoperative','locally-advanced','advanced','followup']) {
      assert.deepEqual(workflow.questions({cancerId,fields:f,context:{phase},diagnosis:{suggestedFields:f}}),[]);
    }
    assert.equal(workflow.questions({cancerId,fields:f,context:{phase:'postoperative'},diagnosis:{suggestedFields:f}}).length,2);
  }
});

test('source notices distinguish absent PDF, unparsed PDF and unmatched index from missing case input', () => {
  const base={filledCount:9,hasDocs:false,hasIndex:false,hasPages:false};
  const absent=workflow.sourceNotice(base);
  assert.match(absent.headline,/已收到 9 項條件/);
  assert.match(absent.message,/不是已填資料遺失/);
  assert.match(workflow.sourceNotice({...base,hasDocs:true}).headline,/尚待解析/);
  assert.match(workflow.sourceNotice({...base,hasDocs:true,hasIndex:true}).message,/不代表沒有適用療程/);
  assert.equal(workflow.sourceNotice({...base,hasDocs:true,hasIndex:true,hasPages:true}),null);
});

test('deferring questions advances the form without changing unknowns or suppressing result-page gaps', () => {
  for (const cancerId of ['breast_cancer','nsclc','colon_cancer','rectal_cancer','rare_cancer']) {
    const f = fields({'base-treatment-setting':'','base-disease-setting':'','base-pathology':'待確認'});
    const args = {cancerId,fields:f,context:{phase:'unknown'},diagnosis:{suggestedFields:[f[2]]}};
    const before = JSON.stringify(f);
    assert.deepEqual(workflow.questions(args).map(x=>x.field.id),f.slice(0,2).map(x=>x.id));
    assert.deepEqual(workflow.questions({...args,deferredIds:f.slice(0,2).map(x=>x.id)}).map(x=>x.field.id),['base-pathology']);
    assert.equal(JSON.stringify(f),before);
    assert.equal(workflow.questions(args).length,2);
  }
});

test('deferral never hides conflicting disease and treatment settings', () => {
  const f = fields({'base-treatment-setting':'術後／鞏固','base-disease-setting':'轉移／全身性'});
  const q = workflow.questions({fields:f,context:{conflicts:['矛盾']},deferredIds:f.map(x=>x.id)});
  assert.equal(q.length,2);
  assert.ok(q.every(x=>x.reason.includes('矛盾')));
});

test('explicit AI decision changes and uncertainty retain both conclusions for review', () => {
  for (const decision of ['目前不支持常規輔助性化療','證據不足，需核對','優先補充關鍵資料','傾向／應考慮輔助性化療']) {
    assert.match(workflow.summaryDisagreement({level:'recommended'},{decision}),/系統未替您選定結論/);
  }
  assert.match(workflow.summaryDisagreement({level:'review'},{decision:'建議輔助性化療'}),/不同/);
  assert.equal(workflow.summaryDisagreement({level:'recommended'},{decision:'建議輔助性化療'}),'');
  assert.equal(workflow.summaryDisagreement(undefined,{decision:'建議輔助性化療'}),'');
});
test('asks at most two actionable missing fields, prioritizing current phase and never asks for known values', () => {
  const f = fields({'base-treatment-setting':'','base-disease-setting':'初診局限','breast-subtype':'','breast-er':'陽性'});
  const result = workflow.questions({cancerId:'breast_cancer',fields:f,context:{phase:'unknown'},assessment:{missing:[]}});
  assert.equal(result.length,2);
  assert.equal(result[0].field.sourceTemplateKey,'base-treatment-setting');
  assert.ok(result.every(item => item.reason && item.field.value === ''));
});
test('conflicts take precedence and ER-low does not mandate an unknown recurrence score', () => {
  const f = fields({'base-treatment-setting':'術後／鞏固','base-disease-setting':'轉移／全身性','breast-genomic-assay':'未評估','breast-oncotype-rs':''});
  const q = workflow.questions({cancerId:'breast_cancer',fields:f,context:{phase:'advanced',conflicts:['不一致']},assessment:{missing:[]}});
  assert.equal(q[0].field.sourceTemplateKey,'base-disease-setting');
  assert.ok(!q.some(item => item.field.sourceTemplateKey === 'breast-oncotype-rs'));
});
const evidence = [{reference:'E1',sectionCode:'NSCL-E',page:93,version:'6.2026',sourceContextVersion:2,contextComplete:true,truncated:false,pageText:'Osimertinib EGFR exon 19 deletion or L858R previous adjuvant chemotherapy Alectinib ALK gene fusions Atezolizumab PD-L1'}];
const lung = changes => fields({'base-treatment-setting':'術後／鞏固','nsclc-surgery-path':'先手術（未接受術前全身治療）','nsclc-path-stage':'IIB','nsclc-pt':'pT3','nsclc-pn':'pN0','nsclc-tumor-size-cm':'4','nsclc-drivers':['EGFR exon 19 deletion'],'nsclc-cisplatin':'適合 cisplatin',...changes});
test('eligibility distinguishes absent source, missing prerequisite history, explicit mismatch and met recorded checks', () => {
  const args = {cancerId:'nsclc',context:{phase:'postoperative'},fields:lung(),evidence,history:[]};
  assert.equal(workflow.eligibility({...args,evidence:[]}).find(x=>x.id==='osimertinib').status,'missing');
  assert.equal(workflow.eligibility(args).find(x=>x.id==='osimertinib').status,'missing');
  assert.equal(workflow.eligibility(args).find(x=>x.id==='alectinib').status,'unmet');
  const checked = workflow.eligibility({...args,history:[{phase:'術後／輔助',treatment:'Cisplatin/Pemetrexed',status:'已完成'}]}).find(x=>x.id==='osimertinib');
  assert.equal(checked.status,'met');
  assert.ok(checked.checks.every(x=>x.status==='met'));
  assert.match(checked.limitation,/不代表/);
});
test('unknown numbers, unknown drivers, prior surgery and cisplatin-only unfitness cannot satisfy platinum eligibility', () => {
  for(const change of [{'nsclc-drivers':['待檢']},{'nsclc-path-stage':''},{'nsclc-cisplatin':'不適合 cisplatin'}]) {
    const result = workflow.eligibility({cancerId:'nsclc',context:{phase:'postoperative'},fields:lung(change),evidence,history:[]});
    assert.notEqual(result.find(x=>x.id==='osimertinib').status,'met');
  }
  assert.deepEqual(workflow.eligibility({cancerId:'nsclc',context:{phase:'advanced'},fields:lung(),evidence,history:[]}),[]);
});
test('tampered eligibility reports cannot authorize a model therapy statement', () => {
  const input = {cancer:{id:'nsclc'},context:{phase:'postoperative'},caseFields:lung().map(f=>({key:f.sourceTemplateKey,value:[].concat(f.value)})),evidence,treatmentHistory:[],therapyChecks:[{id:'osimertinib',status:'met'}]};
  assert.equal(workflow.statementAllowed('建議使用 Osimertinib',input),false);
  assert.equal(workflow.statementAllowed('一般化療方向需核對',input),true);
});
test('advanced questions do not demand postoperative staging or surgery fields',()=>{
  const f=fields({'base-treatment-setting':'第一線','base-disease-setting':'轉移／全身性','nsclc-surgery-path':'','nsclc-path-stage':'','nsclc-drivers':'','nsclc-histology':''});
  const q=workflow.questions({cancerId:'nsclc',fields:f,context:{phase:'advanced'}});
  assert.deepEqual(q.map(x=>x.field.sourceTemplateKey),['nsclc-histology','nsclc-drivers']);
});
test('dedicated assessment suppresses redundant generic diagnosis questions and routes required assay results',()=>{
  const f=fields({'breast-chemotherapy-candidate':'','base-pathology':'','breast-genomic-assay':'未評估','breast-oncotype-rs':''});
  const args={cancerId:'breast_cancer',fields:f,context:{phase:'postoperative'},assessment:{active:true,missing:[]},diagnosis:{suggestedFields:[f[1]]}};
  assert.deepEqual(workflow.questions(args).map(x=>x.field.sourceTemplateKey),['breast-chemotherapy-candidate']);
  const required={...args,fields:f.map(x=>x.sourceTemplateKey==='breast-chemotherapy-candidate'?{...x,value:'適合接受化療'}:x),assessment:{active:true,missing:['可判讀的基因表現檢測結果']}};
  assert.deepEqual(workflow.questions(required).map(x=>x.field.sourceTemplateKey),['breast-genomic-assay']);
  required.fields=required.fields.map(x=>x.sourceTemplateKey==='breast-genomic-assay'?{...x,value:'Oncotype DX'}:x.sourceTemplateKey==='breast-oncotype-rs'?{...x,value:'101'}:x);
  assert.deepEqual(workflow.questions(required).map(x=>x.field.sourceTemplateKey),['breast-oncotype-rs']);
  required.fields.push({id:'grade',sourceTemplateKey:'breast-grade',label:'組織學分級',value:''});
  required.assessment.missing.unshift('組織學分級');
  assert.equal(workflow.questions(required)[0].field.sourceTemplateKey,'breast-grade');
});
test('decision focus defers regimen pages but overview stays unchanged',()=>{
  const doc={},primary={doc,page:{page:19}},secondary={doc,page:{page:72}};
  const assessment={active:true,pages:[primary],supportingPages:[secondary],decision:{regimens:[secondary]}};
  assert.deepEqual(workflow.focusSelection(assessment,[primary,secondary],'overview').assessment,assessment);
  const result=workflow.focusSelection(assessment,[primary,secondary],'decision');
  assert.deepEqual(result.matches,[primary]);assert.deepEqual(result.deferred,[secondary]);assert.deepEqual(result.assessment.supportingPages,[]);
});
test('conflicting markers, unsupported perioperative branches and invalid percentages cannot become met',()=>{
  const history=[{phase:'術後／輔助',treatment:'Cisplatin/Pemetrexed',status:'已完成'}];
  for(const change of [{'nsclc-drivers':['EGFR exon 19 deletion','無已知可標靶變異']},{'nsclc-surgery-path':'術前治療後手術'},{'nsclc-pdl1-tps':'101'}]) {
    const out=workflow.eligibility({cancerId:'nsclc',context:{phase:'postoperative'},fields:lung(change),evidence,history});
    assert.equal(out.find(x=>x.id==='osimertinib').status,'missing');
  }
  const out=workflow.eligibility({cancerId:'nsclc',context:{phase:'postoperative'},fields:lung({'nsclc-drivers':['ALK 陰性']}),evidence,history});
  assert.notEqual(out.find(x=>x.id==='alectinib').status,'met');
});
