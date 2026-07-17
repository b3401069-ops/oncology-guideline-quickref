(function () {
  const RELATED_CARD_IDS = {
    colorectal_cancer: ['colon_cancer', 'rectal_cancer'],
  };

  const GENERAL_NOTE_LABEL = /^(?:完整限制條件清單|給付線數限制|治療線別限制|比對健保給付規定|自費討論|事前審查(?:條件)?|尚待核對最新給付規定)$/;
  const REGIMEN_COMPONENTS = {
    folfiri: ['fluorouracil', 'leucovorin', 'irinotecan'],
    folfox: ['fluorouracil', 'leucovorin', 'oxaliplatin'],
    folfoxiri: ['fluorouracil', 'leucovorin', 'oxaliplatin', 'irinotecan'],
    capox: ['capecitabine', 'oxaliplatin'],
    capeox: ['capecitabine', 'oxaliplatin'],
  };
  const MATCH_LEVEL_RANK = { none: 0, similar: 1, component: 2, exact: 3 };
  const MATCH_LEVEL_LABELS = {
    exact: '完整療程相符',
    component: '單一成分有相關規定',
    similar: '名稱相似，需核對',
    none: '尚未找到同名健保資料',
  };

  function notesForCancer(notes, cancerId) {
    const accepted = new Set([cancerId, ...(RELATED_CARD_IDS[cancerId] || [])]);
    return (notes || []).filter(note => accepted.has(note.cancerId) && (window.NHI_VERSIONING?.isActive(note) ?? (note.archived !== true && note.current !== false)));
  }

  function isGeneralNote(entry) {
    const note = entry?.n || entry;
    return !note?.autoExtracted && GENERAL_NOTE_LABEL.test(String(note?.label || '').trim());
  }

  function normalizeTreatmentName(value) {
    return String(value || '')
      .normalize('NFKC').toLowerCase()
      .replace(/\(\s*category\s+[12](?:a|b)?\s*\)/gi, '')
      .replace(/[®™]/g, '')
      .replace(/\b(?:and|or|with)\b/g, ' ')
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function strongestMatchLevel(levels) {
    return [...levels].sort((a, b) => (MATCH_LEVEL_RANK[b] || 0) - (MATCH_LEVEL_RANK[a] || 0))[0] || 'none';
  }

  function groupTreatments(entries) {
    const groups = new Map();
    for (const entry of entries || []) {
      if (isGeneralNote(entry)) continue;
      const label = String(entry.n?.label || '').trim() || '未命名藥物／療程';
      const key = normalizeTreatmentName(label);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { key, label, entries: [], nhiMatchLevel: 'exact' });
      groups.get(key).entries.push({ ...entry, nhiMatchLevel: entry.nhiMatchLevel || 'exact' });
    }
    return [...groups.values()];
  }

  function labelsOverlap(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) < 4) return false;
    return (` ${left} `).includes(` ${right} `) || (` ${right} `).includes(` ${left} `);
  }

  function treatmentMatchLevel(treatmentKey, groupKey) {
    if (!treatmentKey || !groupKey) return 'none';
    if (treatmentKey === groupKey) return 'exact';
    const treatmentTokens = treatmentKey.split(' ').filter(Boolean);
    const groupTokens = groupKey.split(' ').filter(Boolean);
    const treatmentSet = new Set(treatmentTokens);
    if (groupTokens.length && groupTokens.every(token => treatmentSet.has(token))) return 'component';
    for (const [regimen, components] of Object.entries(REGIMEN_COMPONENTS)) {
      if (!treatmentSet.has(regimen)) continue;
      if (components.some(component => component === groupKey || labelsOverlap(component, groupKey))) return 'component';
    }
    return labelsOverlap(treatmentKey, groupKey) ? 'similar' : 'none';
  }

  function mergeEntryRelations(entries) {
    const byKey = new Map();
    for (const entry of entries || []) {
      const key = entry.n?.id || `${entry.n?.label || ''}:${entry.n?.sourceSection || ''}`;
      const existing = byKey.get(key);
      if (!existing || (MATCH_LEVEL_RANK[entry.nhiMatchLevel] || 0) > (MATCH_LEVEL_RANK[existing.nhiMatchLevel] || 0)) {
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()];
  }

  function mergeNccnGroups(nhiGroups, matches, assessOption) {
    const groups = new Map(nhiGroups.map(group => [
      group.key,
      { ...group, entries: mergeEntryRelations(group.entries), nhiMatchLevel: 'exact' },
    ]));
    const suggestedKeys = [];
    for (const match of matches || []) {
      for (const option of match.page?.options || []) {
        if (typeof option === 'string' || option.modality !== 'systemic') continue;
        const assessment = assessOption(option, match.features || []);
        if (assessment.blocked) continue;
        const label = String(option.label || '').trim();
        const key = normalizeTreatmentName(label);
        if (!key) continue;
        const relatedEntries = nhiGroups.flatMap(group => {
          const level = treatmentMatchLevel(key, group.key);
          if (level === 'none') return [];
          return group.entries.map(entry => ({ ...entry, nhiMatchLevel: level }));
        });
        if (!groups.has(key)) {
          if (suggestedKeys.length >= 24) continue;
          groups.set(key, {
            key,
            label,
            entries: mergeEntryRelations(relatedEntries),
            fromNccn: true,
            requiresSourceReview: false,
            nhiMatchLevel: strongestMatchLevel(relatedEntries.map(entry => entry.nhiMatchLevel)),
          });
        } else {
          const group = groups.get(key);
          group.entries = mergeEntryRelations([...group.entries, ...relatedEntries]);
          group.fromNccn = true;
          group.nhiMatchLevel = strongestMatchLevel(group.entries.map(entry => entry.nhiMatchLevel));
        }
        const group = groups.get(key);
        group.requiresSourceReview = group.requiresSourceReview || !!option.needsReview || !!option.sourceNeedsReview || option.recommendation === 'review';
        if (!suggestedKeys.includes(key)) suggestedKeys.push(key);
      }
    }
    const suggested = suggestedKeys.map(key => groups.get(key)).filter(Boolean);
    const remaining = [...groups.values()].filter(group => !suggestedKeys.includes(group.key));
    return [...suggested, ...remaining];
  }

  window.NHI_SELECTOR = {
    notesForCancer,
    isGeneralNote,
    normalizeTreatmentName,
    groupTreatments,
    labelsOverlap,
    treatmentMatchLevel,
    strongestMatchLevel,
    matchLevelLabels: MATCH_LEVEL_LABELS,
    mergeNccnGroups,
  };
})();
