// M11: the user's answers to the audit's open questions (2026-10-09) — habit history only from a change on,
// no habit reminder after the day's check-in, and a Search debounce and result cap.
// Spec: docs/superpowers/specs/2026-10-09-habit-history-reminders-search.md
process.env.TZ = 'Europe/Belgrade';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = (source, name) => { const start = source.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
const NOW = '2026-10-09T08:00:00.000Z';
const weekly = (extra = {}) => ({ id: 'w', name: 'Gym', status: 'active', frequencyType: 'timesPerWeek', timesPerWeek: 2, startDate: '2026-09-21', reminders: [], ...extra });
const done = (habitId, ...dates) => dates.map(date => ({ id: `${habitId}-${date}`, habitId, date, status: 'done' }));

// --- D1: weekly target -----------------------------------------------------------------------------

test('a weekly target applies to the weeks from its change on', () => {
  const habit = weekly({ timesPerWeek: 4, targetHistory: [{ before: '2026-10-05', timesPerWeek: 2 }] });
  assert.equal(Core.habitTargetFor(habit, '2026-09-28'), 2, 'the week before the change keeps its target');
  assert.equal(Core.habitTargetFor(habit, '2026-10-05'), 4);
  assert.equal(Core.habitTargetFor(weekly({ timesPerWeek: 3 }), '2026-09-28'), 3, 'no history: the current target, as before');
  assert.equal(Core.habitTargetFor({ frequencyType: 'daily' }, '2026-09-28'), 1);
});

test('the target change is recorded once per week and only between weekly targets', () => {
  const habit = weekly();
  const history = Core.recordHabitTargetChange(habit, { frequencyType: 'timesPerWeek', timesPerWeek: 4 }, '2026-10-05');
  assert.deepEqual(history, [{ before: '2026-10-05', timesPerWeek: 2 }]);
  assert.equal(habit.targetHistory, undefined, 'pure');
  const again = Core.recordHabitTargetChange({ ...habit, timesPerWeek: 4, targetHistory: history }, { frequencyType: 'timesPerWeek', timesPerWeek: 5 }, '2026-10-05');
  assert.deepEqual(again, history, 'a second change in the same week keeps the original target of the week before');
  assert.deepEqual(Core.recordHabitTargetChange(habit, { frequencyType: 'timesPerWeek', timesPerWeek: 2 }, '2026-10-05'), [], 'unchanged');
  assert.deepEqual(Core.recordHabitTargetChange({ ...habit, frequencyType: 'daily' }, { frequencyType: 'timesPerWeek', timesPerWeek: 3 }, '2026-10-05'), []);
  assert.deepEqual(Core.recordHabitTargetChange(habit, { frequencyType: 'daily', timesPerWeek: null }, '2026-10-05'), []);
});

test('metrics, completion and the weekly chart score each week with its own target', () => {
  const logs = done('w', '2026-09-29', '2026-10-01', '2026-10-06');
  const changed = weekly({ timesPerWeek: 4, targetHistory: [{ before: '2026-10-05', timesPerWeek: 2 }] });
  const metrics = Core.deriveHabitMetrics(changed, logs, '2026-10-09', 'monday');
  const byKey = Object.fromEntries(metrics.periods.map(period => [period.key, period.successful]));
  assert.equal(byKey['2026-09-28'], true, 'two of two in the week before the change');
  assert.equal(metrics.currentPeriodTarget, 4);
  const rewritten = Core.deriveHabitMetrics(weekly({ timesPerWeek: 4 }), logs, '2026-10-09', 'monday');
  assert.equal(rewritten.periods.find(period => period.key === '2026-09-28').successful, false, 'without history the old week is re-scored (old behavior)');
  const analytics = Core.habitAnalytics(changed, logs, { today: '2026-10-09', weekStartsOn: 'monday' });
  assert.deepEqual(analytics.weeklySeries.filter(item => item.key === '2026-09-28').map(item => [item.target, item.percent]), [[2, 100]]);
  assert.equal(Core.habitCompletionForDates(changed, logs, ['2026-09-29', '2026-10-01'], '2026-10-09', 'monday'), 100);
});

// Redesign R8c: the settings panels gave way to the details window, which saves through commitHabitDetails.
test('both habit save paths record a weekly target change for the current week', () => {
  const habitsUi = read('js/habits-ui.js');
  for (const name of ['saveHabitModal', 'commitHabitDetails']) {
    assert.match(fn(habitsUi, name), /Core\.recordHabitTargetChange\(habit, [^;]+Core\.habitPeriodKey\(\{ frequencyType: 'timesPerWeek' \}, Core\.dateOnly\(\), Core\.habitWeekRule\((ctx\.)?state\.settings\)\)\)/, name);
  }
});

// --- D1: week start ----------------------------------------------------------------------------------

test('a week-start change is recorded at the start of its week and undone by a change back within seven days', () => {
  const toSunday = Core.recordWeekStartChange({ weekStartsOn: 'monday' }, 'sunday', '2026-10-07');
  assert.deepEqual(toSunday, [{ before: '2026-10-05', weekStartsOn: 'monday', changedOn: '2026-10-07' }]);
  assert.deepEqual(Core.recordWeekStartChange({ weekStartsOn: 'sunday', weekStartHistory: toSunday }, 'monday', '2026-10-11'), [], 'changed back: nothing to remember');
  assert.equal(Core.recordWeekStartChange({ weekStartsOn: 'sunday', weekStartHistory: toSunday }, 'monday', '2026-10-20').length, 2, 'a later change is a new entry');
  assert.deepEqual(Core.recordWeekStartChange({ weekStartsOn: 1 }, 'monday', '2026-10-07'), [], 'unchanged (1 means Monday)');
  assert.deepEqual(Core.habitWeekRule({ weekStartsOn: 'sunday', weekStartHistory: toSunday }), { weekStartsOn: 'sunday', history: toSunday });
});

test('habit weeks keep their old boundaries before the change; the cut week is kept or joined', () => {
  const key = (date, rule) => Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, date, rule);
  const mondayToSunday = { weekStartsOn: 'sunday', history: [{ before: '2026-10-05', weekStartsOn: 'monday', changedOn: '2026-10-07' }] };
  assert.equal(key('2026-10-04', mondayToSunday), '2026-09-28', 'the completed Monday week is unchanged');
  assert.equal(key('2026-10-05', mondayToSunday), '2026-10-04', 'Mon–Sat after the cut: a six-day week');
  assert.equal(key('2026-10-10', mondayToSunday), '2026-10-04');
  assert.equal(key('2026-10-11', mondayToSunday), '2026-10-11', 'Sunday weeks from then on');
  const sundayToMonday = { weekStartsOn: 'monday', history: [{ before: '2026-10-04', weekStartsOn: 'sunday', changedOn: '2026-10-07' }] };
  assert.equal(key('2026-10-03', sundayToMonday), '2026-09-27', 'the completed Sunday week is unchanged');
  assert.equal(key('2026-10-04', sundayToMonday), '2026-10-05', 'a one-day piece joins the next week (eight days)');
  assert.equal(key('2026-10-11', sundayToMonday), '2026-10-05');
  assert.equal(key('2026-10-12', sundayToMonday), '2026-10-12');
  assert.equal(key('2026-10-04', 'sunday'), '2026-10-04', 'a plain string still works');
  assert.equal(Core.habitPeriodKey({ frequencyType: 'daily' }, '2026-10-04', mondayToSunday), '2026-10-04');
});

