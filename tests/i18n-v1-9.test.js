const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const I18n = require('../js/i18n.js');
require('../js/i18n-sr.js');

const sources = () => ['index.html', ...fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => `js/${file}`)]
  .map(file => ({ file, text: read(file) }));
const literal = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unescape = value => value.replace(/\\(.)/g, '$1');
const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

function extractedKeys() {
  const keys = new Map();
  const add = (key, file, kind) => { if (!keys.has(key)) keys.set(key, { file, kind }); };
  for (const { file, text } of sources()) {
    for (const match of text.matchAll(new RegExp(String.raw`\b(?:tr|msg)\(\s*(?:${literal})`, 'g'))) add(unescape(match[1] ?? match[2]), file, 'text');
    for (const match of text.matchAll(new RegExp(String.raw`\btrn\([^,()]+(?:\([^()]*\))?[^,()]*,\s*(?:${literal})\s*,\s*(?:${literal})`, 'g'))) add(unescape(match[3] ?? match[4]), file, 'plural');
  }
  return keys;
}

test('tr falls back to the English source and interpolates named values', () => {
  I18n.setLanguage('en');
  assert.equal(I18n.tr('Today'), 'Today');
  assert.equal(I18n.tr('{count} open', { count: 3 }), '3 open');
  assert.equal(I18n.tr('Keep {missing}', {}), 'Keep {missing}');
  assert.equal(I18n.trn(1, '{count} task', '{count} tasks'), '1 task');
  assert.equal(I18n.trn(0, '{count} task', '{count} tasks'), '0 tasks');
  assert.equal(I18n.msg('Book'), 'Book', 'msg only marks a key');
  assert.equal(I18n.locale(), 'en');
});

test('Serbian catalog translates, uses one/few/other plurals and the sr-Latn-RS locale', () => {
  I18n.setLanguage('sr');
  try {
    assert.equal(I18n.locale(), 'sr-Latn-RS');
    assert.equal(I18n.tr('Today'), 'Danas');
    const tasks = count => I18n.trn(count, '{count} task', '{count} tasks');
    assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(tasks), ['1 zadatak', '2 zadatka', '5 zadataka', '11 zadataka', '21 zadatak', '22 zadatka', '25 zadataka']);
    assert.equal(new Intl.DateTimeFormat(I18n.locale(), { month: 'long' }).format(new Date(2026, 9, 7)), 'oktobar', 'Latin script, not Cyrillic');
  } finally { I18n.setLanguage('en'); }
});

test('index.html is Serbian and loads i18n after release metadata and before core', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="sr-Latn">/);
  const at = file => html.indexOf(`src="${file}"`);
  assert.ok(at('js/release.js') > 0 && at('js/release.js') < at('js/i18n.js'));
  assert.ok(at('js/i18n.js') < at('js/i18n-sr.js'));
  assert.ok(at('js/i18n-sr.js') < at('js/core.js'));
});

test('every translation key used in code has a Serbian entry with the same placeholders, and none is unused', () => {
  const catalog = I18n.catalog('sr');
  const keys = extractedKeys();
  const problems = [];
  for (const [key, { file, kind }] of keys) {
    const entry = catalog[key];
    if (entry === undefined) { problems.push(`missing: ${JSON.stringify(key)} (${file})`); continue; }
    const forms = kind === 'plural' ? entry : { text: entry };
    if (kind === 'plural' && (typeof entry !== 'object' || !entry.one || !entry.few || !entry.other)) { problems.push(`plural needs one/few/other: ${JSON.stringify(key)}`); continue; }
    if (kind === 'text' && typeof entry !== 'string') { problems.push(`not a plain string: ${JSON.stringify(key)}`); continue; }
    for (const form of Object.values(forms)) {
      if (JSON.stringify(placeholders(form)) !== JSON.stringify(placeholders(key)) && !(kind === 'plural' && placeholders(key).every(name => placeholders(form).includes(name)))) problems.push(`placeholders differ: ${JSON.stringify(key)} → ${JSON.stringify(form)}`);
    }
  }
  for (const key of Object.keys(catalog)) if (!keys.has(key)) problems.push(`unused: ${JSON.stringify(key)}`);
  assert.deepEqual(problems, []);
});

test('translation calls use literal keys, never template literals', () => {
  for (const { file, text } of sources()) assert.doesNotMatch(text, /\b(?:tr|msg)\(\s*`/, `${file} must pass a quoted key`);
});
