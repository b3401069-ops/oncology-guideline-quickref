(() => {
  'use strict';

  function normalizeLabel(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
      .replace(/[®™]/g, '')
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function ruleKey(cancerId, label) {
    return `${String(cancerId || '').trim()}:${normalizeLabel(label)}`;
  }

  function isActive(note) {
    return note?.archived !== true && note?.current !== false;
  }

  function ruleDate(note) {
    return note?.effectiveDate || note?.publishedDate || note?.updatedAt || '';
  }

  function isStale(note, today = new Date(), staleDays = 365) {
    const value = ruleDate(note);
    if (!isActive(note) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const age = today.getTime() - new Date(value + 'T00:00:00').getTime();
    return age > staleDays * 86400000;
  }

  function archiveSuperseded(existingNotes, replacementNotes, replacedAt) {
    const replacements = new Map(replacementNotes.map(note => [note.ruleKey || ruleKey(note.cancerId, note.label), note]));
    return (existingNotes || []).filter(note => note.autoExtracted && isActive(note))
      .map(note => {
        const key = note.ruleKey || ruleKey(note.cancerId, note.label);
        const replacement = replacements.get(key);
        if (!replacement || replacement.id === note.id) return null;
        return {
          ...note,
          ruleKey: key,
          current: false,
          archived: true,
          supersededAt: replacedAt,
          supersededBy: replacement.id,
        };
      }).filter(Boolean);
  }

  window.NHI_VERSIONING = Object.freeze({ normalizeLabel, ruleKey, isActive, ruleDate, isStale, archiveSuperseded });
})();
