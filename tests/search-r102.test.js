// R102: Pretraga. Every search ignores case, diacritics and the script: Cyrillic reads as Latin, and "đ", "dj" and
// "ђ" all read as "d" (Core.searchFold), so "cacak" and "Чачак" find "Čačak", and "Djordje" finds "Đorđe". Global
// Search keeps its ranking (title equal, title contains, notes contain; projects by name) and its scope (tasks and
// projects). Ctrl/Cmd+K opens a command palette: screens and actions by typing, and "Pretraži „…“" for the words.
// Spec: docs/superpowers/specs/2026-10-15-r102-search.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

test('one fold for every search: case, diacritics, Cyrillic and "đ"/"dj" all fall away', () => {
  for (const value of ['Đorđe', 'Djordje', 'Dordje', 'Ђорђе', 'DJORDJE']) assert.equal(Core.searchFold(value), 'dorde', value);
  for (const value of ['Čačak', 'cacak', 'Чачак', 'ČAČAK']) assert.equal(Core.searchFold(value), 'cacak', value);
  assert.equal(Core.searchFold('Љубав и шешир'), 'ljubav i sesir');
  assert.equal(Core.searchFold(null), '');
});

test('global Search finds across scripts and diacritics with the same ranking and scope', () => {
  const tasks = [
    { id: 'notes', title: 'Pozovi majstora', notes: 'Za put u Čačak', updatedAt: '2026-10-03' },
    { id: 'title', title: 'Put u Čačak', notes: '', updatedAt: '2026-10-01' },
    { id: 'exact', title: 'čačak', notes: '', updatedAt: '2026-10-02' },
    { id: 'other', title: 'Kupovina', notes: '', updatedAt: '2026-10-04' },
  ];
  const projects = [{ id: 'p1', name: 'Rođendan za Đorđa' }, { id: 'p2', name: 'Selidba' }];
  for (const query of ['cacak', 'Чачак', ' ČAČAK ']) {
    const result = Core.searchItems(tasks, projects, query);
    assert.deepEqual(result.tasks.map(item => [item.task.id, item.rank]), [['exact', 0], ['title', 1], ['notes', 2]], query);
  }
  assert.deepEqual(Core.searchItems(tasks, projects, 'djordj').projects.map(item => item.id), ['p1']);
  assert.deepEqual(Core.searchItems(tasks, projects, 'Ђорђ').projects.map(item => item.id), ['p1']);
  assert.deepEqual(Core.searchItems(tasks, projects, '   '), { tasks: [], projects: [] });
});

test('the journal, notes and resources and the pickers search the same way', () => {
  assert.match(functionSource('listHtml', ['js/journal-ui.js']).source, /const q = ctx\.Core\.searchFold\(query\.trim\(\)\);/);
  assert.match(read('js/journal-ui.js'), /filter\(item => !q \|\| ctx\.Core\.searchFold\(item\.text\)\.includes\(q\)\)/);
  const knowledge = read('js/knowledge.js');
  assert.match(knowledge, /function matchesQuery\(context, type, item, query\) \{\n\s+const fold = context\.Core\.searchFold;/);
  assert.match(knowledge, /&& matchesQuery\(context, type, item, queries\[type\]\)\)/);
  const app = read('js/app.js');
  assert.match(app, /const query = Core\.searchFold\(event\.target\.value\.trim\(\)\);/);
  assert.match(app, /data-search="\$\{esc\(Core\.searchFold\(project\.name\)\)\}"/);
  assert.match(app, /data-search="\$\{esc\(Core\.searchFold\(tag\.name\)\)\}"/);
  assert.match(knowledge, /data-search="\$\{esc\(context\.Core\.searchFold\(item\.title \|\| item\.name\)\)\}"/);
});

function palette(query = '') {
  let module;
  runInNewContextWithI18n(read('js/palette-ui.js'), { window: { TodoDomainModules: { register: value => { module = value; } } }, requestAnimationFrame: run => run() });
  const calls = [];
  const ctx = {
    calls, esc, Core, modalState: { type: 'palette', query, selected: 0 },
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    $: () => null, closeModal: () => calls.push(['close']), navigate: route => calls.push(['navigate', route]), openSearch: text => calls.push(['search', text]),
    openQuickAdd: () => calls.push(['new-task']), openProjectModal: () => calls.push(['new-project']), openHabitModal: () => calls.push(['new-habit']),
    openKnowledgeWindow: type => calls.push(['new-knowledge', type]), renderModal: () => calls.push(['render']),
    setModalState: value => { ctx.modalState = value; }, captureModalReturnFocus() {}, closePopover() {},
  };
  return { module, ctx, html: () => module.renderRoute({ type: 'modal', modalType: 'palette' }, ctx) };
}
const labels = html => [...html.matchAll(/<span class="palette-label">([^<]+)<\/span><span class="palette-kind">([^<]+)<\/span>/g)].map(match => `${match[1]} (${match[2]})`);

