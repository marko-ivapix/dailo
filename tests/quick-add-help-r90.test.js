// R90: Brzo dodavanje helps while typing. Each recognized part in the preview is a button: a tap keeps those words in
// the title (for example a film called "Sutra"), while the rest of the title is still read. Typing #, + or @ offers
// the existing tags, projects and areas. Pasting a list of two lines or more asks first, then makes that many tasks
// (each line read like a title) with one Poništi, or joins the lines into one task.
// Spec: docs/superpowers/specs/2026-10-15-r90-quick-add-help.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { appSource, functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
// R111: Quick Add moved to js/quick-add-ui.js, which reads the live state through the context (app.state).
const app = appSource();
const TODAY = '2026-10-15'; // a Thursday
const tags = [{ id: 'tg', name: 'Posao' }];
const projects = [{ id: 'pr', name: 'Klijenti' }];
const parse = (title, options = {}) => JSON.parse(JSON.stringify(Core.parseQuickAdd(title, { today: TODAY, ...options })));

test('a recognized part can stay in the title; the parser can say which words it read', () => {
  const film = parse('Gledaj film Sutra', { keep: [{ slot: 'plannedDate', text: 'sutra' }] });
  assert.deepEqual([film.title, film.plannedDate], ['Gledaj film Sutra', null]);
  const mixed = parse('Ponuda rok petak 45min sutra u 9:30', { keep: [{ slot: 'plannedDate', text: 'sutra' }] });
  assert.deepEqual([mixed.title, mixed.plannedDate, mixed.plannedTime, mixed.dueDate, mixed.durationMinutes], ['Ponuda sutra', null, '09:30', '2026-10-16', 45], 'the other parts are still read');
  assert.equal(parse('Gledaj film u petak', { keep: [{ slot: 'plannedDate', text: 'sutra' }] }).plannedDate, '2026-10-16', 'other words are read as before');
  const sources = parse('Ponuda #posao +Klijenti !visok rok petak 45min sutra u 9:30', { tags, projects, sources: true }).sources;
  assert.deepEqual(sources, { 'tag:tg': '#posao', projectId: '+klijenti', priority: '!visok', plannedTime: 'u 9:30', plannedDate: 'sutra', durationMinutes: '45min', dueDate: 'rok petak' });
  const tag = parse('Izveštaj #posao', { tags, keep: [{ slot: 'tag:tg', text: '#posao' }] });
  assert.deepEqual([tag.title, tag.tagIds], ['Izveštaj #posao', []]);
  assert.equal(Object.hasOwn(parse('Izveštaj sutra'), 'sources'), false, 'without the option the result keeps its shape');
});

test('#, + and @ offer existing tags, projects and areas for the word being typed', () => {
  const lists = { tags: [{ id: 't1', name: 'Posao' }, { id: 't2', name: 'Porez' }, { id: 't3', name: 'Kuća' }], projects: [{ id: 'p1', name: 'Sajt za klijenta' }, { id: 'p2', name: 'Stara', isArchived: true }], areas: [{ id: 'a1', name: 'Zdravlje', status: 'active' }, { id: 'a2', name: 'Zatvorena', status: 'archived' }] };
  const insert = title => Core.quickSuggestions(title, lists)?.map(item => item.insert) ?? null;
  assert.deepEqual(insert('Izveštaj #po'), ['#Posao', '#Porez']);
  assert.deepEqual(insert('Izveštaj #'), ['#Posao', '#Porez', '#Kuća']);
  assert.deepEqual(insert('Izveštaj #по'), ['#Posao', '#Porez'], 'Cyrillic');
  assert.deepEqual(insert('Izveštaj #Posao'), [], 'already complete');
  assert.deepEqual(insert('Pošalji +saj'), ['+Sajt-za-klijenta'], 'spaces become dashes, which the parser reads');
  assert.equal(Core.quickSuggestions('Pošalji +saj', lists)[0].label, 'Sajt za klijenta');
  assert.equal(Core.parseQuickAdd('Pošalji +Sajt-za-klijenta', { today: TODAY, projects: lists.projects }).projectId, 'p1');
  assert.deepEqual(insert('Pošalji +st'), [], 'archived projects are left out');
  assert.deepEqual(insert('Pregled @z'), ['@Zdravlje'], 'archived areas are left out');
  assert.equal(insert('Bez znaka'), null);
  assert.equal(insert('Izveštaj #po '), null, 'only the word being typed');
  assert.equal(Core.quickSuggestions('#', { tags: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, name: `T${i}` })) }).length, 5, 'at most five');
});

