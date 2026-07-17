const test = require('node:test');
const fs = require('node:fs');

test('production scripts and inline module parse as JavaScript', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error('module script missing');
  new Function(scripts.at(-1)[1]);
  for (const file of [
    'app-version.js', 'case-state.js', 'backup-format.js', 'clinical-scenarios.js', 'nhi-versioning.js',
    'nhi-parser.js', 'nhi-selector.js', 'sw.js',
  ]) new Function(fs.readFileSync(file, 'utf8'));
});