test('the palette lists actions and screens, filters them by typing and offers Search for the words', () => {
  const view = palette();
  const html = view.html();
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet palette-window"><label class="search-box"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input id="palette-query" class="search-input" type="text" autocomplete="off" placeholder="Type a screen or an action" value="" aria-label="Command palette" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant="palette-item-0"><\/label><div id="palette-list" class="palette-list" role="listbox" aria-label="Command palette">/);
  assert.deepEqual(labels(html).slice(0, 5), ['New task (Action)', 'New project (Action)', 'New habit (Action)', 'New note (Action)', 'Today (Screen)']);
  assert.match(html, /<button class="palette-row is-active" type="button" id="palette-item-0" role="option" aria-selected="true" data-action="palette-run" data-index="0">/);
  view.module.handleInput({ type: 'input', target: { id: 'palette-query', value: 'calen' } }, view.ctx);
  assert.deepEqual(labels(view.html()), ['Calendar (Screen)', 'Search for “calen” (Search)']);
  view.ctx.modalState.query = 'ЦАЛЕН';
  assert.deepEqual(labels(view.html()), ['Calendar (Screen)', 'Search for “ЦАЛЕН” (Search)'], 'Cyrillic typing finds the Latin names');
  view.ctx.modalState.query = 'zzz';
  assert.deepEqual(labels(view.html()), ['Search for “zzz” (Search)']);
});

test('arrows move the choice, Enter runs it; a screen navigates, an action opens its window, Search keeps the words', () => {
  const view = palette('');
  const key = name => view.module.handleInput({ type: 'keydown', key: name, target: { id: 'palette-query' }, preventDefault() {} }, view.ctx);
  key('ArrowDown'); key('ArrowDown');
  assert.equal(view.ctx.modalState.selected, 2);
  key('ArrowUp');
  assert.equal(view.ctx.modalState.selected, 1);
  key('Enter');
  assert.deepEqual(view.ctx.calls.slice(-2), [['close'], ['new-project']]);
  const screen = palette('calendar');
  screen.module.handleAction('palette-run', { target: { closest: () => ({ dataset: { index: '0' } }) } }, screen.ctx);
  assert.deepEqual(screen.ctx.calls.slice(-2), [['close'], ['navigate', 'calendar']]);
  const search = palette('Čačak');
  search.module.handleAction('palette-run', { target: { closest: () => ({ dataset: { index: '0' } }) } }, search.ctx);
  assert.deepEqual(search.ctx.calls.slice(-2), [['close'], ['search', 'Čačak']]);
});

test('Ctrl/Cmd+K opens the palette; the module is part of the app shell; the styles exist', () => {
  const app = read('js/app.js');
  assert.match(app, /if \(combination === 'Ctrl\/Cmd\+K'\) \{ event\.preventDefault\(\); openPalette\(\); return; \}/);
  assert.match(functionSource('openPalette').source, /modalState = \{ type: 'palette', query: '', selected: 0 \};/);
  assert.match(functionSource('openSearch').source, /function openSearch\(query = ''\) \{/);
  assert.match(app, /openSearch, openKnowledgeWindow, openPalette,/);
  // R110–R112: the modules split out of app.js load between the palette and app.js.
  assert.match(read('index.html'), /<script src="js\/sidebar-ui\.js"><\/script>\n  <script src="js\/palette-ui\.js"><\/script>\n  <script src="js\/drag-ui\.js"><\/script>\n/);
  assert.match(read('sw.js'), /'js\/sidebar-ui\.js',\n  'js\/palette-ui\.js',\n  'js\/drag-ui\.js',\n/);
  const css = read('css/styles.css');
  for (const rule of ['.palette-window {', '.palette-list {', '.palette-row {', '.palette-row.is-active', '.palette-label {', '.palette-kind {', '.palette-hint {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide and Šta je novo mention them', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Type a screen or an action', 'Upiši ekran ili radnju'], ['Command palette', 'Paleta komandi'], ['Search for “{query}”', 'Pretraži „{query}“'], ['Screen', 'Ekran'],
    ['Action', 'Radnja'], ['↑ ↓ to choose, Enter to open, Esc to close.', '↑ ↓ za izbor, Enter za otvaranje, Esc za zatvaranje.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('Pretraga ne pravi razliku između velikih i malih slova, slova sa kvačicama i bez njih, ni latinice i ćirilice: „cacak“ nalazi „Čačak“, a reč otkucana ćirilicom nalazi istu reč napisanu latinicom. Na računaru <strong>Ctrl+K</strong> (na Mac-u <strong>Cmd+K</strong>) otvara paletu komandi: upiši ekran ili radnju i pritisni Enter.'));
  assert.ok(read('novo.html').includes('<li><strong>Pretraga bez kvačica i na ćirilici.</strong>'));
});

test('R102 shipped as 2.0.0-alpha.130 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 130) >= 130);
});