test('a completed week keeps its result after the week start changes', () => {
  const logs = done('w', '2026-09-28', '2026-10-04');
  const rule = { weekStartsOn: 'sunday', history: [{ before: '2026-10-05', weekStartsOn: 'monday', changedOn: '2026-10-07' }] };
  const kept = Core.deriveHabitMetrics(weekly(), logs, '2026-10-09', rule);
  assert.equal(kept.periods.find(period => period.key === '2026-09-28').successful, true);
  const regrouped = Core.deriveHabitMetrics(weekly(), logs, '2026-10-09', 'sunday');
  assert.ok(!regrouped.periods.some(period => period.successful), 'without history both check-ins land in different weeks (old behavior)');
});

test('the app records week-start changes and passes the history to every habit calculation', () => {
  assert.match(fn(app, 'savePersonalization'), /weekStartHistory: Core\.recordWeekStartChange\(state\.settings, \$\('#preference-week-start'\)\?\.value, Core\.dateOnly\(\)\)/);
  // Redesign R10g (M5): the "reset personalization" button left Settings; the week start applies on change through
  // savePersonalization, which records the history (above).
  assert.doesNotMatch(app, /function resetPersonalization\(/);
  for (const file of ['js/app.js', 'js/habits-ui.js', 'js/calendar-ui.js']) {
    const source = read(file);
    for (const call of ['deriveHabitMetrics', 'habitReminderActive', 'habitCompletionForDates', 'habitAnalytics', 'habitPeriodKey']) {
      for (const match of source.matchAll(new RegExp(`Core\\.${call}\\([^\\n]*`, 'g'))) {
        assert.doesNotMatch(match[0], /weekStartKey\(/, `${file}: ${call} gets the habit week rule`);
      }
    }
  }
});

test('backups accept valid histories and reject malformed ones', () => {
  const state = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [weekly({ createdAt: NOW, updatedAt: NOW, targetHistory: [{ before: '2026-10-05', timesPerWeek: 2 }] })], notes: [], resources: [], templates: [], savedViews: [], settings: { weekStartsOn: 'sunday', weekStartHistory: [{ before: '2026-10-05', weekStartsOn: 'monday', changedOn: '2026-10-07' }] }, ui: {} });
  assert.doesNotThrow(() => Backup.validateDomain(state, [], []));
  const bad = (mutate, label) => { const copy = JSON.parse(JSON.stringify(state)); mutate(copy); assert.throws(() => Backup.validateDomain(copy, [], []), new RegExp(label)); };
  bad(copy => { copy.habits[0].targetHistory = [{ before: 'soon', timesPerWeek: 2 }]; }, 'targetHistory');
  bad(copy => { copy.habits[0].targetHistory = [{ before: '2026-10-05', timesPerWeek: 9 }]; }, 'targetHistory');
  bad(copy => { copy.habits[0].targetHistory = 'x'; }, 'targetHistory');
  bad(copy => { copy.settings.weekStartHistory = [{ before: '2026-10-05', weekStartsOn: 'friday' }]; }, 'weekStartHistory');
  bad(copy => { copy.settings.weekStartHistory = Array.from({ length: 53 }, () => ({ before: '2026-10-05', weekStartsOn: 'monday' })); }, 'weekStartHistory');
});

