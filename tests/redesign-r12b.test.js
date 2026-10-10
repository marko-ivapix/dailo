// Redesign R12b: Dnevnik and the entry window (J1, J2, J3, J5, J7, J9).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r12b-journal-screen.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = '2026-10-10';
const stamp = '2026-10-08T20:00:00.000Z';
const entry = (date, fields = {}) => ({ id: `journal_${date}`, date, text: '', mood: null, createdAt: stamp, updatedAt: stamp, ...fields });

function load() {
  let adapter;
  runInNewContextWithI18n(read('js/journal-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  return adapter;
}

function context(journal = [], extra = {}) {
  const calls = [];
  const state = { journal, tasks: [], habits: [], habitLogCache: {}, ui: {}, settings: {} };
  const ctx = {
    calls, state, esc, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) },
    modalState: null, inputs: {},
    $: selector => ctx.inputs[selector] || null,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    formatDate: (value, mode) => `${mode === 'full' ? 'FULL' : 'F'}:${value}`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    nowIso: () => '2026-10-10T19:00:00.000Z',
    setModalState: value => { ctx.modalState = value; },
    renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']), saveState: () => calls.push(['save']), saveAndRender: () => calls.push(['saveAndRender']),
    scheduleTextSave: () => calls.push(['textSave']), closePopover: () => calls.push(['closePopover']),
    openPopover: (anchor, html, meta) => calls.push(['open', meta?.type, html]),
    openConfirm: config => { ctx.modalState = { type: 'confirm', ...config }; calls.push(['confirm', config]); },
    setUndo: (message, undo) => calls.push(['undo', message, undo]),
    openQuickAdd: context => calls.push(['quickAdd', plain(context)]),
    ...extra,
  };
  return ctx;
}
const act = (adapter, ctx, action, data = {}) => adapter.handleAction(action, { target: { closest: () => ({ dataset: data }) } }, ctx);
const screen = (adapter, ctx) => adapter.renderRoute({ type: 'journal' }, ctx);
const window_ = (adapter, ctx) => adapter.renderRoute({ type: 'modal', modalType: 'journal' }, ctx);

test('J3, J7: the month, the day strip with faces and dots, and the entries newest first', () => {
  const adapter = load();
  const ctx = context([entry('2026-10-01', { text: 'First day of the month.' }), entry('2026-10-07', { text: 'Presentation done.\nTomorrow: call Ana', mood: 4 }), entry('2026-10-09', { mood: 2 }), entry('2026-09-30', { text: 'September' })]);
  const html = screen(adapter, ctx);
  assert.match(html, /^<header title="Journal" subtitle="4 entries"><\/header><div class="journal-month"><strong class="journal-month-title">October 2026<\/strong><span class="journal-month-arrows"><button class="btn-icon" type="button" data-action="journal-month" data-step="-1" aria-label="Previous month">/);
  assert.match(html, /data-action="journal-month" data-step="1" disabled aria-label="Next month"/, 'no months after this one');
  const days = [...html.matchAll(/<button class="journal-day([^"]*)" type="button" data-action="open-journal" data-date="([^"]+)"( disabled)? aria-label="([^"]+)">([\s\S]*?)<\/button>/g)];
  assert.equal(days.length, 31);
  const day = date => days.find(match => match[2] === date);
  assert.match(day('2026-10-07')[5], /^<span class="journal-day-name">Wed<\/span><strong>7<\/strong><span class="journal-day-mood" aria-hidden="true">🙂<\/span>$/);
  assert.equal(day('2026-10-07')[4], 'FULL:2026-10-07, has an entry, good');
  assert.match(day('2026-10-01')[5], /<span class="journal-day-dot" aria-hidden="true"><\/span>$/, 'an entry without a mood shows a dot');
  assert.doesNotMatch(day('2026-10-02')[5], /journal-day-(dot|mood)/);
  assert.equal(day('2026-10-10')[1], ' is-today');
  assert.equal(day('2026-10-11')[3], ' disabled', 'future days are disabled');
  assert.match(html, /<label class="search-box journal-search"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input id="journal-query" class="search-input" type="search" autocomplete="off" placeholder="Search the journal" value="" aria-label="Search the journal"><\/label>/);
  const rows = [...html.matchAll(/<button class="journal-row" type="button" data-action="open-journal" data-date="([^"]+)">/g)].map(match => match[1]);
  assert.deepEqual(rows, ['2026-10-09', '2026-10-07', '2026-10-01', '2026-09-30'], 'every entry, newest first');
  assert.match(html, /data-date="2026-10-07"><span class="journal-row-head"><strong>FULL:2026-10-07<\/strong><span class="journal-row-mood" role="img" aria-label="Good">🙂<\/span><\/span><span class="journal-row-text">Presentation done\.\nTomorrow: call Ana<\/span><\/button>/);
  assert.match(html, /data-date="2026-10-09"><span class="journal-row-head"><strong>FULL:2026-10-09<\/strong><span class="journal-row-mood" role="img" aria-label="Poor">🙁<\/span><\/span><span class="journal-row-text"><i>No text<\/i><\/span>/);
  act(adapter, ctx, 'journal-month', { step: '-1' });
  assert.equal(ctx.state.ui.journalMonth, '2026-09');
  assert.match(screen(adapter, ctx), /September 2026[\s\S]*data-step="1" aria-label="Next month"/);
  act(adapter, ctx, 'journal-month', { step: '1' });
  act(adapter, ctx, 'journal-month', { step: '1' });
  assert.equal(ctx.state.ui.journalMonth, '2026-10', 'not past the current month');
});

