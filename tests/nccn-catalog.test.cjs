const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

function parseCatalog() {
  const guidelineBlock = html.match(/const NCCN_GUIDELINES = \[([\s\S]*?)\n    \]\.map/)?.[1] || '';
  const guidelines = [...guidelineBlock.matchAll(/\['([^']+)', '([^']+)', '([^']+)'\]/g)]
    .map(match => ({ id: match[1], title: match[2], cardId: match[3] }));
  const aliasBlock = html.match(/const NCCN_GUIDELINE_TITLE_ALIASES = \{([\s\S]*?)\n    \};/)?.[1] || '';
  const aliases = Object.fromEntries([...aliasBlock.matchAll(/'(\d+)':\s*\[([^\]]*)\]/g)]
    .map(match => [match[1], [...match[2].matchAll(/'([^']+)'/g)].map(alias => alias[1])]));
  return { guidelines, aliases };
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/\bnccn\b|\bguidelines?\b|\bversion\b|\b20\d{2}\b|\bv\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchGuideline(value, guidelines, aliases) {
  const normalized = ` ${normalizeTitle(value)} `;
  return guidelines
    .flatMap(guideline => [guideline.title, ...(aliases[guideline.id] || [])]
      .map(title => ({ guideline, title: normalizeTitle(title) })))
    .filter(item => item.title && normalized.includes(` ${item.title} `))
    .sort((a, b) => b.title.length - a.title.length)[0]?.guideline || null;
}

test('NCCN catalog keeps the expected 69 guideline families', () => {
  const { guidelines } = parseCatalog();
  assert.equal(guidelines.length, 69);
});

test('Head and Neck filename alias resolves to the grouped guideline', () => {
  const { guidelines, aliases } = parseCatalog();
  const matched = matchGuideline('head-and-neck NCCN 指引.pdf', guidelines, aliases);
  assert.equal(matched?.id, '1437');
  assert.match(html, /'1437': \['oral_cavity_cancer'.*'salivary_gland_cancer'\]/);
});

test('homepage distinguishes an existing NCCN guideline from a locally imported PDF', () => {
  assert.match(html, /expectsNccn \? '待匯入 PDF'/);
  assert.match(html, /const missingNccnSummary =/);
});

test('homepage derives the missing list after creating the current guideline ID set', () => {
  const idSetPosition = html.indexOf('const currentNccnGuidelineIds =');
  const missingListPosition = html.indexOf('const missingNccnGuidelines =');
  assert.ok(idSetPosition >= 0 && missingListPosition > idSetPosition,
    'current guideline IDs must be created before deriving the missing list');
});