// --- D2: reminders after the day's check-in -------------------------------------------------------------

const daily = (extra = {}) => ({ id: 'd', name: 'Read', status: 'active', frequencyType: 'daily', startDate: '2026-09-01', reminders: [{ id: 'r', time: '20:00', enabled: true }], reminderFiredMoments: [], ...extra });

test('a habit checked in or skipped today does not remind today', () => {
  const at = new Date(2026, 9, 9, 21, 0).toISOString();
  assert.equal(Core.habitReminderActive(daily(), [], at, 'monday'), true);
  assert.equal(Core.habitReminderActive(daily(), done('d', '2026-10-09'), at, 'monday'), false);
  assert.equal(Core.habitReminderActive(daily(), [{ id: 's', habitId: 'd', date: '2026-10-09', status: 'skipped' }], at, 'monday'), false);
  assert.equal(Core.habitReminderActive(daily(), done('d', '2026-10-08'), at, 'monday'), true, 'yesterday does not count');
  const numeric = daily({ trackingType: 'numeric', targetValue: 10 });
  assert.equal(Core.habitReminderActive(numeric, [{ id: 'n', habitId: 'd', date: '2026-10-09', status: 'done', value: 4 }], at, 'monday'), true, 'below the target it still reminds');
});

test('the phone plan leaves out today once the habit is checked in', () => {
  const state = { tasks: [], goals: [], habits: [daily()], settings: { weekStartsOn: 'monday' } };
  const now = new Date(2026, 9, 9, 8, 0).toISOString();
  const plan = Core.notificationPlan(state, now, { days: 2, logs: { d: done('d', '2026-10-09') } });
  assert.deepEqual(plan.map(item => item.key), ['habit:d:2026-10-10T20:00:00']);
  assert.equal(Core.notificationPlan(state, now, { days: 2 }).length, 2, 'not checked in: today and tomorrow');
});

