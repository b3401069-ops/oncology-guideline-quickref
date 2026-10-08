(function () {
  'use strict';
  const breast={'base-disease-setting':'初診局限','base-treatment-setting':'術後／鞏固','breast-pathology-scope':'浸潤性乳癌','breast-surgery-path':'先手術（未接受術前全身治療）','breast-pt':'pT2','breast-pn':'pN1（1–3 顆陽性）','breast-er':'低度陽性（1–10%）','breast-pr':'陰性','breast-her2':'IHC 2+／ISH 陰性','breast-subtype':'HR+/HER2-','breast-menopause':'停經後','breast-grade':'Grade 3','breast-lvi':'有','breast-tumor-size-cm':'3','breast-ki67':'35','breast-chemotherapy-candidate':'適合接受化療','breast-genomic-assay':'未評估','breast-oncotype-rs':''};
  const colon={'base-treatment-setting':'術後／鞏固','colon-surgery-path':'先手術（未接受術前全身治療）','colon-path-stage':'IIIB','colon-pt':'pT3','colon-pn':'pN1','colon-margin':'R0（陰性）','crc-mmr-msi':'pMMR／MSS'};
  // Manually specified source expectations, not generated from matcher outputs.
  // All entries start pending clinical review; passing code cannot promote them.
  const cases=[
    {id:'breast-erlow',revision:1,label:'乳癌 ER-low／pT2N1／未評估基因表現',cancerId:'breast_cancer',document:'Breast Cancer',version:'5.2026',fields:breast,expected:['BINV-6|19','BINV-M|72'],forbidden:['BINV-4|17','BINV-7|20','BINV-8|21','BINV-M|71'],blocked:false,notes:'原使用者案例的來源預期；不將未知 RS 解讀為 0。'},
    {id:'breast-receptor-conflict',revision:1,label:'乳癌 HR+/HER2- 與 IHC 3+ 衝突：應停止',cancerId:'breast_cancer',document:'Breast Cancer',version:'5.2026',fields:{...breast,'breast-her2':'IHC 3+'},expected:[],forbidden:['BINV-6|19','BINV-M|72'],blocked:true,notes:'矛盾資料不應產生可用治療來源包。'},
    {id:'nsclc-egfr-ib',revision:1,label:'NSCLC IB／EGFR：主頁＋必要腳註＋適用條件',cancerId:'nsclc',document:'Non-Small Cell Lung Cancer',version:'6.2026',fields:{'base-treatment-setting':'術後／鞏固','nsclc-surgery-path':'先手術（未接受術前全身治療）','nsclc-path-stage':'IB','nsclc-pt':'pT2a','nsclc-pn':'pN0','nsclc-margin':'R0（陰性）','nsclc-high-risk':['無上述特徵'],'nsclc-drivers':['EGFR exon 19 deletion']},expected:['NSCL-4|29','NSCL-4A|30','NSCL-E|93'],forbidden:['NSCL-E|92'],blocked:false,notes:'定位來源不代表已滿足 Osimertinib 的既往治療資格；應另外檢查治療歷程。'},
    {id:'colon-low-iii',revision:1,label:'結腸癌 pMMR／pT3N1：低風險 III 期來源',cancerId:'colon_cancer',document:'Colon Cancer',version:'2.2026',fields:colon,expected:['COL-4|13'],forbidden:['COL-13|22'],blocked:false,notes:'需定位 COL-4 低風險 III 期列，保留原頁腳註；不借用其他列的療程長度。'},
    {id:'colon-high-iii',revision:1,label:'結腸癌 pMMR／pT4aN1：同頁高風險 III 期',cancerId:'colon_cancer',document:'Colon Cancer',version:'2.2026',fields:{...colon,'colon-pt':'pT4a'},expected:['COL-4|13'],forbidden:['COL-13|22'],blocked:false,notes:'與 pT3N1 同頁、不同列；頁碼相同不能當作頁內分支已正確。'},
    {id:'rectal-tnt',revision:1,label:'直腸癌完成 TNT 後手術：不混入非手術追蹤頁',cancerId:'rectal_cancer',document:'Rectal Cancer',version:'2.2026',fields:{'base-treatment-setting':'術後／鞏固','rectal-surgery-path':'完成 TNT 後手術','rectal-path-stage':'IIA','rectal-pt':'ypT3','rectal-pn':'ypN0','rectal-margin':'陰性','rectal-crm':'陰性／未受威脅','crc-mmr-msi':'pMMR／MSS'},expected:['REC-6|17','REC-10|21'],forbidden:['REC-10A|22'],blocked:false,notes:'手術後與非手術管理的追蹤來源需分開；本案例不自動建立新增化療資格。'},
  ];
  const key=pair=>`${pair.page.sectionCode}|${pair.page.page}`;
  const storageKey='oncology-reference-reviews:v1';
  function run(example,documents,matcher,review) {
    const docs=documents.filter(d=>String(d.title || '').toLowerCase()===example.document.toLowerCase()&&!d.archived&&d.current!==false);
    const fields=Object.entries(example.fields).map(([sourceTemplateKey,value])=>({id:sourceTemplateKey,sourceTemplateKey,label:sourceTemplateKey,value}));
    const sourceReady=docs.length===1&&docs[0].nccnStructure?.version===example.version&&/^[a-f0-9]{64}$/.test(docs[0].nccnStructure?.sourceSha256 || '');
    const context=matcher.resolveCaseContext(fields),assessment=matcher.adjuvantAssessment(example.cancerId,docs,fields,[]);
    const selection=review.selectEvidence(example.cancerId,assessment,matcher.matchTreatmentPages(docs,fields,Infinity),context);
    const actual=[...new Set(selection.evidencePages.map(key))];
    const missing=example.expected.filter(x=>!actual.includes(x)),unexpected=actual.filter(x=>!example.expected.includes(x));
    const forbidden=actual.filter(x=>example.forbidden.includes(x));
    const engineeringPassed=sourceReady&&!missing.length&&!unexpected.length&&!forbidden.length&&selection.blocked===example.blocked;
    const binding=JSON.stringify({example,source:docs.map(d=>d.nccnStructure?.sourceSha256 || '')});
    return {example,docs,fields,actual,missing,unexpected,forbidden,sourceReady,engineeringPassed,blocked:selection.blocked,binding};
  }
  function readReviews(storage) {try {const v=JSON.parse(storage.getItem(storageKey)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
  function reviewState(result,reviews) {
    const item=reviews[result.example.id];
    if(!item)return 'pending';
    if(item.binding!==result.binding)return 'stale';
    return item.status==='confirmed'&&result.sourceReady&&item.attested&&item.reviewer&&item.note ? 'confirmed':item.status==='needs_change'?'needs_change':'pending';
  }
  function saveReview(result,form,storage) {
    if(!['confirmed','needs_change'].includes(form.status)||!form.reviewer?.trim()||!form.note?.trim()||!form.attested)throw new Error('請填覆核者、註記，並確認已核對原頁。');
    if(form.status==='confirmed'&&!result.engineeringPassed)throw new Error('來源缺漏或程式比對未通過，不能記為確認。');
    const reviews=readReviews(storage);
    reviews[result.example.id]={status:form.status,reviewer:form.reviewer.trim().slice(0,80),note:form.note.trim().slice(0,500),attested:true,binding:result.binding,at:new Date().toISOString()};
    storage.setItem(storageKey,JSON.stringify(reviews));return reviews;
  }
  function metrics(results,reviews) {
    const confirmed=results.filter(r=>reviewState(r,reviews)==='confirmed');
    const denominator=confirmed.reduce((n,r)=>n+r.example.expected.length,0);
    return {total:results.length,engineeringPassed:results.filter(r=>r.engineeringPassed).length,confirmed:confirmed.length,
      clinicalMissingRate:denominator?confirmed.reduce((n,r)=>n+r.missing.length,0)/denominator:null,
      confirmedExtraPages:confirmed.reduce((n,r)=>n+r.unexpected.length,0),
      confirmedForbiddenPages:confirmed.reduce((n,r)=>n+r.forbidden.length,0),
      confirmedRegressionFailures:confirmed.filter(r=>!r.engineeringPassed).length,
      pending:results.length-confirmed.length};
  }
  function render(results,reviews,{esc,jsStr}) {
    const m=metrics(results,reviews),labels={pending:'待醫師覆核',stale:'來源／案例已變，需重新覆核',confirmed:'已由具名覆核者確認',needs_change:'覆核者要求調整'};
    return `<section class="card mb-4" id="reference-case-audit"><h2 class="text-lg font-bold">標準案例與人工覆核</h2>
      <p class="text-sm mt-2">工程比對 ${m.engineeringPassed}/${m.total}；具名確認 ${m.confirmed}/${m.total}。未確認案例不納入臨床來源漏頁率。</p>
      <p class="text-xs text-gray-500 mt-2">${m.clinicalMissingRate===null?'臨床來源漏頁率：尚無可計算的已覆核樣本。':`已覆核樣本漏頁率：${(m.clinicalMissingRate*100).toFixed(1)}%；多選 ${m.confirmedExtraPages} 頁、禁用頁 ${m.confirmedForbiddenPages} 頁、回歸失敗 ${m.confirmedRegressionFailures} 例。`} 這不是治療正確率；人工紀錄為本機具名自述，不是外部獨立認證。</p>
      <button type="button" class="btn btn-secondary btn-sm mt-3" id="export-reference-cases">匯出案例與覆核紀錄</button>
      ${results.map(result=>{const e=result.example,record=reviews[e.id],state=reviewState(result,reviews);return `<details class="result-disclosure mt-3"><summary>${esc(e.label)} · ${result.engineeringPassed?'工程通過':'工程待處理'} · ${esc(labels[state])}</summary><div class="result-disclosure-body">
        <p class="text-xs">${esc(e.document)} v${esc(e.version)} · ${result.sourceReady?'PDF 版本及指紋已綁定':'缺少唯一同版本 PDF／指紋，請匯入或重新解析'}</p>
        <p class="text-sm mt-2">${esc(e.notes)}</p><p class="text-xs mt-2">預期（含必要腳註）：${esc(e.expected.join('、')||'無可用來源')}；應停止：${e.blocked?'是':'否'}</p>
        <p class="text-xs mt-1">實際：${esc(result.actual.join('、')||'無')}；實際停止：${result.blocked?'是':'否'}</p><p class="text-xs mt-1">漏頁：${esc(result.missing.join('、')||'無')}；多選：${esc(result.unexpected.join('、')||'無')}；命中禁用頁：${esc(result.forbidden.join('、')||'無')}</p>
        <div class="mt-2">${result.docs.length===1&&result.docs[0].storageKey?e.expected.map(ref=>`<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="openPdf('${jsStr(result.docs[0].storageKey)}',${Number(ref.split('|')[1])})">核對 ${esc(ref)}</button>`).join(''):''}</div>
        <details class="mt-2"><summary class="text-xs">查看固定測試病況（不覆蓋目前個案）</summary><ul class="text-xs mt-2">${Object.entries(e.fields).map(([k,v])=>`<li>${esc(k)}：${esc([].concat(v).join('、')||'未填')}</li>`).join('')}</ul></details>
        ${record?`<p class="text-xs mt-2">既有紀錄：${esc(record.reviewer)} · ${esc(record.at)} · ${esc(record.note)}</p>`:''}
        <form data-reference-review="${esc(e.id)}" class="mt-3"><label class="label">覆核者<input class="input" name="reviewer" maxlength="80" required autocomplete="off"></label><label class="label mt-2">原頁核對與判斷註記<textarea class="input" name="note" maxlength="500" required></textarea></label>
        <label class="label mt-2">覆核結果<select class="input" name="status"><option value="needs_change">需要調整</option><option value="confirmed" ${result.engineeringPassed?'':'disabled'}>確認此案例來源預期</option></select></label>
        <label class="text-xs mt-2" style="display:block"><input type="checkbox" name="attested" required> 我已核對原頁分支、例外、腳註及停止條件；不是只看程式通過。</label><button class="btn btn-secondary btn-sm mt-2" type="submit">儲存本機覆核紀錄</button></form>
      </div></details>`;}).join('')}</section>`;
  }
  function exportReport(results,reviews) {
    return {schemaVersion:1,createdAt:new Date().toISOString(),scope:'固定去識別化測試案例；不包含目前病人工作階段、PDF 原檔或 API key',metrics:metrics(results,reviews),cases:results.map(({docs,fields,...r})=>({...r,sourceFingerprints:docs.map(d=>d.nccnStructure?.sourceSha256||'')})),reviews};
  }
  const api={cases,run,readReviews,reviewState,saveReview,metrics,render,exportReport};
  if(typeof window!=='undefined')window.REFERENCE_CASES=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
