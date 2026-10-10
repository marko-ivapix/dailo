// Redesign R11e: the "Nova redovna obaveza" window with the shared repeat editor (S15, S4, K4).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r11e-new-recurring-task.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const SATURDAY = '2026-10-10';
const today = value => (value ? Core.dateOnly(value) : SATURDAY);

// The real editor functions from app.js, as the window gets them through the domain context.
function editorFunctions() {
  const ctx = {
    Core: { ...Core, dateOnly: today }, esc, popoverEl: null, document: {}, $: () => null,
    parseLocalDate: value => { const [y, m, d] = String(value).split('-').map(Number); return new Date(y, m - 1, d, 12); },
    formatDate: value => `F:${value}`, cssEscape: String,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${app.match(/  const REPEAT_[\s\S]*?\n\n/)[0]}${['recurrenceLabel', 'repeatList', 'repeatEditorState', 'repeatRuleFromSheet', 'repeatPresetOn', 'repeatEditorHtml', 'repeatEditorUpdate', 'repeatEditorSetStart', 'repeatFocusSelector', 'repeatEditorError', 'readRepeatInputs'].map(fn).join('\n')}`, ctx);
  return ctx;
}

function load() {
  let adapter;
  runInNewContextWithI18n(read('js/cleaning-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  return adapter;
}

function context(extra = {}) {
  const calls = [];
  const editor = editorFunctions();
  const state = {
    areas: [{ id: 'home', name: 'Home', status: 'active' }],
    projects: [
      { id: 'g1', name: 'Kupatilo', isCleaningRoom: true, isArchived: false, areaId: 'home', order: 0 },
      { id: 'g2', name: 'Auto', isCleaningRoom: true, isArchived: false, areaId: 'home', order: 1 },
      { id: 'g3', name: 'Bašta', isCleaningRoom: true, isArchived: true, areaId: 'home', order: 2 },
    ],
    tasks: [], goals: [], resources: [], ui: {}, settings: {},
  };
  const ctx = {
    calls, state, esc, Core: { ...Core, dateOnly: today },
    modalState: null, inputs: {},
    $: selector => ctx.inputs[selector] || null,
    allProjects: () => state.projects.slice().sort((a, b) => a.order - b.order),
    sortedProjects: () => state.projects.filter(project => !project.isArchived),
    getProject: id => state.projects.find(project => project.id === id) || null,
    setModalState: value => { ctx.modalState = value; },
    renderModal: () => calls.push(['renderModal']), closeModal: () => calls.push(['closeModal']), render: () => calls.push(['render']),
    saveState: () => calls.push(['save']), setToastMessage: message => calls.push(['toast', message]), navigate: route => calls.push(['navigate', route]),
    relativeDateLabel: value => (value === SATURDAY ? 'Today' : value === '2026-10-11' ? 'Tomorrow' : `L:${value}`),
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    uid: kind => `${kind}-new`, nowIso: () => '2026-10-10T08:00:00.000Z',
    repeatEditorState: editor.repeatEditorState, repeatEditorHtml: editor.repeatEditorHtml, repeatEditorUpdate: editor.repeatEditorUpdate,
    repeatEditorError: editor.repeatEditorError, repeatEditorSetStart: editor.repeatEditorSetStart, repeatRuleFromSheet: editor.repeatRuleFromSheet, repeatFocusSelector: editor.repeatFocusSelector,
    readRepeatInputs: s => { const date = ctx.inputs['#repeat-end-date'], count = ctx.inputs['#repeat-end-count']; if (date) s.endDate = date.value; if (count) s.endAfterOccurrences = count.value; },
    ...extra,
  };
  return ctx;
}
const act = (adapter, ctx, action, data = {}) => adapter.handleAction(action, { target: { closest: () => ({ dataset: data }) } }, ctx);
const modal = (adapter, ctx) => adapter.renderRoute({ type: 'modal', modalType: 'cleaning-chore' }, ctx);

test('S15: the window has the name, Grupa, Počinje, the repeat editor inside and "Zakaži obavezu"', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-chore', { projectId: 'g2' });
  assert.equal(ctx.modalState.type, 'cleaning-chore');
  const html = modal(adapter, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet habit-window chore-window"><div class="modal-header"><h2 class="modal-title">New recurring task<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><input id="cleaning-chore-title" class="quick-title-input" type="text" maxlength="120" autocomplete="off" placeholder="Vacuum, pay a bill, change the oil…" value="" aria-label="Chore">/);
  assert.deepEqual([...html.matchAll(/data-action="chore-group" data-value="([^"]*)" aria-pressed="(\w+)">([^<]+)</g)].map(match => `${match[3]}${match[2] === 'true' ? '*' : ''}`), ['Kupatilo', 'Auto*', 'No group'], 'the group of "+ Dodaj obavezu"; archived groups left out');
  assert.deepEqual([...html.matchAll(/data-action="chore-start" data-value="([^"]+)" aria-pressed="(\w+)">([^<]+)</g)].map(match => `${match[3]}${match[2] === 'true' ? '*' : ''}`), ['Today*', 'Tomorrow', 'Start of next week']);
  assert.match(html, /<input id="cleaning-chore-start" class="input chore-start-date" type="date" value="2026-10-10" aria-label="Start date">/);
  assert.match(html, /<h3 class="sheet-group-title">Repeat<\/h3><div class="sheet-chips"><button class="quick-chip" type="button" data-pop-action="repeat-preset"/, 'the editor body follows, without a sheet title');
  assert.match(html, /data-repeat-summary>On Saturdays<\/p>/, 'weekly on the start day');
  assert.doesNotMatch(html, /popover-title|repeat-apply|repeat-clear/);
  assert.match(html, /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-cleaning-chore">Schedule chore<\/button><\/div><\/div><\/frame>$/);
  const fromPlus = context();
  act(adapter, fromPlus, 'new-cleaning-chore');
  assert.equal(fromPlus.modalState.draft.projectId, 'g1', 'the floating "+" picks the first group');
});

test('S15: group and start choices and the inline editor refresh the window', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-chore', { projectId: 'g1' });
  ctx.inputs['#cleaning-chore-title'] = { value: 'Plati internet' };
  act(adapter, ctx, 'chore-group', { value: '' });
  assert.equal(ctx.modalState.draft.projectId, '');
  assert.equal(ctx.modalState.draft.title, 'Plati internet', 'the typed name stays');
  act(adapter, ctx, 'chore-start', { value: '2026-10-11' });
  assert.deepEqual([ctx.modalState.draft.start, ctx.modalState.draft.repeat.start], ['2026-10-11', '2026-10-11']);
  adapter.handleInput({ target: { id: 'cleaning-chore-start', value: '2026-10-12' } }, ctx);
  assert.deepEqual([ctx.modalState.draft.start, ctx.modalState.draft.repeat.start], ['2026-10-12', '2026-10-12']);
  assert.equal(act(adapter, ctx, 'repeat-frequency', { value: 'monthly' }), true);
  assert.equal(ctx.modalState.draft.repeat.frequency, 'monthly');
  assert.deepEqual(ctx.calls.at(-1), ['renderModal']);
  act(adapter, ctx, 'repeat-month-day', { value: '10' });
  assert.match(modal(adapter, ctx), /data-repeat-summary>Every month on day 10<\/p>/);
  assert.equal(act(adapter, ctx, 'repeat-apply'), false, 'the sheet-only actions are not the window\'s');
  ctx.modalState = { type: 'task' };
  assert.equal(act(adapter, ctx, 'repeat-step', { step: '1' }), false, 'outside the window the sheet handles the editor');
});

test('S15: a new start moves the editor\'s untouched day along; a chosen day stays', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-chore', { projectId: 'g1' });
  const repeat = () => ctx.modalState.draft.repeat;
  act(adapter, ctx, 'chore-start', { value: '2026-10-11' });
  assert.deepEqual([plain(repeat().weekdays), repeat().monthDay, repeat().weekOfMonth, repeat().weekday], [[0], 11, 2, 0], 'Sunday the 11th, the second Sunday');
  act(adapter, ctx, 'repeat-day', { day: '3' });
  act(adapter, ctx, 'chore-start', { value: '2026-10-12' });
  assert.deepEqual(plain(repeat().weekdays), [0, 3], 'chosen days stay');
  assert.match(app, /function repeatEditorSetStart\(s, start\)/);
});

test('S15: saving checks the name and the end, then schedules the first matching day', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-chore', { projectId: 'g1' });
  ctx.inputs['#cleaning-chore-title'] = { value: '  ' };
  act(adapter, ctx, 'save-cleaning-chore');
  assert.equal(ctx.modalState.draft.error, 'Enter a chore.');
  assert.match(modal(adapter, ctx), /<input id="cleaning-chore-title" class="quick-title-input is-error"[^>]*><div class="validation" role="alert">Enter a chore\.<\/div>/);
  ctx.inputs['#cleaning-chore-title'] = { value: 'Plati internet' };
  act(adapter, ctx, 'repeat-frequency', { value: 'monthly' });
  act(adapter, ctx, 'repeat-month-day', { value: '15' });
  act(adapter, ctx, 'repeat-end', { value: 'date' });
  ctx.inputs['#repeat-end-date'] = { value: '' };
  act(adapter, ctx, 'save-cleaning-chore');
  assert.equal(ctx.modalState.draft.repeat.error, 'Choose a valid end date or number of times.');
  assert.equal(ctx.state.tasks.length, 0);
  ctx.inputs['#repeat-end-date'] = { value: '2027-06-30' };
  act(adapter, ctx, 'save-cleaning-chore');
  const [task] = ctx.state.tasks;
  assert.deepEqual([task.id, task.title, task.projectId, task.areaId, task.plannedDate, task.dueDate, task.isInbox, task.isCompleted], ['task-new', 'Plati internet', 'g1', null, '2026-10-15', '2026-10-15', false, false]);
  assert.deepEqual(plain(task.recurrence), { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 15, status: 'active', endType: 'date', endDate: '2027-06-30', endAfterOccurrences: null, occurrencesCreated: 0, skipNext: false, seriesId: 'task-new' });
  assert.deepEqual(ctx.calls.slice(-4).map(call => call[0]), ['save', 'closeModal', 'render', 'toast']);
  assert.equal(ctx.calls.at(-1)[1], 'Scheduled · first time l:2026-10-15');
});

test('S4: "Bez grupe" keeps the task out of every project, and Sutra says so in the message', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-chore', { projectId: 'g1' });
  ctx.inputs['#cleaning-chore-title'] = { value: 'Zalij cveće' };
  act(adapter, ctx, 'chore-group', { value: '' });
  act(adapter, ctx, 'chore-start', { value: '2026-10-11' });
  act(adapter, ctx, 'repeat-preset', { preset: '0' });
  act(adapter, ctx, 'save-cleaning-chore');
  const [task] = ctx.state.tasks;
  assert.deepEqual([task.projectId, task.areaId, task.plannedDate, task.recurrence.frequency], [null, null, '2026-10-11', 'daily']);
  assert.equal(ctx.calls.at(-1)[1], 'Scheduled · first time tomorrow');
});

test('the editor is shared: the sheet wraps the same body, and the direct "+" opens the window', () => {
  assert.match(app, /return `<div class="popover-title">\$\{tr\('Repeat'\)\}<\/div>\$\{source\?\.title \? `<p class="sheet-subtitle">\$\{esc\(source\.title\)\}<\/p>` : ''\}\$\{repeatEditorHtml\(s\)\}\$\{controls\}/);
  assert.match(app, /'#cleaning': \[msg\('New recurring task'\), \(\) => callDomainHook\('handleAction', 'new-cleaning-chore', \{ target: \$\('#mobile-quick-add-toggle'\) \}\)\]/);
  assert.match(app, /repeatEditorState, repeatEditorHtml, repeatEditorUpdate, repeatEditorError, repeatEditorSetStart, repeatRuleFromSheet, repeatFocusSelector, readRepeatInputs,/);
  const cleaning = read('js/cleaning-ui.js');
  assert.doesNotMatch(cleaning, /cleaning-chore-frequency|cleaning-chore-interval|cleaning-chore-reminder|cleaning-chore-project|Schedule cleaning chore/);
});

test('the R11e layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R11e'));
  assert.ok(layer.length > 20, 'R11e layer');
  assert.ok(layer.includes('.chore-start-date'));
  for (const [en, value] of [['New recurring task', 'Nova redovna obaveza'], ['Vacuum, pay a bill, change the oil…', 'Usisaj, plati račun, promeni ulje…'], ['Enter a chore.', 'Unesi obavezu.'], ['Scheduled · first time {date}', 'Zakazano · prvi put {date}'], ['Schedule chore', 'Zakaži obavezu'], ['Starts', 'Počinje']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R11e is released as 2.0.0-alpha.30', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.30');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.30';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.30');
});
