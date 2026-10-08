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

test('trMessage translates whole messages and "Prefix: detail" errors, and passes unknown text through', () => {
  I18n.setLanguage('sr');
  try {
    assert.equal(I18n.trMessage('IndexedDB unavailable'), I18n.tr('IndexedDB unavailable'));
    assert.notEqual(I18n.trMessage('IndexedDB unavailable'), 'IndexedDB unavailable');
    assert.equal(I18n.trMessage('Missing attachment file: Racun.pdf'), `${I18n.tr('Missing attachment file')}: Racun.pdf`);
    assert.equal(I18n.trMessage('Recovery preparation failed: Missing attachment file: a.pdf'), `${I18n.tr('Recovery preparation failed')}: ${I18n.tr('Missing attachment file')}: a.pdf`);
    assert.equal(I18n.trMessage('Cannot restore reciprocal Goal link: saved contribution settings are missing.'), I18n.tr('Cannot restore reciprocal Goal link: saved contribution settings are missing.'));
    assert.equal(I18n.trMessage('something unexpected'), 'something unexpected');
    assert.equal(I18n.trMessage(undefined), '');
  } finally { I18n.setLanguage('en'); }
  assert.equal(I18n.trMessage('Missing attachment file: a.pdf'), 'Missing attachment file: a.pdf');
});

