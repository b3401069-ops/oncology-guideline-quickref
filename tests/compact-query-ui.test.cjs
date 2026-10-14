const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
const workflow = require('../case-workflow.js');
require('../case-state.js');
const caseState = globalThis.CASE_STATE;
const plain = value => JSON.parse(JSON.stringify(value));

function source(name, arrow = false) {
  const re = arrow ? new RegExp('    const ' + name + ' = [\\s\\S]*?\\n    };')
    : new RegExp('    (?:async )?function ' + name + '\\([^]*?\\n    }');
  const match = html.match(re);
  assert.ok(match, name + ' production function missing');
  return match[0];
}

function harness() {
  const data = new Map();
  const storage = {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{value:'',innerHTML:'',handlers:{},classList:{add(){},remove(){},toggle(){}},
      addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return this.controls || [];},querySelector(){return null;}});
    return elements.get(id);
  };
  const definitions = ['base-treatment-setting','base-disease-setting','breast-pathology-scope','breast-surgery-path','breast-genomic-assay','breast-oncotype-rs']
    .map(id=>({id,sourceTemplateKey:id,label:id,type:'single_select',options:['測試'],cancerId:'breast_cancer'}));
  const card = {id:'breast_cancer',zhName:'乳癌',enName:'Breast cancer',category:'乳癌',secondaryGuidelines:[],mustReadSections:[],externalLinks:[]};
  const state = {read:id=>caseState.read(id,storage),setValue:(id,key,value)=>caseState.setValue(id,key,value,storage),
    apply:(f,id)=>caseState.apply(f,id,storage),treatmentHistory:()=>[]};
  const context = vm.createContext({window:{CASE_STATE:state,CASE_WORKFLOW:workflow,
    CLINICAL_MATCHER:{resolveCaseContext:()=>({phase:'unknown'}),adjuvantAssessment:()=>({active:false})},
    CASE_REVIEW:{groupFields:f=>({entry:f.slice(0,2),relevant:f.slice(2),secondary:[]})},
    CLINICAL_SCENARIOS:{summarize:()=>({pass:0,total:0,attention:[]})}},
    sessionStorage:storage,localStorage:storage,routeParams:{cancerId:card.id},NCCN_GUIDELINES:[],
    dbGet:async()=>card,dbGetAll:async name=>name==='cancerCards'?[card]:name==='precisionFields'?definitions:[],dbPut:async()=>{},
    esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),jsStr:String,
    relatedCancerIds:id=>[id],nhiNotesForCancer:()=>[],isUsableNccnStructure:()=>false,nccnTreatmentDiagnosis:()=>({}),
    buildPfMap:()=>({}),renderNccnGuidelineLinks:()=>'',nccnGuidelineForDocument:()=>null,isStaleDoc:()=>false,
    renderCancerCardItem:c=>`<button>${c.zhName}</button>`,searchCards:cards=>cards,
    hasPfValue:f=>Array.isArray(f.value)?!!f.value.length:!!f.value,precisionOptionLabel:(_,x)=>x,
    document:{getElementById:element},fetch:()=>{throw new Error('UI must not auto-send data');},
    navigate:path=>{context.destination=path;},handleRoute:async()=>{context.rerenders=(context.rerenders||0)+1;}});
  vm.runInContext(fs.readFileSync('guideline-quality.js','utf8'),context);
  const queryHelpers = html.slice(html.indexOf('    const nhiQuerySessionKey'),html.indexOf('    const renderNhiQueryField'));
  vm.runInContext(queryHelpers + '\n' + source('getCasePrecisionFields',true) + source('resumeCaseQuery',true) + source('renderNhiQueryField',true)
    + source('renderCaseField') + source('renderCaseFocus') + source('renderNav') + source('renderCancerDetail') + source('renderHomePage')
    + '\nObject.assign(this, {resumeCaseQuery,writeNhiQueryState,readNhiQueryState});',context);
  const app = {innerHTML:''};
  return {context,app,element,state,definitions,card};
}

test('home renders query controls without the dashboard; data management retains it', async () => {
  const h = harness();
  await h.context.renderHomePage(h.app);
  assert.match(h.app.innerHTML,/搜尋癌別/);
  assert.doesNotMatch(h.app.innerHTML,/NCCN 指引品質總覽|本機 NCCN PDF/);
  await h.context.renderHomePage(h.app,true);
  assert.match(h.app.innerHTML,/NCCN 指引品質總覽/);
  assert.match(h.app.innerHTML,/文件庫|來源中心|備份／還原/);
  assert.doesNotMatch(h.app.innerHTML,/id="search-input"/);
});

