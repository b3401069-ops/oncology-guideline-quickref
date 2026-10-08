(function () {
  'use strict';
  const get = (fields,key) => String((fields || []).find(f=>(f.sourceTemplateKey || f.key)===key)?.value ?? '');
  const rect = (kind,box,anchor) => ({kind,box,anchor});
  const textIn = (layout,box) => (Array.isArray(layout?.rows)?layout.rows:[]).map(row => {
    if(!Number.isFinite(row?.top)||row.top<box[1]||row.top>box[3]||!Array.isArray(row.items))return '';
    return row.items.filter(item=>Number.isFinite(item?.left)&&item.left>=box[0]&&item.left<=box[2]&&typeof item.text==='string').map(item=>item.text).join(' ');
  }).filter(Boolean).join('\n');
  function locate({cancerId,fields,context,page,version}) {
    const fallback = reason => ({status:'whole_page',reason,passages:[]});
    if(context?.phase!=='postoperative')return fallback('此病程尚無經定位的頁內分支，保留整頁核對。');
    if(page.sourceLayout?.version!==1)return fallback('缺少版面座標；重新解析可啟用已支援頁面的定位。');
    if(page.sourceLayout.rotation)return fallback('此 PDF 帶有旋轉頁面設定，保留整頁，不套用未校準的座標。');
    let id='',label='',boxes=[],anchors=[],alternatives=false;
    if(cancerId==='colon_cancer'&&version==='2.2026'&&page.sectionCode==='COL-4'&&page.page===13&&get(fields,'crc-mmr-msi')==='pMMR／MSS') {
      const t=get(fields,'colon-pt'),n=get(fields,'colon-pn');
      if(/^pT[123]$/.test(t)&&/^pN1/.test(n)){id='col4-low-iii';label='T1–3／N1 分支';boxes=[rect('branch',[.025,.429,.76,.538],/CAPEOX/)];anchors=[/low-risk stage III/];}
      else if((/^pT4/.test(t)&&/^pN[12]/.test(n))||(/^pT[1234]/.test(t)&&/^pN2/.test(n))){id='col4-high-iii';label='T4／N1–2 或任何 T／N2 分支';boxes=[rect('branch',[.025,.547,.76,.649],/FOLFOX/)];anchors=[/high-risk stage III/];}
      if(id)boxes.unshift(rect('heading',[.025,.14,.96,.228],/pMMR/));
      if(id)boxes.push(rect('footnotes',[.025,.65,.975,.902],/ctDNA/),rect('category',[.025,.915,.9,.94],/category 2A/));
    }
    if(cancerId==='breast_cancer'&&version==='5.2026'&&page.sectionCode==='BINV-6'&&page.page===19&&get(fields,'breast-menopause')==='停經後'&&get(fields,'breast-subtype')==='HR+/HER2-'&&/^先手術/.test(get(fields,'breast-surgery-path'))&&get(fields,'breast-chemotherapy-candidate')==='適合接受化療'&&/^pT(?:1[bcd]|[23])/.test(get(fields,'breast-pt'))&&/^pN(?:0|1)/.test(get(fields,'breast-pn'))) {
      const assay=get(fields,'breast-genomic-assay'),rs=get(fields,'breast-oncotype-rs');
      const known=assay==='Oncotype DX'&&/^\d+$/.test(rs)&&Number(rs)<=100;
      const low=get(fields,'breast-er').includes('低度陽性');
      id=known?Number(rs)>=26?'binv6-rs-high':'binv6-rs-low':'binv6-no-assay';
      label=known?`目前 RS ${rs} 對應分支`:'未完成檢測：保留內分泌與化療兩個可核對方向';alternatives=!known;
      anchors=[/POSTMENOPAUSAL/,/Recurrence/,/ER-low/];
      boxes=[rect('heading',[.025,.14,.89,.19],/HER2/),rect('condition',[.157,.355,.507,.53],/21-gene/),rect('branch',known?[.512,Number(rs)>=26?.418:.495,.61,Number(rs)>=26?.459:.532]:[.512,.359,.61,.385],known?/score/:/Not done/)];
      if(!known||Number(rs)>=26)boxes.push(rect('branch',[.605,.386,.846,.48],/Adjuvant chemo/));
      if(!known)boxes.push(rect('alternative',[.605,.287,.846,.361],/Adjuvant endocrine/));
      if(known&&Number(rs)<26)boxes.push(rect('branch',[.605,.479,.846,.554],/Adjuvant endocrine/));
      boxes.push(rect('footnotes',[.025,.655,.975,.903],/ER-low/),rect('category',[.025,.915,.9,.94],/category 2A/));
      if(low)label+='；ER-low 例外需個別核對，不能由 RS 分支單獨決定';
    }
    if(!id)return fallback('此頁或條件尚未建立可靠分支定位，保留完整原頁。');
    if(!anchors.every(re=>re.test(page.sourceText || '')))return fallback('原頁文字與已核對版型不一致，不套用座標。');
    const passages=boxes.map(region=>({kind:region.kind,box:region.box,text:textIn(page.sourceLayout,region.box),anchor:region.anchor}));
    if(passages.some(p=>!p.anchor.test(p.text)))return fallback('區塊文字未通過定位檢查，保留整頁。');
    return {status:'located',id,label,alternatives,reason:'版本、頁碼、標題及區塊文字已核對；未推定其他箭頭。',passages:passages.map(({anchor,...p})=>p)};
  }
  const validBox = box => Array.isArray(box)&&box.length===4&&box.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&box[0]<box[2]&&box[1]<box[3];
  const api={locate,textIn,validBox};
  if(typeof window!=='undefined')window.BRANCH_EVIDENCE=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
