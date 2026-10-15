// R98b: a habit made or edited in the habit window stored its unused end fields as empty text (endDate: '' and
// successfulPeriodsTarget: '', since R8b). Backups refuse them, so the ZIP export and the automatic snapshot failed
// with "Neispravna rezervna kopija: endDate". The window now stores null like the details sheet, and loading the data
// turns the empty text already stored into null.
// Spec: docs/superpowers/specs/2026-10-15-r98b-habit-end-fields.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

// The draft as app.js habitDraft() builds it for a new habit.
function draft(fields = {}) {
  const ctx = { Core };
  vm.createContext(withI18n(ctx));
  vm.runInContext(functionSource('habitDraft').source, ctx);
  return { ...plain(ctx.habitDraft()), ...fields };
}

function save(fields = {}, existing = null) {
  let module;
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { module = value; } } }, requestAnimationFrame: run => run() });
  const state = emptyState({ habits: existing ? [existing] : [] });
  const ctx = {
    Core, state, inputs: { '#habit-name': 'Šetnja' },
    modalState: { type: 'habit', habitId: existing?.id || null, draft: draft(fields), error: '' },
    $: selector => (selector in ctx.inputs ? { value: ctx.inputs[selector] } : null), $$: () => [],
    renderModal: () => {}, closeModal: () => {}, render: () => {}, saveState: () => true, refreshHabitMetrics: () => Promise.resolve(),
    setToastMessage: () => {}, nowIso: () => '2026-10-15T08:00:00.000Z', uid: kind => `${kind}-1`,
    getHabit: id => state.habits.find(habit => habit.id === id), captureGoalProgress: () => null, evaluateGoalProgressChanges: () => {},
    syncHabitGoalLinks: (habit, ids) => { habit.goalIds = [...ids]; },
  };
  module.handleAction('save-habit', { target: { closest: () => ({ dataset: {} }) } }, ctx);
  assert.equal(ctx.modalState.error, '');
  return plain(state);
}

test('a new habit without an end stores null for the end date and the count, and the backup accepts it', () => {
  const state = save();
  const habit = state.habits[0];
  assert.equal(habit.endType, 'never');
  assert.equal(habit.endDate, null);
  assert.equal(habit.successfulPeriodsTarget, null);
  Backup.validateDomain(Core.normalizeState(state), [], []);
});

test('an end by date or by successful days keeps its value; the other field is null', () => {
  const dated = save({ endType: 'date', endDate: '2026-12-31' }).habits[0];
  assert.deepEqual([dated.endDate, dated.successfulPeriodsTarget], ['2026-12-31', null]);
  const counted = save({ endType: 'successfulPeriods', successfulPeriodsTarget: 30 }).habits[0];
  assert.deepEqual([counted.endDate, counted.successfulPeriodsTarget], [null, 30]);
  Backup.validateDomain(Core.normalizeState(emptyState({ habits: [{ ...dated, id: 'a' }, { ...counted, id: 'b' }] })), [], []);
});

test('editing a habit in the window clears the end it no longer has', () => {
  const before = save({ endType: 'date', endDate: '2026-12-31' }).habits[0];
  const after = save({ ...before, endType: 'never' }, before).habits[0];
  assert.deepEqual([after.endType, after.endDate, after.successfulPeriodsTarget], ['never', null, null]);
});

test('loading turns the empty text already stored into null, so the backup works again', () => {
  const stored = save().habits[0];
  const broken = { ...stored, endDate: '', successfulPeriodsTarget: '' };
  assert.throws(() => Backup.validateDomain(emptyState({ habits: [broken] }), [], []), /Invalid backup: endDate/, 'what failed before');
  const state = Core.normalizeState(emptyState({ habits: [broken] }));
  assert.deepEqual([state.habits[0].endDate, state.habits[0].successfulPeriodsTarget], [null, null]);
  Backup.validateDomain(state, [], []);
  const kept = Core.normalizeState(emptyState({ habits: [{ ...stored, endType: 'date', endDate: '2026-12-31' }] })).habits[0];
  assert.equal(kept.endDate, '2026-12-31', 'a real end date stays');
});

test('R98b shipped as 2.0.0-alpha.126 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 126) >= 126);
  assert.ok(read('novo.html').includes('<li><strong>Rezervna kopija ponovo radi uz nove navike.</strong>'));
});
