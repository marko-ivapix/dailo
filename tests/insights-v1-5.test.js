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

test('Habit minimum, ideal and grace controls save numbers and reject inverted or invalid targets', () => {
  const f = fixture();
  for (const [field, value] of [['minimumTarget', '3'], ['idealTarget', '6'], ['graceDays', '2']]) {
    f.ctx.habitPropertyEditor = { habit: f.habit, field, value };
    f.adapters.habits.handleAction('save-habit-property', f.event, f.ctx);
  }
  assert.equal(f.persisted().habits[0].minimumTarget, 3);
  assert.equal(f.persisted().habits[0].idealTarget, 6);
  assert.equal(f.persisted().habits[0].graceDays, 2);
  for (const [field, value] of [['minimumTarget', '7'], ['idealTarget', '2'], ['graceDays', '-1'], ['minimumTarget', 'Infinity']]) {
    f.ctx.habitPropertyEditor = { habit: f.habit, field, value };
    f.adapters.habits.handleAction('save-habit-property', f.event, f.ctx);
    assert.ok(f.ctx.habitPropertyEditor.error);
  }
});

test('Numeric Habit controls persist fractional targets while count-based Habits reject them', () => {
  const f = fixture();
  for (const [field, value] of [['minimumTarget', '0.5'], ['idealTarget', '1']]) {
    f.ctx.habitPropertyEditor = { habit: f.habit, field, value };
    f.adapters.habits.handleAction('save-habit-property', f.event, f.ctx);
  }
  assert.equal(f.habit.minimumTarget, 0.5, 'fractional input updates the numeric Habit');
  assert.equal(f.persisted().habits[0].minimumTarget, 0.5);
  assert.equal(f.persisted().habits[0].idealTarget, 1);
  f.ctx.habitPropertyEditor = { habit: f.habit, field: 'minimumTarget', value: '0.5' };
  assert.match(f.adapters.habits.renderRoute({ type: 'habit', id: 'h' }, f.ctx), /id="habit-detail-minimumTarget"[^>]*step="any"/);
  for (const mode of [{ trackingType: 'checkbox', frequencyType: 'daily' }, { trackingType: 'numeric', frequencyType: 'timesPerWeek', timesPerWeek: 2 }]) {
    Object.assign(f.habit, mode, { minimumTarget: 1, idealTarget: 2 });
    for (const field of ['minimumTarget', 'idealTarget']) {
      f.ctx.habitPropertyEditor = { habit: f.habit, field, value: '1.5' };
      f.adapters.habits.handleAction('save-habit-property', f.event, f.ctx);
      assert.ok(f.ctx.habitPropertyEditor.error);
    }
  }
});

test('Habit insights distinguish minimum recovery, grace and rolling week/month totals', () => {
  const f = fixture();
  f.state.habitLogCache.h = [
    { habitId: 'h', date: '2026-09-14', value: 4, status: 'done' },
    { habitId: 'h', date: '2026-09-15', value: 4, status: 'done' },
    { habitId: 'h', date: '2026-09-16', value: 0, status: 'missed' },
    { habitId: 'h', date: '2026-09-17', value: 2, status: 'done' },
    { habitId: 'h', date: '2026-09-18', value: 100, status: 'done' }
  ];
  const html = f.adapters.habits.renderRoute({ type: 'habit', id: 'h' }, f.ctx);
  assert.match(html, /data-habit-target-status="minimum"/);
  assert.match(html, /Recovered after 1 missed day/);
  assert.match(html, /Within your 1-day grace allowance/);
  assert.match(html, /data-habit-insight="week"[^]*?3 minimum[^]*?2 ideal/);
  assert.match(html, /data-habit-insight="month"[^]*?3 minimum[^]*?2 ideal/);
  assert.match(html, /data-habit-property="graceDays"/);
  assert.equal(f.habit.status, 'active');
});

test('Habit weekly insights treat the week as one period and do not call unrequired days missed', () => {
  const f = fixture();
  Object.assign(f.habit, { frequencyType: 'timesPerWeek', timesPerWeek: 2, minimumTarget: 2, idealTarget: 3, startDate: '2026-09-07' });
  f.state.habitLogCache.h = ['2026-09-08', '2026-09-11', '2026-09-14', '2026-09-17'].map(date => ({ habitId: 'h', date, status: 'done', value: 4 }));
  const html = f.adapters.habits.renderRoute({ type: 'habit', id: 'h' }, f.ctx);
  assert.match(html, /data-habit-target-status="minimum"/);
  assert.match(html, /No recent missed period to recover from/);
  assert.match(html, /data-habit-insight="week"[^]*?2 minimum[^]*?0 ideal/);
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