// --- D3: Search ---------------------------------------------------------------------------------------

function searchHarness(taskCount, projectCount = 0) {
  const tasks = Array.from({ length: taskCount }, (_, index) => ({ id: `t${index}`, title: `Report ${index}`, updatedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString() }));
  const projects = Array.from({ length: projectCount }, (_, index) => ({ id: `p${index}`, name: `Report project ${String(index).padStart(2, '0')}`, color: '#000000' }));
  const ctx = { state: { tasks, projects }, Core, esc: value => String(value), getProject: () => null, relativeDateLabel: value => value };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${app.match(/  const SEARCH_[\s\S]*?\n\n/)[0]}${fn(app, 'searchResultsHtml')}${fn(app, 'searchMoreNote')}${fn(app, 'searchTaskResult')}`, ctx);
  return ctx;
}

test('Search renders at most 50 tasks and 20 projects in the unchanged order and says how many matched', () => {
  const ctx = searchHarness(120, 30);
  const html = ctx.searchResultsHtml('report');
  const taskIds = [...html.matchAll(/data-task-id="([^"]+)"/g)].map(match => match[1]);
  const expected = Core.searchItems(ctx.state.tasks, ctx.state.projects, 'report').tasks.slice(0, 50).map(({ task }) => task.id);
  assert.deepEqual(taskIds, expected, 'the first 50 in Core.searchItems order');
  assert.equal((html.match(/data-route="project\//g) || []).length, 20);
  assert.match(html, /Showing 50 of 120\. Type more to narrow the results\./);
  assert.match(html, /Showing 20 of 30\. Type more to narrow the results\./);
  assert.doesNotMatch(searchHarness(12).searchResultsHtml('report'), /Showing/, 'no note when everything fits');
});

test('typing updates the query at once and rebuilds the results after a short pause', () => {
  const timers = [];
  const results = { innerHTML: '' };
  const ctx = {
    modalState: { type: 'search', query: '' }, searchResultsHtml: query => `results:${query}`,
    $: selector => (selector === '#search-results' ? results : null),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
  };
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/  const SEARCH_[\s\S]*?\n\n/)[0]}let searchTimer = null;\n${fn(app, 'scheduleSearchResults')}`, ctx);
  ctx.modalState.query = 're'; ctx.scheduleSearchResults();
  ctx.modalState.query = 'rep'; ctx.scheduleSearchResults();
  assert.equal(results.innerHTML, '', 'nothing is rebuilt while typing');
  assert.equal(timers.at(-1).delay, 120);
  timers.at(-1).callback();
  assert.equal(results.innerHTML, 'results:rep');
  ctx.modalState = null; timers[0].callback();
  assert.equal(results.innerHTML, 'results:rep', 'a closed Search is not touched');
  assert.match(app, /modalState\.query = event\.target\.value;\n\s+scheduleSearchResults\(\);/);
});

test('M11 shipped as 2.0.0-alpha.3 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.([3-9]|\d{2,})$|^2\.\d+\.\d+/);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