test('J5: the screen\'s own search ignores case and diacritics and redraws only the list', () => {
  const adapter = load();
  const ctx = context([entry('2026-10-07', { text: 'Šetnja uz reku' }), entry('2026-10-06', { text: 'Sastanci ceo dan' })]);
  screen(adapter, ctx);
  ctx.inputs['#journal-list'] = { innerHTML: '' };
  assert.equal(adapter.handleInput({ target: { id: 'journal-query', value: 'SETNJA' } }, ctx), true);
  assert.match(ctx.inputs['#journal-list'].innerHTML, /data-date="2026-10-07"/);
  assert.doesNotMatch(ctx.inputs['#journal-list'].innerHTML, /data-date="2026-10-06"/);
  adapter.handleInput({ target: { id: 'journal-query', value: 'more' } }, ctx);
  assert.equal(ctx.inputs['#journal-list'].innerHTML, '<div class="empty-state"><h3>No entries with those words</h3><p>The search looks only at the journal text.</p></div>');
  assert.equal(ctx.calls.filter(call => call[0] === 'saveAndRender').length, 0, 'the field is not redrawn');
  const empty = screen(load(), context());
  assert.match(empty, /<div id="journal-list"><div class="empty-state"><h3>The journal is empty<\/h3><p>A tap on a day or “\+” opens that day’s entry\.<\/p><\/div><\/div>$/);
});

