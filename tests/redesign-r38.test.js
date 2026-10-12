// Redesign R38: the third design pass, addition E — goal progress from milestones (data model).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r38-goal-milestones.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const goalsUi = read('js/goals-ui.js');
const sr = read('js/i18n-sr.js');
const milestone = (id, done) => ({ id, title: id, date: null, isCompleted: done, completedAt: done ? '2026-10-10T08:00:00.000Z' : null, order: 0 });
const goal = (extra = {}) => ({ id: 'g', title: 'Trip', status: 'active', progressMode: 'milestones', progressType: 'percentage', currentValue: 40, targetValue: 100, unit: '', milestones: [milestone('a', true), milestone('b', true), milestone('c', false), milestone('d', false), milestone('e', false)], taskIds: [], projectLinks: [], habitLinks: [], createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', ...extra });

test('Core: progress is the share of completed milestones, and the goal is complete when all are done', () => {
  assert.deepEqual(Core.computeGoalProgress(goal()), { current: 2, target: 5, percent: 40 });
  assert.deepEqual(Core.computeGoalProgress(goal({ milestones: [] })), { current: 0, target: 0, percent: 0 });
  assert.equal(Core.getGoalHealth(goal({ currentValue: 100 })), 'on-track', 'the stored currentValue does not drive it');
  assert.equal(Core.getGoalHealth(goal({ milestones: [milestone('a', true)] })), 'complete');
  assert.equal(Core.getGoalHealth(goal({ milestones: [] })), 'on-track');
});

test('data: loading keeps the mode, backups accept it and still refuse unknown values, templates carry it', () => {
  const state = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [goal()], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  assert.equal(state.goals[0].progressMode, 'milestones');
  assert.match(app, /progressMode: \['manual', 'linkedTasks', 'linkedHabits', 'milestones'\]\.includes\(goal\.progressMode\) \? goal\.progressMode : 'manual',/);
  assert.doesNotThrow(() => Backup.validateDomain(state, [], []));
  assert.throws(() => Backup.validateDomain({ ...state, goals: [goal({ progressMode: 'stars' })] }, [], []), /progressMode/);
  assert.match(read('js/backup.js'), /enumField\(data,'progressMode',\['manual','linkedTasks','linkedHabits','milestones'\]\)/, 'goal templates too');
  assert.match(read('js/templates-ui.js'), /\['milestones', tr\('Milestones'\)\]/);
});

function goalsModule() {
  let adapter;
  runInNewContextWithI18n(goalsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run(), CSS: { escape: String } });
  return adapter;
}

test('UI: the goal window says "2 od 5 etapa", explains the source and offers no manual update', () => {
  const module = goalsModule();
  const item = goal({ targetDate: null });
  const ctx = {
    state: { goals: [item], areas: [], tasks: [], projects: [], habits: [], habitMetrics: {} }, Core, esc: value => String(value ?? ''),
    modalFrame: content => content, getGoal: id => (id === 'g' ? item : null), modalState: { type: 'goal-details', goalId: 'g' },
    formatDate: value => value, todayDueLabel: value => value,
  };
  const html = module.renderRoute({ type: 'modal', modalType: 'goal-details' }, ctx);
  assert.match(html, /<strong>40%<\/strong><span>2 of 5 milestones<\/span>/);
  assert.match(html, /<p class="sheet-note">Progress is counted from completed milestones\.<\/p>/);
  assert.doesNotMatch(html, /goal-details-progress" data-goal-id/, 'no "Ažuriraj napredak"');
  assert.match(goalsUi, /if \(goal\.progressMode === 'milestones'\) return tr\('Milestones'\);/, 'the source row');
  assert.ok(sr.includes('"{current} of {target} milestones": { one: "{current} od {target} etape", few: "{current} od {target} etape", other: "{current} od {target} etapa" }'));
  assert.ok(sr.includes('"Progress is counted from completed milestones.": "Napredak se računa iz završenih etapa."'));
});

test('UI: the new goal window and the source sheet offer "Etape"; choosing it opens the milestones', () => {
  assert.match(goalsUi, /const PROGRESS_MODES = \['manual', 'linkedTasks', 'linkedHabits', 'milestones'\];/);
  assert.match(goalsUi, /draftSegment\('goal-draft-mode', tr\('Progress'\), \[\['manual', tr\('Manual'\)\], \['linkedTasks', tr\('Tasks'\)\], \['linkedHabits', tr\('Habits'\)\], \['milestones', tr\('Milestones'\)\]\], mode\)/);
  assert.match(goalsUi, /else if \(action === 'goal-draft-mode'\) \{ d\.progressMode = PROGRESS_MODES\.includes\(el\.dataset\.value\) \? el\.dataset\.value : 'manual'; if \(d\.progressMode === 'milestones'\) d\.moreOpen = true; \}/);
  assert.match(goalsUi, /\[\['manual',msg\('Manual'\)\],\['linkedTasks',msg\('Linked tasks'\)\],\['linkedHabits',msg\('Linked habits'\)\],\['milestones',msg\('Milestones'\)\]\]/);
});

test('UI: completing the last milestone asks whether the goal is reached', () => {
  const toggle = goalsUi.slice(goalsUi.indexOf('  function toggleMilestone('));
  assert.match(toggle, /const before = ctx\.captureGoalProgress\?\.\(\);/);
  assert.match(toggle, /ctx\.evaluateGoalProgressChanges\?\.\(before\);/);
});

test('R38 shipped as 2.0.0-alpha.64 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 64);
});
