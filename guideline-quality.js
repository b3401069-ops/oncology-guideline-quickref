(() => {
  'use strict';

  const MODALITIES = ['surgery', 'radiation', 'systemic', 'followup'];

  function evaluateDocument(doc, minimumSchemaVersion = 5) {
    const structure = doc?.nccnStructure;
    const emptyCounts = Object.fromEntries(MODALITIES.map(key => [key, 0]));
    if (doc?.nccnParseError) return { status: 'failed', counts: emptyCounts, optionCount: 0, reviewCount: 0 };
    if (!structure || Number(structure.schemaVersion || 0) < minimumSchemaVersion) {
      return { status: 'pending', counts: emptyCounts, optionCount: 0, reviewCount: 0 };
    }
    if ((structure.redirectGuidelines || []).length) {
      return { status: 'redirect', counts: emptyCounts, optionCount: 0, reviewCount: 0 };
    }

    const pages = Array.isArray(structure.treatmentPages) ? structure.treatmentPages : [];
    const options = pages.flatMap(page => Array.isArray(page.options) ? page.options : []);
    const counts = { ...emptyCounts };
    let reviewCount = 0;
    for (const option of options) {
      if (typeof option === 'string') {
        reviewCount += 1;
        continue;
      }
      if (MODALITIES.includes(option?.modality)) counts[option.modality] += 1;
      if (option?.needsReview || option?.recommendation === 'review') reviewCount += 1;
    }

    const hasSections = Array.isArray(structure.sections) && structure.sections.length > 0;
    const needsReview = structure.status === 'review_needed' || !hasSections || !pages.length || !options.length;
    return {
      status: needsReview ? 'review' : 'ready',
      counts,
      optionCount: options.length,
      reviewCount,
    };
  }

  function summarize(documents, minimumSchemaVersion = 5) {
    const summary = {
      total: 0, ready: 0, review: 0, pending: 0, failed: 0, redirect: 0,
      modalities: Object.fromEntries(MODALITIES.map(key => [key, 0])),
      attention: [],
    };
    for (const doc of documents || []) {
      const quality = evaluateDocument(doc, minimumSchemaVersion);
      summary.total += 1;
      summary[quality.status] += 1;
      for (const modality of MODALITIES) summary.modalities[modality] += quality.counts[modality];
      if (['review', 'pending', 'failed'].includes(quality.status)) summary.attention.push({ doc, ...quality });
    }
    summary.parsed = summary.ready + summary.review;
    return summary;
  }

  window.GUIDELINE_QUALITY = Object.freeze({ modalities: MODALITIES, evaluateDocument, summarize });
})();