test('J2: the entry window with the date, the day summary, the moods, the text and the note', () => {
  const adapter = load();
  const ctx = context([entry('2026-10-09', { text: 'Long day', mood: 3 })]);
  ctx.state.tasks = [{ id: 't1', isCompleted: true, completedAt: '2026-10-09T08:00:00.000Z' }, { id: 't2', isCompleted: true, completedAt: '2026-10-09T15:00:00.000Z' }, { id: 't3', isCompleted: true, completedAt: '2026-10-08T15:00:00.000Z' }];
  ctx.state.habits = [{ id: 'h1', name: 'Walk', status: 'active', frequencyType: 'daily', startDate: '2026-10-01' }, { id: 'h2', name: 'Read', status: 'active', frequencyType: 'daily', startDate: '2026-10-01' }, { id: 'h3', name: 'Gym', status: 'active', frequencyType: 'timesPerWeek', timesPerWeek: 3, startDate: '2026-10-01' }];
  ctx.state.habitLogCache = { h1: [{ id: 'l1', habitId: 'h1', date: '2026-10-09', status: 'done' }] };
  act(adapter, ctx, 'open-journal', { date: '2026-10-09' });
  assert.deepEqual(plain(ctx.modalState), { type: 'journal', date: '2026-10-09' });
  const html = window_(adapter, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet journal-window"><div class="modal-header task-window-header"><span class="task-window-kind">Journal<\/span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="journal-menu" aria-label="Entry actions"><i class="ph ph-dots-three"><\/i><\/button><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><\/div><h2 class="journal-date">FULL:2026-10-09<\/h2><p class="journal-summary">Completed 2 tasks · habits 1\/2<\/p>/);
  assert.deepEqual([...html.matchAll(/<button class="journal-mood( is-selected)?" type="button" data-action="journal-mood" data-value="(\d)" aria-pressed="(\w+)"><span aria-hidden="true">(\S+)<\/span><small>(\w+)<\/small><\/button>/g)].map(match => `${match[4]} ${match[5]}${match[3] === 'true' ? '*' : ''}`), ['😞 Bad', '🙁 Poor', '😐 Okay*', '🙂 Good', '😄 Great']);
  assert.match(html, /<textarea id="journal-text" class="input journal-text" rows="10" placeholder="How did the day go\? What was good\? What tomorrow\?" aria-label="Entry">Long day<\/textarea><button class="quick-chip journal-task" type="button" data-action="journal-task-tomorrow">\+ Task for tomorrow<\/button><p class="sheet-note">Selected text or a “Tomorrow: …” line becomes the task title\. It saves while you type\. The journal is not in Search, only in its own search on the Journal screen\.<\/p><\/div><\/frame>$/);
  assert.deepEqual(plain(Core.journalDaySummary(ctx.state, Object.values(ctx.state.habitLogCache).flat(), '2026-10-09')), { completed: 2, habitsDone: 1, habitsDue: 2 });
});

test('J2: the first word or face creates the entry; a second tap clears the face; an emptied entry leaves on close', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'open-journal', {});
  assert.equal(ctx.modalState.date, TODAY, 'without a day it opens today');
  act(adapter, ctx, 'journal-closing');
  assert.deepEqual(ctx.state.journal, [], 'opening and closing leaves nothing');
  act(adapter, ctx, 'open-journal', { date: TODAY });
  assert.equal(adapter.handleInput({ target: { id: 'journal-text', value: 'Calm day' } }, ctx), true);
  assert.deepEqual(plain(ctx.state.journal), [{ id: 'journal_2026-10-10', date: TODAY, text: 'Calm day', mood: null, createdAt: '2026-10-10T19:00:00.000Z', updatedAt: '2026-10-10T19:00:00.000Z' }]);
  assert.deepEqual(ctx.calls.at(-1), ['textSave']);
  act(adapter, ctx, 'journal-mood', { value: '4' });
  assert.equal(ctx.state.journal[0].mood, 4);
  act(adapter, ctx, 'journal-mood', { value: '4' });
  assert.equal(ctx.state.journal[0].mood, null, 'a second tap clears the face');
  adapter.handleInput({ target: { id: 'journal-text', value: '   ' } }, ctx);
  act(adapter, ctx, 'journal-closing');
  assert.deepEqual(ctx.state.journal, [], 'an entry emptied of text and mood is removed on close');
  const moodOnly = context();
  act(adapter, moodOnly, 'open-journal', { date: '2026-10-09' });
  act(adapter, moodOnly, 'journal-mood', { value: '5' });
  act(adapter, moodOnly, 'journal-closing');
  assert.deepEqual(plain(moodOnly.state.journal).map(item => [item.date, item.mood, item.text]), [['2026-10-09', 5, '']], 'a face alone is an entry');
});

test('J2: ⋯ deletes the entry after asking, with Undo', () => {
  const adapter = load(), ctx = context([entry('2026-10-08', { text: 'Old' }), entry('2026-10-09', { text: 'Keep' })]);
  act(adapter, ctx, 'open-journal', { date: '2026-10-08' });
  act(adapter, ctx, 'journal-menu');
  assert.match(ctx.calls.find(call => call[0] === 'open')[2], /^<div class="popover-title">FULL:2026-10-08<\/div><div class="sheet-card"><button class="popover-option sheet-option is-danger" type="button" data-pop-action="journal-delete"><span class="sheet-option-label">Delete entry<\/span><\/button><\/div>$/);
  act(adapter, ctx, 'journal-delete');
  const [, config] = ctx.calls.find(call => call[0] === 'confirm');
  assert.deepEqual([config.title, config.message, config.confirmLabel], ['Delete this entry?', 'The entry and its mood are removed.', 'Delete entry']);
  config.onCancel();
  assert.deepEqual(plain(ctx.modalState), { type: 'journal', date: '2026-10-08' }, 'Cancel returns to the entry');
  act(adapter, ctx, 'journal-delete');
  ctx.modalState.onConfirm();
  assert.equal(ctx.modalState, null);
  assert.deepEqual(ctx.state.journal.map(item => item.date), ['2026-10-09']);
  const [, message, undo] = ctx.calls.filter(call => call[0] === 'undo').at(-1);
  assert.equal(message, 'Entry deleted');
  undo();
  assert.deepEqual(ctx.state.journal.map(item => item.date), ['2026-10-08', '2026-10-09']);
});

