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
  };

  function notesForCancer(notes, cancerId) {
    const accepted = new Set([cancerId, ...(RELATED_CARD_IDS[cancerId] || [])]);
    return (notes || []).filter(note => accepted.has(note.cancerId));
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

  function groupTreatments(entries) {
    const groups = new Map();
    for (const entry of entries || []) {
      if (isGeneralNote(entry)) continue;
      const label = String(entry.n?.label || '').trim() || '未命名藥物／療程';
      const key = normalizeTreatmentName(label);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()];
  }

  function labelsOverlap(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) < 4) return false;
    return (` ${left} `).includes(` ${right} `) || (` ${right} `).includes(` ${left} `);
  }

  function treatmentIncludesGroup(treatmentKey, groupKey) {
    if (labelsOverlap(treatmentKey, groupKey)) return true;
    const tokens = new Set(treatmentKey.split(' '));
    return Object.entries(REGIMEN_COMPONENTS).some(([regimen, components]) =>
      tokens.has(regimen) && components.some(component => labelsOverlap(component, groupKey))
    );
  }

  function uniqueEntries(entries) {
    const seen = new Set();
    return entries.filter(entry => {
      const key = entry.n?.id || `${entry.n?.label || ''}:${entry.n?.sourceSection || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeNccnGroups(nhiGroups, matches, assessOption) {
    const groups = new Map(nhiGroups.map(group => [group.key, { ...group, entries: [...group.entries] }]));
    const suggestedKeys = [];
    for (const match of matches || []) {
      for (const option of match.page?.options || []) {
        if (typeof option === 'string' || option.modality !== 'systemic') continue;
        const assessment = assessOption(option, match.features || []);
        if (assessment.blocked) continue;
        const label = String(option.label || '').trim();
        const key = normalizeTreatmentName(label);
        if (!key) continue;
        const relatedEntries = nhiGroups
          .filter(group => treatmentIncludesGroup(key, group.key))
          .flatMap(group => group.entries);
        if (!groups.has(key)) {
          if (suggestedKeys.length >= 24) continue;
          groups.set(key, { key, label, entries: uniqueEntries(relatedEntries), fromNccn: true, requiresSourceReview: false });
        } else {
          groups.get(key).entries = uniqueEntries([...groups.get(key).entries, ...relatedEntries]);
          groups.get(key).fromNccn = true;
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
    mergeNccnGroups,
  };
})();
