(function () {
  'use strict';
  const values = (fields, key) => [].concat((fields || []).find(f => (f.sourceTemplateKey || f.key) === key)?.value ?? []).map(String);
  const value = (fields, key) => values(fields, key).join('、').trim();
  const unknown = text => !text || /待檢|待確認|未評估|未檢|未輸入/.test(text);
  const number = text => !text || !/^\d+(?:\.\d+)?$/.test(text) ? null : Number(text);
  const focusOptions = [{id:'overview',label:'整體方向'}, {id:'decision',label:'是否需要本次治療'}, {id:'regimen',label:'選擇療程'}, {id:'eligibility',label:'標靶／免疫適用條件'}];
  const priorities = {
    breast_cancer: ['breast-pathology-scope','breast-surgery-path','breast-subtype','breast-her2','breast-er','breast-menopause','breast-pt','breast-pn','breast-chemotherapy-candidate'],
    nsclc: ['nsclc-surgery-path','nsclc-path-stage','nsclc-drivers','nsclc-margin','nsclc-histology','nsclc-cisplatin'],
    colon_cancer: ['crc-mmr-msi','colon-surgery-path','colon-pt','colon-pn','colon-margin'],
    rectal_cancer: ['rectal-surgery-path','crc-mmr-msi','rectal-pt','rectal-pn','rectal-margin','rectal-crm'],
  };
  function questions({cancerId, fields, context, assessment = {}, diagnosis = {}}) {
    if (context.conflicts?.length) return ['base-disease-setting','base-treatment-setting'].map(key => fields.find(f => f.sourceTemplateKey === key))
      .filter(Boolean).map(field => ({field, reason:'目前病程與治療目的有矛盾；先確認此項，避免套錯分支。'}));
    const cancerKeys = context.phase==='postoperative' || context.phase==='unknown' ? priorities[cancerId] || [] :
      ({breast_cancer:['breast-subtype','breast-her2','breast-er','breast-advanced-alterations'],nsclc:['nsclc-histology','nsclc-drivers','nsclc-pdl1-tps'],colon_cancer:['crc-mmr-msi'],rectal_cancer:['crc-mmr-msi']}[cancerId] || []);
    const ranked = ['base-treatment-setting','base-disease-setting', ...cancerKeys];
    const missingLabels = new Set(assessment.missing || []);
    // Resolve recorded pathology gaps before an assay question that those facts may make unnecessary.
    ranked.push(...fields.filter(f=>missingLabels.has(f.label)).map(f=>f.sourceTemplateKey));
    if(cancerId==='breast_cancer' && [...missingLabels].some(label=>/基因表現/.test(label)))ranked.push('breast-genomic-assay','breast-oncotype-rs');
    const needsAnswer=field=>unknown(value([field],field.sourceTemplateKey || field.key)) || (field.sourceTemplateKey==='breast-oncotype-rs' && !/^(?:100|[1-9]?\d)$/.test(value([field],field.sourceTemplateKey)));
    const candidates = fields.filter(field => needsAnswer(field) &&
      (ranked.includes(field.sourceTemplateKey) || missingLabels.has(field.label) || (!assessment.active && diagnosis.suggestedFields?.some(f=>f.id===field.id))) &&
      (field.sourceTemplateKey !== 'breast-oncotype-rs' || value(fields,'breast-genomic-assay') === 'Oncotype DX'));
    return candidates.sort((a,b) => {
      const rank = f => ranked.indexOf(f.sourceTemplateKey) < 0 ? 100 : ranked.indexOf(f.sourceTemplateKey);
      return rank(a)-rank(b);
    }).slice(0,2).map(field=>({field,reason: ['base-treatment-setting','base-disease-setting'].includes(field.sourceTemplateKey) ? '決定本次使用術前、術後、晚期或追蹤路徑。' : '此條件會改變本次來源分支或療程適用性；其餘欄位可稍後補。'}));
  }
  function focusSelection(assessment, matches, focus, {cancerId,fields=[]}={}) {
    if (!focusOptions.some(x=>x.id===focus)) focus='overview';
    if(focus==='eligibility' && cancerId==='breast_cancer' && assessment.active && value(fields,'breast-menopause')==='停經後') {
      const docs=[...new Set((assessment.pages || []).map(p=>p.doc))];
      const extras=docs.flatMap(doc=>doc.nccnStructure?.version==='5.2026' ? (doc.nccnStructure.sections || []).filter(p=>(p.code || p.sectionCode)==='BINV-K'&&p.page===68&&!p.updatePage&&!p.navigationPage).map(page=>({doc,page:{...page,sectionCode:'BINV-K'},role:'eligibility'})) : []);
      return {assessment:{...assessment,supportingPages:[...(assessment.supportingPages || []),...extras]},matches,deferred:[]};
    }
    if (focus==='overview' || focus==='regimen' || focus==='eligibility') return {assessment,matches,deferred:[]};
    const keep = item => assessment.active ? (assessment.pages || []).some(p=>p.doc===item.doc && p.page.page===item.page.page) : ['pathway','workup'].includes(item.page.role);
    return {assessment:{...assessment,supportingPages:[],decision:assessment.decision ? {...assessment.decision,regimens:[]} : assessment.decision},matches:matches.filter(keep),deferred:matches.filter(x=>!keep(x))};
  }
  const rule = (id,label,aliases,source,check) => ({id,label,aliases,source,check});
  const check = (label,state,detail='') => ({label,status:state===null ? 'missing' : state ? 'met':'unmet',detail});
  const matches = (fields,key,re) => {const v=value(fields,key);return unknown(v) ? null : re.test(v);};
  function marker(fields,key,positive,negative) {
    const v=value(fields,key); if(unknown(v)) return null;
    if(positive.test(v)&&negative.test(v))return null;
    if(positive.test(v)) return /陰性|negative/i.test(v)?null:true;
    if(negative.test(v)) return false;
    return null;
  }
  const stage = fields => {const v=value(fields,'nsclc-path-stage'); return unknown(v)?null:/^(IB|IIA|IIB|IIIA)$/.test(v)?true:/^IIIB/.test(v)?null:false;};
  const burden = fields => {const n=value(fields,'nsclc-pn'),size=number(value(fields,'nsclc-tumor-size-cm'));return /^(?:p|yp)N[123]/.test(n)||size>=4 ? true : unknown(n)||size===null ? null:false;};
  const completedChemo = history => (history || []).some(x=>/術後|輔助/.test(x.phase || '') && !/術前|新輔助/.test(x.phase || '') && x.status==='已完成' && /cisplatin|carboplatin|含鉑/i.test(x.treatment || '') &&
    !(number(String(x.plannedCycles || ''))!==null && (number(String(x.completedCycles || ''))===null || Number(x.completedCycles)<Number(x.plannedCycles))));
  const lungSource = {code:'NSCL-E',version:'6.2026',page:93};
  const breastSource = {code:'BINV-K',version:'5.2026'};
  const lungBase = f => [check('適用分期（IIIB 特殊 T/N 需另核對）',stage(f)),check('目前支援先手術資格分支',/^先手術/.test(value(f,'nsclc-surgery-path'))?true:null,'術前治療後的其他合法分支尚未編碼，不能判為不適用。')];
  const noDrivers = f => {
    const list=values(f,'nsclc-drivers');
    if(!list.length || list.some(unknown))return null;
    const positive=list.some(v=>/EGFR.*(?:exon|L858R|sensitizing)|ALK fusion/i.test(v));
    const negative=list.includes('無已知可標靶變異');
    if(positive&&negative)return null;
    return positive?false:negative?true:null;
  };
  const breastBase = f => [check('HR-positive／HER2-negative',matches(f,'breast-subtype',/^HR\+\/HER2-$/)),check('浸潤性乳癌',matches(f,'breast-pathology-scope',/^浸潤性/))];
  const rules = [
    rule('osimertinib','Osimertinib',/osimertinib|泰格莎/i,{...lungSource,anchors:[/EGFR/,/L858R/,/previous adjuvant chemotherapy/i]},(f,h)=>[...lungBase(f),check('EGFR exon 19 deletion／L858R',marker(f,'nsclc-drivers',/EGFR.*(?:exon 19|L858R)/i,/ALK|ROS1|RET|無已知|EGFR.*陰性/i)),check('已完成術後含鉑化療，或需另確認不適合所有含鉑化療',completedChemo(h)?true:null,'不適合 cisplatin 不等於不適合所有 platinum。')]),
    rule('alectinib','Alectinib',/alectinib|安立適/i,{...lungSource,anchors:[/Alectinib/,/ALK/,/node-positive/i]},f=>[...lungBase(f),check('ALK fusion',marker(f,'nsclc-drivers',/ALK fusion/i,/EGFR|ROS1|RET|無已知|ALK.*陰性/i)),check('腫瘤 ≥4 cm 或淋巴結陽性',burden(f))]),
    rule('atezolizumab','Atezolizumab',/atezolizumab|癌自禦/i,{...lungSource,anchors:[/Atezolizumab/,/PD-L1/,/previous adjuvant/i]},(f,h)=>[...lungBase(f),check('無已知 EGFR／ALK',noDrivers(f)),check('腫瘤 ≥4 cm 或淋巴結陽性',burden(f)),check('已完成術後含鉑化療',completedChemo(h)?true:null),check('PD-L1 TPS ≥1%',number(value(f,'nsclc-pdl1-tps'))===null?null:Number(value(f,'nsclc-pdl1-tps'))>=1)]),
    rule('pembrolizumab','Pembrolizumab',/pembrolizumab|吉舒達/i,{...lungSource,anchors:[/Pembrolizumab/,/previous adjuvant/,/no known EGFR/]},(f,h)=>[...lungBase(f),check('無已知 EGFR／ALK',noDrivers(f)),check('腫瘤 ≥4 cm 或淋巴結陽性',burden(f)),check('已完成術後含鉑化療',completedChemo(h)?true:null)]),
    rule('abemaciclib','Abemaciclib',/abemaciclib|捷癌寧/i,{...breastSource,anchors:[/abemaciclib/i,/grade 3/i,/positive lymph nodes/i]},f=>{const n=value(f,'breast-pn'),g=value(f,'breast-grade'),s=number(value(f,'breast-tumor-size-cm'));return [...breastBase(f),check('≥4 顆陽性，或 1–3 顆且 Grade 3／腫瘤 ≥5 cm',/^pN2（4–9 顆陽性）$/.test(n)?true:/^(?:p|yp)N[23]/.test(n)?null:/^(?:p|yp)N1(?!mi)/.test(n)?/Grade 3/.test(g)||s>=5?true:unknown(g)||s===null?null:false:unknown(n)?null:false,'ypN2／N3 特殊淋巴結範圍不能直接換算陽性顆數。')];}),
    rule('ribociclib','Ribociclib',/ribociclib|擊癌利/i,{...breastSource,anchors:[/ribociclib/i,/microscopic/i,/Ki-67/]},f=>{const n=value(f,'breast-pn'),s=number(value(f,'breast-tumor-size-cm')),g=value(f,'breast-grade'),ki=number(value(f,'breast-ki67'));let risk=null;
      if(/^(?:p|yp)N[123](?!mi)/.test(n))risk=true;else if(/N1mi/.test(n))risk=false;else if(/N0/.test(n)&&s!==null)risk=s>5?true:s>=2&&s<=5?/Grade 3/.test(g)?true:/Grade 2/.test(g)&&ki!==null&&ki>=20?true:null:false;
      return [...breastBase(f),check('非微轉移淋巴結陽性或原頁指定 node-negative 高風險條件',risk,'Grade 2 且 Ki-67 未達門檻時，仍需核對基因風險，不能當作不符合。')];}),
    rule('olaparib','Olaparib',/olaparib|令癌莎/i,{code:'BINV-L',version:'5.2026',anchors:[/olaparib/i]},()=>[check('完整高風險、胚系 BRCA 與既往治療資格',null,'目前未建立完整可執行資格規則，須核對原頁。')]),
  ];
  function eligibility({cancerId,fields,context,evidence=[],history=[]}) {
    if(context?.phase!=='postoperative')return [];
    return rules.filter(r=>cancerId==='nsclc'?['osimertinib','alectinib','atezolizumab','pembrolizumab'].includes(r.id):cancerId==='breast_cancer'?['abemaciclib','ribociclib','olaparib'].includes(r.id):false).map(r=>{
      const sources=evidence.filter(p=>p.sectionCode===r.source.code&&p.version===r.source.version&&(!r.source.page||p.page===r.source.page)&&p.contextComplete&&!p.truncated&&r.source.anchors.every(re=>re.test(p.pageText || '')));
      const invalidPercent=['nsclc-pdl1-tps','breast-ki67'].some(k=>{const v=value(fields,k),n=number(v);return !unknown(v)&&(n===null||n>100);});
      const receptorConflict=cancerId==='breast_cancer' && value(fields,'breast-subtype')==='HR+/HER2-' && /IHC 3\+|ISH 陽性/.test(value(fields,'breast-her2'));
      const checks=[check('同版本必要適用條件原頁',sources.length>0?true:null),...r.check(fields,history)];
      if(context.conflicts?.length || receptorConflict || invalidPercent)checks.push(check('先修正矛盾或超出範圍的輸入',null));
      return {id:r.id,label:r.label,status:checks.some(x=>x.status==='unmet')?'unmet':checks.some(x=>x.status==='missing')?'missing':'met',checks,sourceReferences:sources.map(p=>p.reference),requiredSource:r.source.code,
        limitation:'僅核對已編碼且已記錄的條件；不代表完整適用、處方核准或健保給付，仍需核對禁忌、共病與原頁。'};
    });
  }
  function fromPayload(input) {return eligibility({cancerId:input.cancer?.id,fields:input.caseFields || [],context:input.context,evidence:input.evidence || [],history:input.treatmentHistory || []});}
  function statementAllowed(statement,input) {
    const checks=fromPayload(input);
    return !rules.some(r=>r.aliases.test(statement) && checks.some(c=>c.id===r.id && c.status!=='met'));
  }
  const api={focusOptions,questions,focusSelection,eligibility,fromPayload,statementAllowed};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.CASE_WORKFLOW=api;
})();