// Static text of every template literal and quoted markup string; each ${…} becomes \u0000.
// A small lexer skips comments, strings and regex literals so that only real templates are read.
// It also collects quoted literals inside ${…} that are not arguments of tr()/msg()/trn()/trMessage(),
// such as `${value ? label : 'Plan for'}`, in chunks.expressionLiterals.
const TRANSLATORS = new Set(['tr', 'msg', 'trn', 'trMessage']);
function markupChunks(source) {
  const chunks = [];
  chunks.expressionLiterals = [];
  let i = 0;
  let previous = '';
  const regexAllowed = () => !previous || /[(,=:[!&|?{};+\-*%<>~^]$/.test(previous) || /^(?:return|typeof|case|in|of|void|delete|throw)$/.test(previous);
  const readString = quote => {
    const start = i + 1;
    for (i += 1; i < source.length && source[i] !== quote; i += 1) if (source[i] === '\\') i += 1;
    const text = source.slice(start, i);
    i += 1;
    if (/<[a-z]/i.test(text) && text.includes('>')) chunks.push(text);
    return text;
  };
  const readRegex = () => {
    let inClass = false;
    for (i += 1; i < source.length; i += 1) {
      const c = source[i];
      if (c === '\\') i += 1;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    for (i += 1; /[a-z]/i.test(source[i] || ''); i += 1);
  };
  const readTemplate = () => {
    let text = '';
    for (i += 1; i < source.length;) {
      const c = source[i];
      if (c === '\\') { text += source.slice(i, i + 2); i += 2; }
      else if (c === '`') { i += 1; chunks.push(text); return; }
      else if (c === '$' && source[i + 1] === '{') { i += 2; text += '\u0000'; readCode(1); }
      else { text += c; i += 1; }
    }
  };
  const readCode = depth => {
    const calls = [];
    while (i < source.length) {
      const c = source[i];
      if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i += 1; continue; }
      if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 2; continue; }
      if (c === '\'' || c === '"') {
        const text = readString(c);
        if (depth > 0 && !TRANSLATORS.has(calls[calls.length - 1])) chunks.expressionLiterals.push(text);
        previous = 'x';
        continue;
      }
      if (c === '(') calls.push(/^[\w$]+$/.test(previous) ? previous : '');
      if (c === ')') calls.pop();
      if (c === '`') { readTemplate(); previous = 'x'; continue; }
      if (c === '/' && regexAllowed()) { readRegex(); previous = 'x'; continue; }
      if (c === '{' && depth > 0) depth += 1;
      if (c === '}' && depth > 0 && --depth === 0) { i += 1; return; }
      if (/[\w$]/.test(c)) { const start = i; while (/[\w$]/.test(source[i] || '')) i += 1; previous = source.slice(start, i); continue; }
      if (!/\s/.test(c)) previous = c;
      i += 1;
    }
  };
  readCode(0);
  return chunks;
}

// Text a user can see or hear in markup: text nodes and label-like attribute values.
function visibleTexts(chunk) {
  return [
    ...[...chunk.matchAll(/>([^<>]*)</g)].map(match => match[1]),
    ...[...chunk.matchAll(/\b(?:aria-label|aria-description|title|placeholder|alt)="([^"]*)"/g)].map(match => match[1]),
  ];
}

// Words allowed to stay as written: the brand, the URL hint and fixed technical tokens.
const UNTRANSLATED_ALLOWLIST = new Set(['Dailo', 'https', 'ZIP', 'JSON', 'RESET', 'RESTORE']);
// A capitalized English word or phrase used as display text (key names such as Alt/Shift are allowed).
const isEnglishFallback = text => /^[A-Z][a-z]+(?:[ -][A-Za-z]+)*[.…!?]?$/.test(text) && !['Alt', 'Shift', 'Ctrl', 'Cmd', 'Enter', 'Esc', 'Tab', 'Space', 'Dailo'].includes(text);
const untranslatedWords = text => (text.replace(/\u0000/g, ' ').replace(/&(?:[a-z]+|#\d+);/gi, ' ').match(/[A-Za-z]{2,}/g) || []).filter(word => !UNTRANSLATED_ALLOWLIST.has(word));

test('untranslated-text audit: the scanner finds literal English in templates, nested templates and markup strings', () => {
  const sample = [
    'const pattern = /`<b>Inside a regex<\\/b>`/g; const ratio = a / b / c;',
    'const html = `<div title="Bad title">${open ? `<span>Nested English</span>` : \'\'}${tr(\'Fine\')}</div>`;',
    'const quoted = \'<em>Quoted English</em>\'; // `<i>Comment text</i>`',
  ].join('\n');
  const found = markupChunks(sample).flatMap(visibleTexts).filter(text => untranslatedWords(text).length).map(text => text.trim());
  assert.deepEqual(found.sort(), ['Bad title', 'Nested English', 'Quoted English']);
});

test('untranslated-text audit: rendered markup in js/*.js shows only tr() text and allowlisted words', () => {
  const problems = [];
  let scanned = 0;
  for (const { file, text } of sources().filter(({ file }) => file.endsWith('.js') && !/^js\/i18n/.test(file))) {
    for (const visible of markupChunks(text).flatMap(visibleTexts)) {
      scanned += 1;
      const words = untranslatedWords(visible);
      if (words.length) problems.push(`${file}: ${JSON.stringify(visible.replace(/\u0000/g, '${…}').trim())}`);
    }
  }
  assert.ok(scanned > 1000, `the scanner reads the app templates (${scanned} texts)`);
  assert.deepEqual(problems, []);
});

test('untranslated-text audit: English fallbacks inside ${…} expressions go through tr()', () => {
  const sample = 'const a = `<b>${ok ? tr(\'Fine\') : \'Plan for\'}</b>${tr(TYPES[x] || \'Article\')}${key === \'Alt\' ? \'x\' : \'\'}`;';
  assert.deepEqual(markupChunks(sample).expressionLiterals.filter(isEnglishFallback), ['Plan for']);
  const problems = [];
  for (const { file, text } of sources().filter(({ file }) => file.endsWith('.js') && !/^js\/i18n/.test(file))) {
    for (const literal of markupChunks(text).expressionLiterals.filter(isEnglishFallback)) problems.push(`${file}: ${JSON.stringify(literal)}`);
  }
  assert.deepEqual(problems, []);
});

test('persisted Settings status sentences are catalog keys', () => {
  const problems = [];
  for (const { file, text } of sources().filter(({ file }) => file.endsWith('.js'))) {
    for (const match of text.matchAll(/validationResult:\s*(?:[^,}?]*\?\s*)?(['"])([^'"]+)\1/g)) problems.push(`${file}: ${match[2]}`);
  }
  assert.deepEqual(problems, []);
});

test('untranslated-text audit: index.html has no English text that the catalog translates', () => {
  const catalog = I18n.catalog('sr');
  const html = read('index.html').replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
  const texts = [...visibleTexts(html), ...[...html.matchAll(/<title>([^<]*)<\/title>/g)].map(match => match[1])].map(text => text.trim()).filter(Boolean);
  assert.ok(texts.length > 10);
  const english = texts.filter(text => typeof catalog[text] === 'string' && catalog[text] !== text);
  assert.deepEqual(english, []);
  assert.deepEqual(texts.filter(text => /\b(?:the|and|your|with|to|of|for|open|add|new|close)\b/i.test(text)), []);
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

test('the Serbian catalog is Latin script only', () => {
  const cyrillic = Object.entries(I18n.catalog('sr')).filter(([, value]) => /[\u0400-\u04FF]/.test(JSON.stringify(value))).map(([key]) => key);
  assert.deepEqual(cyrillic, []);
});

test('translation calls use literal keys, never template literals', () => {
  for (const { file, text } of sources()) assert.doesNotMatch(text, /\b(?:tr|msg)\(\s*`/, `${file} must pass a quoted key`);
});
