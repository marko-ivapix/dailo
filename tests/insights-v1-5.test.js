const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const Core = require('../js/core.js');

function fixture() {
  const adapters = {};
  const window = { TodoDomainModules: { register: adapter => { adapters[adapter.name] = adapter; } } };
  for (const name of ['goals', 'habits']) runInNewContextWithI18n(fs.readFileSync(require.resolve(`../js/${name}-ui.js`), 'utf8'), { window, requestAnimationFrame: fn => fn() });
  const goal = { id: 'g', title: 'Read', status: 'active', progressMode: 'manual', progressType: 'numeric', currentValue: 2.5, targetValue: 10, unit: 'books', targetDate: '2026-09-20', milestones: [], habitLinks: [], taskIds: [], projectLinks: [], reminders: {} };
  const habit = { id: 'h', name: 'Read daily', status: 'active', trackingType: 'numeric', targetValue: 4, startDate: '2026-09-14', frequencyType: 'daily', quickValues: [], minimumTarget: 2, idealTarget: 4, graceDays: 1 };
  const state = { goals: [goal], habits: [habit], tasks: [], projects: [], areas: [], ui: {}, settings: {}, habitLogCache: {}, habitMetrics: {} };
  const inputs = {};
  let persisted;
  const ctx = { Core: { ...Core, dateOnly: date => date ? Core.dateOnly(date) : '2026-09-17' }, state,
    esc: value => String(value ?? '').replace(/</g, '&lt;'), getGoal: () => goal, getHabit: () => habit, getArea: () => null,
    pageHeader: () => '', goalProgressLabel: () => '2.5 / 10 books', goalStatusLabel: goal => goal.status, relativeDateLabel: value => value,
    habitMetrics: habit => Core.deriveHabitMetrics(habit, state.habitLogCache[habit.id] || [], '2026-09-17'),
    $: selector => inputs[selector], render() {}, restoreGoalFocus() {}, nowIso: () => '2026-09-17T12:00:00Z',
    saveState: () => { persisted = JSON.parse(JSON.stringify(state)); }, captureGoalProgress: () => ({}), evaluateGoalProgressChanges() {}, putGoalHistory() {}, maybePromptGoalReached() {} };
  const event = { target: { closest: () => ({ dataset: { goalId: 'g', habitId: 'h' } }) } };
  return { adapters, ctx, goal, habit, state, inputs, event, persisted: () => persisted };
}

test('Goal detail derives health and task contributions from the same deduplicated task set', () => {
  const f = fixture();
  f.goal.progressMode = 'linkedTasks'; f.goal.taskIds = ['done'];
  f.goal.projectLinks = [{ projectId: 'p', contributionMode: 'allTasks' }];
  f.state.projects = [{ id: 'p', name: 'Reading' }];
  f.state.tasks = [{ id: 'done', title: 'Read chapter', projectId: 'p', isCompleted: true }, { id: 'open', title: 'Read more', projectId: 'p' }];
  const html = f.adapters.goals.renderRoute({ type: 'goal', id: 'g' }, f.ctx);
  assert.match(html, /data-goal-health="at-risk"/);
  assert.match(html, /1 of 2 tasks completed/);
  f.state.tasks[1].isCompleted = true;
  assert.match(f.adapters.goals.renderRoute({ type: 'goal', id: 'g' }, f.ctx), /data-goal-health="complete"/);
  assert.equal(f.goal.status, 'active');
});

test('Goal numeric edits persist fractional current, target and unit without lifecycle changes', () => {
  const f = fixture();
  for (const [field, value] of [['targetValue', '12.5'], ['unit', 'chapters']]) {
    f.ctx.goalPropertyEditor = { goal: f.goal, field, value };
    f.adapters.goals.handleAction('save-goal-property', f.event, f.ctx);
  }
  f.inputs['#goal-current-value'] = { value: '3.5' };
  f.adapters.goals.handleAction('save-goal-progress', f.event, f.ctx);
  assert.equal(f.persisted().goals[0].currentValue, 3.5);
  assert.equal(f.persisted().goals[0].targetValue, 12.5);
  assert.equal(f.persisted().goals[0].unit, 'chapters');
  assert.equal(f.goal.status, 'active');
});

// Redesign R8c (S13): the habit page with its inline editors and rolling week/month cards became the details window.
// Minimum, ideal and grace days are now set in its sheets with the same validation, and "Uvid" keeps the target status
// and the recovery line.
const appSource = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
function detailsFixture() {
  const f = fixture();
  const calls = [];
  const draftCtx = { Core: f.ctx.Core };
  vm.createContext(withI18n(draftCtx));
  const start = appSource.indexOf('  function habitDraft(');
  vm.runInContext(appSource.slice(start, appSource.indexOf('\n  }\n', start) + 4), draftCtx);
  f.state.settings = { weekStartsOn: 'monday' };
  Object.assign(f.ctx, {
    modalState: { type: 'habit-details', habitId: 'h', month: '2026-09', draft: null },
    habitDraft: habit => draftCtx.habitDraft(habit), formatDate: value => value, modalFrame: content => content,
    openPopover: (anchor, html) => calls.push(html), refreshSheet: html => calls.push(html), closePopover() {}, renderModal() {},
    refreshHabitMetrics: () => Promise.resolve(), syncHabitGoalLinks() {}, uid: kind => `${kind}-1`,
  });
  const act = (action, dataset = {}) => f.adapters.habits.handleAction(action, { target: { closest: () => ({ dataset }) } }, f.ctx);
  return { ...f, calls, act, lastSheet: () => calls.at(-1) };
}
const setTargets = (f, minimum, ideal) => { f.act('habit-draft-targets'); Object.assign(f.inputs, { '#habit-minimum': { value: minimum }, '#habit-ideal': { value: ideal } }); f.act('habit-targets-apply'); };