test('production entry renders two questions, saves both, preserves focus and wires result navigation', async () => {
  const h = harness();
  await h.context.renderCancerDetail(h.app);
  assert.equal((h.app.innerHTML.match(/data-nhi-query-field=/g)||[]).length,2);
  assert.ok(h.app.innerHTML.indexOf('id="case-focus"') < h.app.innerHTML.indexOf('id="case-question-step"'));
  assert.match(h.app.innerHTML,/<details[^>]+id="case-all-fields">/);
  h.element('case-question-step').controls = h.definitions.slice(0,2).map((f,i)=>({dataset:{nhiQueryField:f.id},value:i?'初診局限':'術後／鞏固'}));
  h.element('case-focus').handlers.change({target:{value:'decision'}});
  assert.equal(h.state.read(h.card.id).__focus,'decision');
  assert.equal(h.state.read(h.card.id)['base-disease-setting'],'初診局限');
  await h.element('case-step-next').handlers.click();
  assert.equal(h.context.rerenders,1);
  assert.deepEqual(plain(h.state.read(h.card.id).__deferredQuestions),h.definitions.slice(0,2).map(f=>f.id));
  h.element('case-show-result').handlers.click();
  assert.equal(h.context.destination,'/cancer/breast_cancer/quickref');
});

test('return from results retains edits, explicit blanks and metadata without retaining stale query overlays', () => {
  const h = harness(), id = h.card.id;
  h.state.setValue(id,'__focus','decision');
  h.state.setValue(id,'base-disease-setting','初診局限');
  h.context.writeNhiQueryState(id,{fresh:false,values:{'base-disease-setting':'','breast-pathology-scope':'浸潤性乳癌'}});
  const merged = h.context.resumeCaseQuery(id,h.state.apply(h.definitions,id));
  assert.equal(merged.find(f=>f.id==='base-disease-setting').value,'');
  assert.equal(h.state.read(id)['breast-pathology-scope'],'浸潤性乳癌');
  assert.equal(h.state.read(id).__focus,'decision');
  assert.equal(h.state.read(id)['base-disease-setting'],undefined);
  assert.deepEqual(plain(h.context.readNhiQueryState(id)),{fresh:false,values:{}});
  h.context.writeNhiQueryState(id,{fresh:true,values:{}});
  h.context.resumeCaseQuery(id,h.state.apply(h.definitions,id));
  assert.deepEqual(plain(h.state.read(id)),{__focus:'decision'});
});

test('typed detail values save without blur or redraw and are flushed before results', async () => {
  const h = harness();
  await h.context.renderCancerDetail(h.app);
  h.element('case-question-step').controls = h.definitions.slice(0,2).map(f=>({dataset:{nhiQueryField:f.id},value:'尚未治療'}));
  const input={dataset:{caseTextField:'base-pathology'},value:'HER2 陽性'};
  h.element('case-all-fields').controls=[input];
  h.element('case-all-fields').handlers.input();
  assert.equal(h.state.read(h.card.id)['base-pathology'],'HER2 陽性');
  assert.equal(h.context.rerenders,undefined);
  input.value='HER2 IHC 3+';
  h.element('case-show-result').handlers.click();
  assert.equal(h.state.read(h.card.id)['base-pathology'],'HER2 IHC 3+');
  assert.equal(h.context.destination,'/cancer/breast_cancer/quickref');
  assert.match(h.context.renderCaseField({id:'text',type:'text',value:'',label:'診斷'}),/data-case-text-field/);
  assert.doesNotMatch(h.context.renderCaseField({id:'text',type:'text',value:'',label:'診斷'}),/_setPfValue/);
});

