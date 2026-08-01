(() => {
  'use strict';

  const normalize = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/\b(?:and|or|with)\b/g, ' ')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const ALIASES = {
    pembrolizumab: ['keytruda'],
    nivolumab: ['opdivo'],
    ipilimumab: ['yervoy'],
    atezolizumab: ['tecentriq'],
    durvalumab: ['imfinzi'],
    bevacizumab: ['avastin'],
    trastuzumab: ['herceptin'],
    pertuzumab: ['perjeta'],
    osimertinib: ['tagrisso'],
    olaparib: ['lynparza'],
    lenvatinib: ['lenvima'],
    sorafenib: ['nexavar'],
    'fam trastuzumab deruxtecan nxki': ['trastuzumab deruxtecan', 'enhertu', 't dxd', 'tdxd'],
    'ado trastuzumab emtansine': ['trastuzumab emtansine', 'kadcyla', 't dm1', 'tdm1'],
  };

  const REGIMENS = {
    folfox: ['fluorouracil', 'leucovorin', 'oxaliplatin'],
    mfolfox6: ['fluorouracil', 'leucovorin', 'oxaliplatin'],
    folfiri: ['fluorouracil', 'leucovorin', 'irinotecan'],
    folfoxiri: ['fluorouracil', 'leucovorin', 'oxaliplatin', 'irinotecan'],
    capox: ['capecitabine', 'oxaliplatin'],
    capeox: ['capecitabine', 'oxaliplatin'],
    folfirinox: ['fluorouracil', 'leucovorin', 'oxaliplatin', 'irinotecan'],
    mfolfirinox: ['fluorouracil', 'leucovorin', 'oxaliplatin', 'irinotecan'],
    tchp: ['docetaxel', 'carboplatin', 'trastuzumab', 'pertuzumab'],
    thp: ['docetaxel', 'trastuzumab', 'pertuzumab'],
    ac: ['doxorubicin', 'cyclophosphamide'],
    ddac: ['doxorubicin', 'cyclophosphamide'],
    tc: ['docetaxel', 'cyclophosphamide'],
    'keynote 522': ['pembrolizumab', 'paclitaxel', 'carboplatin', 'doxorubicin', 'cyclophosphamide'],
    'r chop': ['rituximab', 'cyclophosphamide', 'doxorubicin', 'vincristine', 'prednisone'],
    br: ['bendamustine', 'rituximab'],
    abvd: ['doxorubicin', 'bleomycin', 'vinblastine', 'dacarbazine'],
    avd: ['doxorubicin', 'vinblastine', 'dacarbazine'],
    captem: ['capecitabine', 'temozolomide'],
  };

  const aliasToCanonical = new Map();
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    aliasToCanonical.set(normalize(canonical), normalize(canonical));
    for (const alias of aliases) aliasToCanonical.set(normalize(alias), normalize(canonical));
  }

  function canonicalName(value) {
    const key = normalize(value);
    return aliasToCanonical.get(key) || key;
  }

  function includesPhrase(text, phrase) {
    return (' ' + text + ' ').includes(' ' + phrase + ' ');
  }

  function components(value) {
    const text = normalize(value);
    const output = new Set();
    for (const [name, canonical] of aliasToCanonical.entries()) {
      if (includesPhrase(text, name)) output.add(canonical);
    }
    for (const [regimen, ingredients] of Object.entries(REGIMENS)) {
      if (!includesPhrase(text, regimen)) continue;
      ingredients.forEach(ingredient => output.add(canonicalName(ingredient)));
    }
    return [...output];
  }

  function labelsOverlap(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) < 4) return false;
    return includesPhrase(left, right) || includesPhrase(right, left);
  }

  function matchLevel(treatmentValue, candidateValue) {
    const treatment = canonicalName(treatmentValue);
    const candidate = canonicalName(candidateValue);
    if (!treatment || !candidate) return 'none';
    if (treatment === candidate) return 'exact';
    if (includesPhrase(treatment, candidate)) return 'ingredient';
    if (components(treatmentValue).includes(candidate)) return 'ingredient';
    return labelsOverlap(treatment, candidate) ? 'similar' : 'none';
  }

  globalThis.DRUG_VOCABULARY = Object.freeze({
    normalize,
    canonicalName,
    components,
    labelsOverlap,
    matchLevel,
    regimens: Object.freeze(REGIMENS),
  });
})();