test('Habit minimum, ideal and grace sheets save numbers and reject inverted or invalid targets', () => {
  const f = detailsFixture();
  setTargets(f, '3', '6');
  assert.equal(f.persisted().habits[0].minimumTarget, 3);
  assert.equal(f.persisted().habits[0].idealTarget, 6);
  f.act('habit-details-grace');
  f.inputs['#habit-grace'] = { value: '2' };
  f.act('habit-grace-apply');
  assert.equal(f.persisted().habits[0].graceDays, 2);
  for (const [minimum, ideal] of [['7', '2'], ['Infinity', '']]) {
    setTargets(f, minimum, ideal);
    assert.match(f.lastSheet(), /<p class="validation" role="alert">/, `${minimum} / ${ideal}`);
  }
  assert.equal(f.habit.minimumTarget, 3, 'a rejected sheet saves nothing');
  f.act('habit-details-grace');
  f.inputs['#habit-grace'] = { value: '-1' };
  f.act('habit-grace-apply');
  assert.match(f.lastSheet(), /Enter zero or more whole days\./);
  assert.equal(f.habit.graceDays, 2);
});

test('Numeric Habit sheets keep fractional targets while count-based Habits reject them', () => {
  const f = detailsFixture();
  setTargets(f, '0.5', '1');
  assert.equal(f.habit.minimumTarget, 0.5, 'fractional input updates the numeric Habit');
  assert.equal(f.persisted().habits[0].minimumTarget, 0.5);
  assert.equal(f.persisted().habits[0].idealTarget, 1);
  f.act('habit-draft-targets');
  assert.match(f.lastSheet(), /id="habit-minimum"[^>]*step="any"/);
  for (const mode of [{ trackingType: 'checkbox', frequencyType: 'daily' }, { trackingType: 'numeric', frequencyType: 'timesPerWeek', timesPerWeek: 2 }]) {
    Object.assign(f.habit, mode, { minimumTarget: 1, idealTarget: 2 });
    setTargets(f, '1.5', '');
    assert.match(f.lastSheet(), /Enter a whole number above zero, or leave blank\./);
    assert.equal(f.habit.minimumTarget, 1);
  }
});

test('Habit insight shows the target status, recovery and grace', () => {
  const f = detailsFixture();
  f.state.habitLogCache.h = [
    { habitId: 'h', date: '2026-09-14', value: 4, status: 'done' },
    { habitId: 'h', date: '2026-09-15', value: 4, status: 'done' },
    { habitId: 'h', date: '2026-09-16', value: 0, status: 'missed' },
    { habitId: 'h', date: '2026-09-17', value: 2, status: 'done' },
    { habitId: 'h', date: '2026-09-18', value: 100, status: 'done' }
  ];
  const html = f.adapters.habits.renderRoute({ type: 'modal', modalType: 'habit-details' }, f.ctx);
  assert.match(html, /data-habit-target-status="minimum"/);
  assert.match(html, /Recovered after 1 missed day/);
  assert.match(html, /Within your 1-day grace allowance/);
  assert.match(html, /data-action="habit-details-grace"/);
  assert.equal(f.habit.status, 'active');
});

test('Habit weekly insight treats the week as one period and does not call unrequired days missed', () => {
  const f = detailsFixture();
  Object.assign(f.habit, { frequencyType: 'timesPerWeek', timesPerWeek: 2, minimumTarget: 2, idealTarget: 3, startDate: '2026-09-07' });
  f.state.habitLogCache.h = ['2026-09-08', '2026-09-11', '2026-09-14', '2026-09-17'].map(date => ({ habitId: 'h', date, status: 'done', value: 4 }));
  const html = f.adapters.habits.renderRoute({ type: 'modal', modalType: 'habit-details' }, f.ctx);
  assert.match(html, /data-habit-target-status="minimum"/);
  assert.match(html, /No recent missed period to recover from/);
});

test('Goal habit contributions cap each link and escape names', () => {
  const f = fixture();
  Object.assign(f.goal, { progressMode: 'linkedHabits', habitLinks: [{ habitId: 'h', metric: 'totalCheckins', target: 2 }] });
  f.habit.name = '<img src=x>';
  f.state.habitMetrics.h = { totalCheckins: 4 };
  const html = f.adapters.goals.renderRoute({ type: 'goal', id: 'g' }, f.ctx);
  assert.match(html, /data-goal-health="complete"/);
  assert.match(html, /4 \/ 2 Check-ins · 100%/);
  assert.doesNotMatch(html, /<img src=x>/);
});