test('J9: "+ Zadatak za sutra" takes the selection or a "Sutra:" line, plans the day after (never before today) and returns', () => {
  const adapter = load(), ctx = context([entry('2026-10-10', { text: 'Good day.\nSutra: pozvati Anu' }), entry('2026-10-01', { text: 'Old' })]);
  act(adapter, ctx, 'open-journal', { date: TODAY });
  ctx.inputs['#journal-text'] = { value: 'Good day.\nSutra: pozvati Anu', selectionStart: 0, selectionEnd: 0 };
  act(adapter, ctx, 'journal-task-tomorrow');
  assert.deepEqual(ctx.calls.at(-1), ['quickAdd', { plannedDate: '2026-10-11', title: 'pozvati Anu', returnTo: { type: 'journal', date: TODAY } }]);
  ctx.inputs['#journal-text'] = { value: 'Good day. Buy bread.', selectionStart: 10, selectionEnd: 20 };
  act(adapter, ctx, 'journal-task-tomorrow');
  assert.equal(ctx.calls.at(-1)[1].title, 'Buy bread.', 'the selection wins');
  ctx.modalState = { type: 'journal', date: '2026-10-01' };
  ctx.inputs['#journal-text'] = { value: 'Old', selectionStart: 0, selectionEnd: 0 };
  act(adapter, ctx, 'journal-task-tomorrow');
  assert.deepEqual(ctx.calls.at(-1)[1], { plannedDate: TODAY, title: '', returnTo: { type: 'journal', date: '2026-10-01' } }, 'never before today');
  assert.match(app, /if \(context\.returnTo\) modalState\.returnTo = context\.returnTo;/);
  assert.match(app, /title: context\.title \|\| '', notes: ''/);
});

test('J1: Još → Biblioteka, the route, the direct "+", the closing hook, and the module is loaded and precached', () => {
  assert.match(app, /moreRow\('notes', 'ph-note', tr\('Notes'\), count\(state\.notes\)\),\n      moreRow\('journal', 'ph-book-open', tr\('Journal'\), count\(state\.journal\)\),/);
  assert.match(app, /'review', 'settings', 'journal'\]\.includes\(hash\)/);
  assert.match(app, /'#journal': \[msg\('Today’s entry'\), \(\) => callDomainHook\('handleAction', 'open-journal', \{ target: \$\('#mobile-quick-add-toggle'\) \}\)\]/);
  assert.match(app, /if \(modalState\?\.type === 'journal'\) callDomainHook\('handleAction', 'journal-closing', null\);/);
  const html = read('index.html');
  assert.ok(html.indexOf('src="js/journal-ui.js"') > html.indexOf('src="js/review-ui.js"') && html.indexOf('src="js/journal-ui.js"') < html.indexOf('src="js/app.js"'));
  assert.match(read('sw.js'), /'js\/review-ui\.js',\n  'js\/journal-ui\.js',/);
});

test('the R12b layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R12b'));
  assert.ok(layer.length > 20, 'R12b layer');
  for (const selector of ['.journal-month', '.journal-strip', '.journal-day', '.journal-day.is-today', '.journal-day-mood', '.journal-day-dot', '.journal-search', '.journal-row', '.journal-row-text', '.journal-window', '.journal-date', '.journal-summary', '.journal-moods', '.journal-mood', '.journal-text']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Journal', 'Dnevnik'], ['Bad', 'Loše'], ['Poor', 'Slabo'], ['Okay', 'Onako'], ['Good', 'Dobro'], ['Great', 'Odlično'], ['Mood', 'Raspoloženje'], ['Task for tomorrow', 'Zadatak za sutra'], ['Today’s entry', 'Današnji zapis'], ['How did the day go? What was good? What tomorrow?', 'Kako je prošao dan? Šta je bilo dobro? Šta sutra?']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R12b is released as 2.0.0-alpha.32', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.32');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.32';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.32');
});
