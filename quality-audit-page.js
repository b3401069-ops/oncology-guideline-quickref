(() => {
  'use strict';

  const coverageLabels = {
    missing_pdf: '缺少目前版本 PDF',
    unparsed: 'PDF 尚未完成解析',
    no_treatment_options: '未擷取到治療選項',
    ready: '資料可用',
  };
  const scenarioLabels = {
    missing_pdf: '缺少 PDF', unparsed: '尚未解析', review: '結果需核對', pass: '通過',
  };

  function renderReviewRows(reviewAudit, docsById, helpers) {
    const { esc, jsStr } = helpers;
    return reviewAudit.items.map(item => {
      const linked = docsById.get(item.sourceDocumentId);
      const action = item.type === 'tfda_record'
        ? `<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="sessionStorage.setItem('quality-edit-tfda','${jsStr(item.id)}');navigate('/tfda')">直接核對 TFDA</button>`
        : item.type === 'nhi_record' && item.cancerId
          ? `<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="sessionStorage.setItem('quality-edit-nhi','${jsStr(item.id)}');navigate('/cancer/${jsStr(item.cancerId)}/nhi')">直接核對健保</button>`
          : linked?.storageKey
            ? `<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="openPdf('${jsStr(linked.storageKey)}', 1)">開啟 PDF</button>`
            : '<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="navigate(\'/pdf-library\')">前往文件庫</button>';
      return `<div class="list-item" style="align-items:flex-start;gap:8px">
        <div class="min-w-0 flex-1"><p class="text-sm font-semibold">${esc(item.title)}</p><p class="text-xs mt-1" style="color:var(--amber-700)">${esc(item.reasons.join('、'))}</p></div>${action}
      </div>`;
    }).join('');
  }

  function renderTreatmentRows(treatmentAudit, cards, docsById, helpers) {
    const { esc, jsStr, safePdfPage } = helpers;
    const cardName = id => cards.find(card => card.id === id)?.zhName || id;
    return treatmentAudit.attention.slice(0, 120).map(item => {
      const linked = docsById.get(item.sourceDocumentId);
      const status = item.status === 'unmapped' ? '名稱未辨識' : '已拆解，未連台灣資料';
      const detail = [
        item.cancerIds.map(cardName).join('、'), item.sectionCode || '',
        item.components.length ? '成分：' + item.components.join('、') : '',
      ].filter(Boolean).join(' · ');
      return `<div class="list-item" style="align-items:flex-start;gap:8px">
        <div class="min-w-0 flex-1"><p class="text-sm font-semibold" style="overflow-wrap:anywhere">${esc(item.label)}</p><p class="text-xs text-gray-500 mt-1">${esc(detail)}</p><span class="tag mt-1">${esc(status)}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="window._editDrugMapping('${jsStr(item.label)}')">修正名稱</button>
          ${linked?.storageKey ? `<button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="openPdf('${jsStr(linked.storageKey)}', ${safePdfPage(item.page || 1)})">PDF p.${safePdfPage(item.page || 1)}</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderDrugMappingRows(mappings, helpers) {
    const { esc, jsStr } = helpers;
    const kindLabel = { alias: '同義詞', regimen: '複方療程', ignore: '非藥物／忽略' };
    if (!mappings.length) return '<p class="text-xs text-gray-500 mt-3">尚未建立自訂名稱修正。</p>';
    return `<div class="mt-3 space-y-2">${mappings.map(mapping => {
      const detail = mapping.kind === 'regimen' ? (mapping.components || []).join(' + ')
        : mapping.kind === 'alias' ? mapping.canonicalName || '' : '不列入藥物對接稽核';
      return `<div class="list-item" style="gap:8px"><div class="min-w-0 flex-1"><p class="text-sm font-semibold" style="overflow-wrap:anywhere">${esc(mapping.term)}</p><p class="text-xs text-gray-500">${esc(kindLabel[mapping.kind] || mapping.kind)}${detail ? ' · ' + esc(detail) : ''}</p></div><button type="button" class="btn btn-ghost btn-sm text-red-500" style="width:auto" onclick="window._deleteDrugMapping('${jsStr(mapping.id)}')">刪除</button></div>`;
    }).join('')}</div>`;
  }

  function render(data, helpers) {
    const { cards, documents, drugMappings = [], cancerAudit, scenarioAudit, reviewAudit, treatmentAudit } = data;
    const { esc, jsStr, renderNav } = helpers;
    const docsById = new Map(documents.map(doc => [doc.id, doc]));
    const reviewRows = renderReviewRows(reviewAudit, docsById, helpers);
    const treatmentRows = renderTreatmentRows(treatmentAudit, cards, docsById, helpers);
    return `
      <div class="container">
        <div class="flex-between mb-4" style="gap:10px;align-items:flex-start">
          <div><button class="back-btn" onclick="navigate('/')">← 返回</button><h1 class="text-2xl font-bold">品質稽核</h1><p class="text-sm text-gray-500 mt-1">一次檢查 NCCN 路徑、待核對資料與療程名稱對接</p></div>
          <button type="button" class="btn btn-secondary btn-sm" id="rerun-quality-audit" style="width:auto;white-space:nowrap">重新稽核</button>
        </div>

        <div class="quality-grid mb-4">
          <div class="quality-stat"><strong>${cancerAudit.ready} / ${cancerAudit.total}</strong><span>癌別資料可用</span></div>
          <div class="quality-stat"><strong>${cancerAudit.withScenarios} / ${cancerAudit.total}</strong><span>已有標準情境</span></div>
          <div class="quality-stat"><strong>${scenarioAudit.pass} / ${scenarioAudit.total}</strong><span>既有情境工程比對通過</span></div>
          <div class="quality-stat"><strong>${reviewAudit.total}</strong><span>TFDA／健保待核對</span></div>
        </div>

        <div class="card mb-4">
          <div class="flex-between" style="gap:8px"><div><h2 class="font-semibold text-gray-800">全癌別資料與標準情境</h2><p class="text-xs text-gray-500 mt-1">以下為工程檢索檢查，不代表醫師已完成臨床驗收</p></div><span class="tag">${cancerAudit.attention.length + scenarioAudit.attention.length} 項</span></div>
          ${cancerAudit.attention.length ? `<details class="nhi-query-panel mt-3" open><summary class="text-sm font-semibold text-blue-700" style="cursor:pointer">資料需處理 · ${cancerAudit.attention.length}</summary><div class="mt-2 space-y-2">${cancerAudit.attention.map(item => `<div class="list-item"><div><p class="text-sm font-semibold">${esc(item.card.zhName)}</p><p class="text-xs text-gray-500">${esc(coverageLabels[item.status] || item.status)}</p></div><button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="navigate('/cancer/${jsStr(item.card.id)}')">開啟癌別</button></div>`).join('')}</div></details>` : '<div class="alert alert-success mt-3" style="margin-bottom:0">所有癌別皆有可用的本機治療索引。</div>'}
          ${scenarioAudit.attention.length ? `<details class="nhi-query-panel mt-3" open><summary class="text-sm font-semibold text-blue-700" style="cursor:pointer">臨床情境需核對 · ${scenarioAudit.attention.length}</summary><div class="mt-2 space-y-2">${scenarioAudit.attention.map(item => `<div class="list-item"><div><p class="text-sm font-semibold">${esc(item.scenario.label)}</p><p class="text-xs text-gray-500">${esc(scenarioLabels[item.status] || item.status)}${item.missing?.length ? ' · 缺少：' + esc(item.missing.join('、')) : ''}${item.violations?.length ? ' · 有 ' + item.violations.length + ' 項衝突候選' : ''}</p></div><button type="button" class="btn btn-ghost btn-sm" style="width:auto" onclick="navigate('/cancer/${jsStr(item.scenario.cancerId)}/quickref')">開啟查詢</button></div>`).join('')}</div></details>` : '<div class="alert alert-success mt-3" style="margin-bottom:0">所有已建立的標準臨床情境皆通過。</div>'}
          <details class="nhi-query-panel mt-3"><summary class="text-sm font-semibold text-blue-700" style="cursor:pointer">資料可用但尚無標準情境 · ${cancerAudit.withoutScenarios.length}</summary><p class="text-xs text-gray-500 mt-2">這些癌別可查 PDF 與療程索引，但尚未用固定病患情境驗證完整路徑。</p><div class="mt-2" style="display:flex;flex-wrap:wrap;gap:6px">${cancerAudit.withoutScenarios.map(item => `<button type="button" class="tag" style="border:none;cursor:pointer" onclick="navigate('/cancer/${jsStr(item.card.id)}')">${esc(item.card.zhName)}</button>`).join('')}</div></details>
        </div>

        <div class="card mb-4">
          <div class="flex-between" style="gap:8px"><div><h2 class="font-semibold text-gray-800">TFDA／健保待核對佇列</h2><p class="text-xs text-gray-500 mt-1">解析錯誤、缺癌別、缺許可證與截斷條文集中處理</p></div><span class="tag ${reviewAudit.total ? '' : 'tag-category'}">${reviewAudit.total} 項</span></div>
          ${reviewRows ? `<div class="mt-3 space-y-2">${reviewRows}</div>` : '<div class="alert alert-success mt-3" style="margin-bottom:0">目前沒有待核對的 TFDA 或健保自動擷取資料。</div>'}
        </div>

        <div class="card mb-6">
          <div class="flex-between" style="gap:8px"><div><h2 class="font-semibold text-gray-800">療程名稱與台灣資料對接</h2><p class="text-xs text-gray-500 mt-1">未連結不代表未核准或未給付，只表示本機資料尚未對應</p></div><span class="tag">${treatmentAudit.linked} / ${treatmentAudit.total}</span></div>
          <div class="quality-grid mt-3">
            <div class="quality-stat"><strong>${treatmentAudit.linked}</strong><span>已連 TFDA／健保</span></div>
            <div class="quality-stat"><strong>${treatmentAudit.vocabularyOnly}</strong><span>已拆解療程成分</span></div>
            <div class="quality-stat"><strong>${treatmentAudit.unmapped}</strong><span>名稱尚未辨識</span></div>
            <div class="quality-stat"><strong>${treatmentAudit.total}</strong><span>具名藥物／療程</span></div>
          </div>
          <details class="nhi-query-panel mt-3" id="drug-mapping-panel">
            <summary class="text-sm font-semibold text-blue-700" style="cursor:pointer">自訂療程名稱修正 · ${drugMappings.length}</summary>
            <div class="mt-3" id="drug-mapping-editor">
              <input type="hidden" id="drug-mapping-id">
              <div class="form-group"><label class="label">NCCN 擷取名稱</label><input class="input" id="drug-mapping-term" placeholder="點下方「修正名稱」會自動帶入"></div>
              <div class="form-group"><label class="label">處理方式</label><select class="input" id="drug-mapping-kind"><option value="regimen">複方療程：拆成多個成分</option><option value="alias">同義詞：對應到標準學名</option><option value="ignore">非藥物／不需對接</option></select></div>
              <div class="form-group hidden" id="drug-mapping-canonical-group"><label class="label">標準學名</label><input class="input" id="drug-mapping-canonical" placeholder="例如 trastuzumab deruxtecan"></div>
              <div class="form-group" id="drug-mapping-components-group"><label class="label">療程成分（每行一項）</label><textarea class="input" id="drug-mapping-components" rows="4" placeholder="例如：&#10;fluorouracil&#10;oxaliplatin"></textarea></div>
              <div class="flex gap-2"><button type="button" class="btn btn-primary flex-1" id="drug-mapping-save">儲存修正</button><button type="button" class="btn btn-secondary flex-1" id="drug-mapping-cancel">清空</button></div>
              <p class="text-xs text-gray-500 mt-2">「非藥物／不需對接」只會從名稱稽核排除，不會刪除 NCCN 原始治療頁或 PDF。</p>
            </div>
            ${renderDrugMappingRows(drugMappings, helpers)}
          </details>
          ${treatmentRows ? `<div class="mt-3 space-y-2">${treatmentRows}${treatmentAudit.attention.length > 120 ? `<p class="text-xs text-gray-500">另有 ${treatmentAudit.attention.length - 120} 項；先處理前 120 項後重新稽核。</p>` : ''}</div>` : '<div class="alert alert-success mt-3" style="margin-bottom:0">目前具名療程皆已連結至少一筆 TFDA 或健保資料。</div>'}
        </div>
        ${renderNav('')}
      </div>`;
  }

  globalThis.QUALITY_AUDIT_PAGE = Object.freeze({ render });
})();
