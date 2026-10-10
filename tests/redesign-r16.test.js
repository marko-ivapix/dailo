// Redesign R16: "Početak" in the habit details window, and "Početak meseca" in the start sheet.
// Spec: docs/superpowers/specs/2026-10-10-redesign-r16-habit-start.md
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
const habitsUi = read('js/habits-ui.js');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

test('S13: the details window has a "Početak" row before "Kraj", and it opens on a fresh draft', () => {
  assert.match(habitsUi, /row\('habit-draft-start', 'ph-calendar-blank', tr\('Start'\), startLabel\(ctx, habit\)\),\n      row\('habit-draft-end',/);
  assert.match(habitsUi, /const DETAIL_OPENERS = new Set\(\[[^\]]*'habit-draft-start'/);
  assert.match(habitsUi, /function startLabel\(ctx, item\) \{\n    return !item\.startDate \|\| item\.startDate === ctx\.Core\.dateOnly\(\) \? tr\('Today'\) : ctx\.relativeDateLabel\(item\.startDate\);\n  \}/);
  assert.match(habitsUi, /habitWindowRow\(ctx, 'habit-draft-start', 'ph-calendar-blank', tr\('Start'\), startLabel\(ctx, d\)\)/, 'the new habit window shares the label');
});

function sheetCtx(kind, today = '2026-10-10') {
  const ctx = withI18n({
    Core: { ...Core, dateOnly: () => today }, esc,
    dateSheet: { target: { type: 'habit' }, kind, date: null, time: null, view: { y: 2026, m: 9 } },
    modalState: { type: 'habit-details', draft: { name: 'Walk' } },
    getTask: () => ({ title: 'Task' }), monthGrid: () => '<grid>', relativeDateLabel: value => value,
  });
  vm.createContext(ctx);
  vm.runInContext(`${fn('nextMonday')}${fn('parseLocalDate')}${fn('dateSheetHtml')}`, ctx);
  return ctx;
}
const chips = html => [...html.matchAll(/data-pop-action="date-sheet-pick" data-date="([^"]+)" aria-pressed="[a-z]+">([^<]+)</g)].map(match => [match[2], match[1]]);

test('the start sheet offers "Početak meseca", "Danas" and "Sutra"; other date sheets keep theirs', () => {
  assert.deepEqual(chips(sheetCtx('start').dateSheetHtml()), [['Start of the month', '2026-10-01'], ['Today', '2026-10-10'], ['Tomorrow', '2026-10-11']]);
  assert.deepEqual(chips(sheetCtx('start', '2026-10-01').dateSheetHtml()).map(chip => chip[0]), ['Today', 'Tomorrow'], 'on the 1st, "Danas" is the start of the month');
  const plan = sheetCtx('plan');
  plan.dateSheet.target = { type: 'task', taskId: 't' };
  assert.deepEqual(chips(plan.dateSheetHtml()).map(chip => chip[0]), ['Today', 'Tomorrow', 'Start of next week']);
  assert.ok(sr.includes('"Start of the month": "Početak meseca"'));
});

function applyCtx(type) {
  const calls = [];
  const ctx = withI18n({
    Core, calls,
    dateSheet: { target: { type: 'habit' }, kind: 'start', date: '2026-10-01' },
    modalState: { type, draft: { startDate: '2026-10-08' } },
    closePopover: () => calls.push('close'), renderModal: () => calls.push('render'),
    callDomainHook: (hook, action) => calls.push(`${hook}:${action}`),
  });
  vm.createContext(ctx);
  vm.runInContext(fn('applyDateSheet'), ctx);
  ctx.applyDateSheet(false);
  return ctx;
}

test('"Primeni" saves at once in the details window and only fills the draft in the new habit window', () => {
  const details = applyCtx('habit-details');
  assert.equal(details.modalState.draft.startDate, '2026-10-01');
  assert.deepEqual(details.calls, ['close', 'handleAction:habit-details-commit']);
  const fresh = applyCtx('habit');
  assert.equal(fresh.modalState.draft.startDate, '2026-10-01');
  assert.deepEqual(fresh.calls, ['close', 'render']);
});

test('habit-details-commit saves the draft to the habit', async () => {
  let adapter;
  runInNewContextWithI18n(habitsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  const habit = { id: 'h', name: 'Walk', startDate: '2026-10-08', trackingType: 'checkbox', frequencyType: 'daily', goalIds: [], status: 'active' };
  const calls = [];
  const ctx = {
    Core, state: { habits: [habit], settings: {} },
    modalState: { type: 'habit-details', habitId: 'h', draft: { ...habit, startDate: '2026-10-01' } },
    getHabit: id => (id === 'h' ? habit : null), nowIso: () => '2026-10-10T08:00:00.000Z',
    saveState: () => calls.push('save'), syncHabitGoalLinks: () => {}, captureGoalProgress: () => null, evaluateGoalProgressChanges: () => {},
    refreshHabitMetrics: () => Promise.resolve(), render: () => calls.push('render'), renderModal: () => calls.push('renderModal'),
  };
  assert.equal(adapter.handleAction('habit-details-commit', null, ctx), true);
  assert.equal(habit.startDate, '2026-10-01');
  assert.ok(calls.includes('save'));
  assert.equal(ctx.modalState.draft, null);
  assert.equal(adapter.handleAction('habit-details-commit', null, { ...ctx, modalState: { type: 'habit' } }), true, 'nothing to save outside the details window');
});

test('R16 is released as 2.0.0-alpha.39', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.39');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.39';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.39');
});