test('a pasted list becomes lines without bullets or numbers, at most 100', () => {
  assert.deepEqual(Core.splitPastedList('- Mleko\n* Hleb\n• Jaja\n1. Sir\n2) Kafa\n- [ ] Čaj\n[x] Šećer\n\n   \nKupi so  '), ['Mleko', 'Hleb', 'Jaja', 'Sir', 'Kafa', 'Čaj', 'Šećer', 'Kupi so']);
  assert.deepEqual(Core.splitPastedList('Jedan red'), ['Jedan red']);
  assert.deepEqual(Core.splitPastedList('a\r\nb'), ['a', 'b']);
  assert.equal(Core.splitPastedList(Array.from({ length: 150 }, (_, i) => `Red ${i}`).join('\n')).length, 100);
});

test('the preview\'s parts are buttons that keep their words in the title', () => {
  const preview = fn('quickParsePreview');
  assert.match(preview, /const item = \(slot, icon, text\) => `<button class="quick-parse-item" type="button" data-action="quick-keep" data-slot="\$\{esc\(slot\)\}" aria-label="\$\{esc\(tr\('Keep “\{words\}” in the title', \{ words: parsed\.sources\?\.\[slot\] \|\| text \}\)\)\}"><i class="ph \$\{icon\}" aria-hidden="true"><\/i>\$\{esc\(text\)\}<\/button>`;/);
  // R105: a day set by a repeat keeps the repeat's words when tapped (it has no words of its own).
  assert.match(preview, /if \(parsed\.plannedDate\) items\.push\(item\(parsed\.sources && !parsed\.sources\.plannedDate && parsed\.sources\.recurrence \? 'recurrence' : 'plannedDate', 'ph-calendar-check', relativeDateLabel\(parsed\.plannedDate\)\)\);\n\s+if \(parsed\.plannedTime\) items\.push\(item\('plannedTime', 'ph-clock', parsed\.plannedTime\)\);/, 'the day and the time are separate');
  assert.match(preview, /items\.push\(item\(`tag:\$\{tag\.id\}`, 'ph-hash', tag\.name\)\)/);
  assert.match(preview, /<span class="quick-parse-hint">\$\{tr\('Tap a part to keep it in the title\.'\)\}<\/span>/);
  assert.match(fn('parseQuickAddTitle'), /function parseQuickAddTitle\(rawTitle, parsePlan = true, keep = \[\]\) \{\n\s+return Core\.parseQuickAdd\(rawTitle, \{ today: Core\.dateOnly\(\), tags: app\.state\.tags \|\| \[\], projects: app\.state\.projects \|\| \[\], areas: app\.state\.areas \|\| \[\], parsePlan, keep, sources: true \}\);/);
  const keep = fn('keepInQuickTitle');
  assert.match(keep, /const text = parseQuickAddTitle\(d\.title, !d\.explicitPlan, d\.keepInTitle\)\.sources\?\.\[slot\];/);
  assert.match(keep, /d\.keepInTitle = \[\.\.\.\(d\.keepInTitle \|\| \[\]\), \{ slot, text \}\];/);
  assert.match(app, /else if \(action === 'quick-keep'\) keepInQuickTitle\(el\.dataset\.slot\);/);
  assert.match(fn('createTask'), /const parsed = parseQuickAddTitle\(d\.title, !d\.explicitPlan, d\.keepInTitle\);/);
});

test('suggestions show under the title and complete the word', () => {
  assert.match(fn('quickSuggestHtml'), /const items = Core\.quickSuggestions\(title, \{ tags: app\.state\.tags \|\| \[\], projects: app\.state\.projects \|\| \[\], areas: app\.state\.areas \|\| \[\] \}\) \|\| \[\];/);
  assert.match(fn('quickSuggestHtml'), /<button class="quick-chip" type="button" data-action="quick-suggest" data-insert="\$\{esc\(item\.insert\)\}">/);
  assert.match(fn('renderQuickModal'), /<div class="quick-suggest-slot" data-quick-suggest-slot>\$\{quickSuggestHtml\(d\.title\)\}<\/div>/);
  assert.match(app, /const suggest = document\.querySelector\('\[data-quick-suggest-slot\]'\); if \(suggest\) suggest\.innerHTML = quickSuggestHtml\(event\.target\.value\);/);
  assert.match(fn('applyQuickSuggestion'), /d\.title = `\$\{d\.title\.replace\(\/\(\^\|\\s\)\[#\+@\]\\S\*\$\/, '\$1'\)\}\$\{insert\} `;/);
});

test('a pasted list asks first, then makes the tasks with one Poništi, or joins them', () => {
  const paste = fn('handlePaste');
  assert.match(paste, /const lines = Core\.splitPastedList\(event\.clipboardData\?\.getData\('text'\) \|\| ''\);\n\s+if \(lines\.length < 2\) return;\n\s+event\.preventDefault\(\);/);
  assert.match(app, /document\.addEventListener\('paste', handlePaste\);/);
  const sheet = fn('renderQuickModal');
  assert.match(sheet, /data-action="quick-paste-tasks">\$\{esc\(trn\(lines\.length, 'Make \{count\} task', 'Make \{count\} tasks'\)\)\}<\/button>/);
  assert.match(sheet, /data-action="quick-paste-one">\$\{tr\('As one task'\)\}<\/button>/);
  const make = fn('createPastedTasks');
  // R105: each line is read on its own, then takes the +project, @area, #tags and !priority typed before the paste.
  assert.match(make, /const own = parseQuickAddTitle\(line, !d\.explicitPlan\);/);
  assert.match(make, /setUndo\(trn\(created\.length, '\{count\} task added', '\{count\} tasks added'\), \(\) => \{ const ids = new Set\(created\); app\.state\.tasks = app\.state\.tasks\.filter\(task => !ids\.has\(task\.id\)\); saveState\(\); render\(\); \}\);/);
  assert.match(app, /else if \(action === 'quick-paste-tasks'\) createPastedTasks\(\);/);
  assert.match(app, /else if \(action === 'quick-paste-one'\) joinPastedLines\(\);/);
  assert.match(read('AGENTS.md'), /and a list pasted into Quick Add, which becomes several new tasks only after a confirmation, with one Undo \(R90\)/);
});

test('the new classes are styled and the lines are Serbian', () => {
  const css = read('css/styles.css');
  for (const rule of ['.quick-parse-item { cursor: pointer;', '.quick-parse-hint {', '.quick-suggest {', '.quick-suggest-slot:empty { display: none; }', '.quick-paste {', '.quick-paste-lines {', '.quick-paste-actions {']) assert.ok(css.includes(rule), rule);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Keep “{words}” in the title', 'Ostavi „{words}“ u naslovu'], ['Tap a part to keep it in the title.', 'Dodirni deo da ostane u naslovu.'], ['Suggestions', 'Predlozi'], ['Pasted list', 'Nalepljena lista'], ['As one task', 'Kao jedan zadatak'], ['… and {count} more', '… i još {count}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  for (const [en, value] of [
    ['A list of {count} lines', '{ one: "Lista od {count} reda", few: "Lista od {count} reda", other: "Lista od {count} redova" }'],
    ['Make {count} tasks', '{ one: "Napravi {count} zadatak", few: "Napravi {count} zadatka", other: "Napravi {count} zadataka" }'],
    ['{count} tasks added', '{ one: "Dodat je {count} zadatak", few: "Dodata su {count} zadatka", other: "Dodato je {count} zadataka" }'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${value}`), en);
  const guide = read('uputstvo.html');
  assert.ok(guide.includes('Dodirni prepoznati deo ispod naslova i on ostaje u naslovu (na primer film „Sutra“). Dok kucaš <code>#</code>, <code>+</code> ili <code>@</code>, nude se postojeće oznake, projekti i oblasti. Nalepljena lista postaje više zadataka, posle potvrde.'));
});

test('R90 shipped as 2.0.0-alpha.117 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 117) >= 117);
});
