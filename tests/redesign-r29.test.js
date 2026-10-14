// Redesign R29: richer real-life starter examples for "Popuni primerima" — a camping packing list, a bucket list,
// everyday habits, goals with milestones, recurring chores, tags, notes, resources and templates.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r29-real-life-examples.md
// R67 replaced that example set with the user's own (tests/own-examples-r67.test.js checks its content, the second run,
// the toast, the rollback and the Serbian names). What stays here holds for any example set: it validates, it loads
// before the habits module and works offline, and stored goals keep a valid progress type.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const Starter = require('../js/starter-examples.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];

function emptyState() {
  return { version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} };
}

function harness(state = emptyState(), { saveOk = true } = {}) {
  let adapter;
  let counter = 0;
  const toasts = [];
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoStarterExamples: Starter }, requestAnimationFrame: run => run() });
  const draftCtx = withI18n({ Core });
  vm.createContext(draftCtx);
  vm.runInContext(fn('habitDraft'), draftCtx);
  const ctx = {
    state, Core, uid: prefix => `${prefix}_${++counter}`, nowIso: () => '2026-10-11T08:00:00.000Z',
    habitDraft: (...args) => plain(draftCtx.habitDraft(...args)), areaDefaults: { color: PROJECT_COLORS[0], icon: 'ph-circle' }, PROJECT_COLORS,
    saveState: () => saveOk, render() {}, setToastMessage: text => toasts.push(text), refreshHabitMetrics: () => Promise.resolve(),
  };
  const run = async () => { adapter.handleAction('add-starter-examples', null, ctx); await new Promise(resolve => setImmediate(resolve)); };
  return { ctx, state, run, toasts };
}


test('R29: the whole example workspace passes state and backup validation', async () => {
  const { state, run } = harness();
  await run();
  const normalized = Core.normalizeState(plain(state));
  const result = Core.validateStateV3(normalized);
  assert.equal(result.ok, true, result.reason);
  assert.doesNotThrow(() => Backup.validateDomain(normalized, [], []));
});

test('R29: the examples load before the habits module and work offline', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="js/starter-examples.js"') > 0 && html.indexOf('src="js/starter-examples.js"') < html.indexOf('src="js/habits-ui.js"'));
  assert.match(read('sw.js'), /'js\/starter-examples\.js',\n  'js\/habits-ui\.js',/);
  // R67: the Settings row describes the user's own set (checked in tests/own-examples-r67.test.js).
});

test('R29 shipped as 2.0.0-alpha.54 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 54);
});

test('R29: the first set\'s goals save a valid progress type, and an invalid stored one reads as a percentage', async () => {
  const { state, run } = harness();
  await run();
  assert.ok(state.goals.every(goal => ['percentage', 'numeric'].includes(goal.progressType)), 'without normalizing first');
  assert.doesNotThrow(() => Backup.validateDomain(plain(state), [], []));
  const stored = { ...emptyState(), goals: [{ id: 'goal_old', title: 'Old', progressMode: 'linkedTasks', progressType: 'linkedTasks', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }, { id: 'goal_numeric', title: 'Numeric', progressMode: 'manual', progressType: 'numeric', currentValue: 2, targetValue: 5, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }] };
  assert.deepEqual(Core.normalizeState(stored).goals.map(goal => goal.progressType), ['percentage', 'numeric']);
});