test('result keeps safety warnings outside collapsed evidence and requires consent for AI', () => {
  const result = source('renderQuickRef');
  assert.ok(result.indexOf('id="case-critical-warnings"') < result.indexOf('id="complete-case-evidence"'));
  assert.match(result,/<details[^>]+id="complete-case-evidence">/);
  assert.match(result,/sourcePages\.slice\(0, 2\)/);
  assert.match(result,/if \(aiPending \|\| !aiConsent\.checked/);
  assert.match(result,/activeAiSummary = disagreement \? null : summary/);
  assert.match(result,/summaryWarnings, \.\.\.\(summary\?\.uncertainties/);
  assert.match(result,/aiComparison\?\.uncertainties/);
  assert.match(result,/aiComparison\?\.missingInformation/);
  assert.match(result,/if \(sourceRoute\) lines\.push\('注意：' \+ sourceRoute\.limitation\)/);
});

test('source setup notice replaces misleading first-screen errors without weakening the AI gate', () => {
  const result = source('renderQuickRef');
  assert.match(result,/CASE_WORKFLOW\.sourceNotice/);
  assert.match(result,/sourceNotice \? sourceNotice\.headline/);
  assert.match(result,/sourceNotice \? sourceNotice\.next/);
  assert.match(result,/visibleQuestions = sourceNotice && !evidenceSelection\.conflicts\.length \? \[\] : keyQuestions/);
  assert.match(result,/aiPending \|\| !filledPf\.length \|\| !aiConsent\.checked \|\| aiEvidenceIssues\.length > 0/);
  assert.match(result,/esc\(aiEvidenceIssues\.join\(' '\)\)/);
  assert.match(result,/sourceSetupMessages\.includes\(issue\)/);
});

test('new result helper cannot load an older cached workflow module and is precached for offline use', () => {
  const version=fs.readFileSync('app-version.js','utf8').match(/ONCOLOGY_APP_VERSION = '([^']+)'/)[1];
  assert.ok(html.includes(`src="./case-workflow.js?v=${version}"`));
  assert.ok(fs.readFileSync('sw.js','utf8').includes('`./case-workflow.js?v=${globalThis.ONCOLOGY_APP_VERSION}`'));
});

test('full production result renders nine filled breast fields without a PDF and does not lose them', async () => {
  const stored = new Map(), elements = new Map();
  const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
  const app={innerHTML:'',querySelectorAll:()=>[]};
  const document={getElementById(id){
    if(!app.innerHTML.includes(`id="${id}"`))return null;
    if(!elements.has(id))elements.set(id,{checked:false,disabled:false,handlers:{},classList:{add(){},remove(){}},addEventListener(event,fn){this.handlers[event]=fn;}});
    return elements.get(id);
  }};
  const context=vm.createContext({document,navigator:{},sessionStorage:storage,localStorage:storage,TextEncoder,URL,console,
    addEventListener(){},fetch(){throw new Error('Rendering must not transmit case data');}});
  context.window=context;
  for(const match of html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"><\/script>/g)) {
    vm.runInContext(fs.readFileSync(match[1],'utf8'),context,{filename:match[1]});
  }
  // Synthetic regression data, not an export of a user's patient session.
  const fixture={'base-disease-setting':'局部晚期／不可切除','base-pathology':'合成測試資料','base-treatment-setting':'尚未治療',
    'breast-er':'陰性','breast-grade':'Grade 2','breast-her2':'IHC 3+','breast-pathology-scope':'浸潤性乳癌',
    'breast-subtype':'HER2+','breast-surgery-path':'尚未完成手術'};
  const definitions=context.CLINICAL_TEMPLATES.precisionForCancer('breast_cancer').map(f=>({...f,id:f.key,sourceTemplateKey:f.key,cancerId:'breast_cancer'}));
  const card={id:'breast_cancer',zhName:'乳癌',enName:'Breast cancer',primaryGuideline:'Breast Cancer',secondaryGuidelines:[],mustReadSections:[],externalLinks:[],reviewStatus:'待維護'};
  context.testGet=async()=>card;
  context.testGetAll=async store=>store==='precisionFields'?definitions:[];
  context.CASE_STATE.write(card.id,fixture);
  const before=storage.getItem(context.CASE_STATE.key(card.id));
  const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\n    init\(\);/,'');
  vm.runInContext(module+'\ndbGet=testGet;dbGetAll=testGetAll;routeParams={cancerId:"breast_cancer"};this.testRender=renderQuickRef;',context);
  await context.testRender(app);
  const summary=app.innerHTML.match(/<section[^>]+aria-labelledby="case-summary-title">([\s\S]*?)<\/section>/)[1];
  assert.match(summary,/已收到 9 項條件/);
  assert.match(summary,/不是已填資料遺失/);
  assert.match(summary,/IHC 3\+/);
  assert.match(summary,/ER：陰性/);
  assert.doesNotMatch(summary,/目前條件還不足以定位|來源頁數或傳送清單不完整/);
  assert.doesNotMatch(app.innerHTML,/aria-label="關鍵追問"/);
  assert.match(app.innerHTML,/來源頁數或傳送清單不完整/); // audit is retained
  assert.match(summary,/id="generate-ai-summary-btn" disabled/);
  document.getElementById('ai-consent').checked=true;
  document.getElementById('ai-consent').handlers.change();
  assert.equal(document.getElementById('generate-ai-summary-btn').disabled,true);
  await document.getElementById('generate-ai-summary-btn').handlers.click();
  assert.equal(storage.getItem(context.CASE_STATE.key(card.id)),before);
});

test('same-page edits preserve open evidence and field panels, but navigation does not carry them over', async () => {
  const sections = { 'case-all-fields': {open:false}, 'complete-case-evidence': {open:false} };
  const context = vm.createContext({currentRoute:'/cancer/breast_cancer',document:{scrollingElement:{scrollTop:25},
    querySelectorAll:()=>Object.keys(sections).map(id=>({id})),getElementById:id=>sections[id]},
    window:{scrollY:25,scrollTo(){},scrollBy(){}},setTimeout:()=>{},getHashPath:()=>context.targetPath,
    parseRoute:path=>{context.currentRoute=path;},render:async()=>{Object.values(sections).forEach(x=>x.open=false);}});
  vm.runInContext(source('handleRoute'),context);
  context.targetPath=context.currentRoute;
  await context.handleRoute({preserveScroll:true});
  assert.ok(Object.values(sections).every(x=>x.open));
  context.targetPath='/cancer/nsclc';
  await context.handleRoute({preserveScroll:true});
  assert.ok(Object.values(sections).every(x=>!x.open));
});
