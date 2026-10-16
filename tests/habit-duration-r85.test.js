// R85: a habit can have a duration (habit.durationMinutes, 1–1440). The day's capacity in Kalendar → Raspored, and
// the week's load bars, count the habits planned for that day that are not done yet, next to the tasks' durations.
// Habits counted by the week ("X puta nedeljno") have no day of their own, so they are not counted.
// Data-model spec: docs/superpowers/specs/2026-10-15-r85-habit-duration.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const json = value => JSON.parse(JSON.stringify(value));
const DAY = '2026-10-15'; // a Thursday
const stamp = '2026-10-01T08:00:00.000Z';
const habit = (id, fields = {}) => ({ id, name: id, status: 'active', frequencyType: 'daily', trackingType: 'checkbox', startDate: '2026-10-01', goalIds: [], reminders: [], createdAt: stamp, updatedAt: stamp, ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('the day\'s load counts the habits planned that day, not done yet, with a duration', () => {
  const tasks = [{ id: 't1', plannedDate: DAY, durationMinutes: 60 }, { id: 't2', plannedDate: DAY }];
  const habits = [
    habit('walk', { durationMinutes: 30 }),
    habit('read', { durationMinutes: 20 }),
    habit('weekdays', { frequencyType: 'weekdays', weekdays: [1, 3], durationMinutes: 45 }),
    habit('weekly', { frequencyType: 'timesPerWeek', timesPerWeek: 3, durationMinutes: 40 }),
    habit('paused', { status: 'paused', durationMinutes: 15 }),
    habit('none'),
  ];
  const logs = [{ habitId: 'read', date: DAY, status: 'done' }];
  assert.deepEqual(json(Core.dayLoad(tasks, DAY, habits, logs)), { minutes: 90, withDuration: 2, withoutDuration: 1, habitMinutes: 30 });
  assert.deepEqual(json(Core.dayLoad(tasks, DAY)), { minutes: 60, withDuration: 1, withoutDuration: 1 }, 'without habits the result is as before');
  assert.deepEqual(json(Core.dayLoad([], DAY, [habit('walk', { durationMinutes: 30 })], [])), { minutes: 30, withDuration: 1, withoutDuration: 0, habitMinutes: 30 });
});

test('the field: 1–1440 whole minutes; a bad stored value is cleared, older habits stay as they are', () => {
  const state = Core.normalizeState(emptyState({ habits: [habit('a', { durationMinutes: 30 }), habit('b', { durationMinutes: 5000 }), habit('c')] }));
  assert.equal(state.habits[0].durationMinutes, 30);
  assert.equal(state.habits[1].durationMinutes, null);
  assert.equal(Object.hasOwn(state.habits[2], 'durationMinutes'), false);
  Backup.validateDomain(emptyState({ habits: [habit('a', { durationMinutes: 30 }), habit('b', { durationMinutes: null })] }), [], []);
  for (const bad of [0, 1441, 2.5, '30']) assert.throws(() => Backup.validateDomain(emptyState({ habits: [habit('a', { durationMinutes: bad })] }), [], []), /Invalid backup: durationMinutes/, String(bad));
  assert.equal(Sync.collectRecords(emptyState({ habits: [habit('a', { durationMinutes: 30 })] })).get('habits/a').data.durationMinutes, 30);
});

test('Raspored and the week bars pass the habits and their logs; the line names the habits\' part', () => {
  const calendar = read('js/calendar-ui.js');
  assert.match(functionSource('renderDayView', ['js/calendar-ui.js']).source, /const load = Core\.dayLoad\(tasks, date, state\.habits, Object\.values\(state\.habitLogCache \|\| \{\}\)\.flat\(\)\);/);
  assert.match(functionSource('dayLoadBar', ['js/calendar-ui.js']).source, /const load = ctx\.Core\.dayLoad\(ctx\.listTasks\(\), date, ctx\.state\.habits, Object\.values\(ctx\.state\.habitLogCache \|\| \{\}\)\.flat\(\)\);/);
  assert.match(calendar, /load\.habitMinutes \? tr\('Planned \{planned\} of \{capacity\}, habits \{habits\}', \{ planned: ctx\.durationLabel\(load\.minutes\), capacity: ctx\.durationLabel\(capacity\), habits: ctx\.durationLabel\(load\.habitMinutes\) \}\)/);
});

test('the habit window has the duration under "Više"; empty means no duration', () => {
  const window = functionSource('renderHabitModal', ['js/habits-ui.js']).source;
  // R105: the field steps by one minute (with step 5 from 1, 30 was not a valid value).
  assert.match(window, /<div class="habit-window-target"><label for="habit-duration">\$\{tr\('Duration'\)\}<\/label><input id="habit-duration" class="input" type="number" min="1" max="1440" step="1" inputmode="numeric" value="\$\{esc\(d\.durationMinutes \?\? ''\)\}"><span>\$\{tr\('min'\)\}<\/span><\/div>/);
  assert.match(functionSource('readHabitDraft', ['js/habits-ui.js']).source, /const duration = \$\('#habit-duration'\); if \(duration\) \{ const value = String\(duration\.value\)\.trim\(\); d\.durationMinutes = value \? Number\(value\) : null; \}/);
  const save = functionSource('saveHabitModal', ['js/habits-ui.js']).source;
  assert.match(save, /if \(d\.durationMinutes != null && !\(Number\.isInteger\(d\.durationMinutes\) && d\.durationMinutes >= 1 && d\.durationMinutes <= 1440\)\) \{ ctx\.modalState\.error = tr\('Duration must be 1 to 1440 minutes\.'\); renderModal\(\); return; \}/);
  assert.match(save, /if \(fields\.durationMinutes == null && !Object\.hasOwn\(habit, 'durationMinutes'\)\) delete fields\.durationMinutes;/);
  assert.match(read('js/habits-ui.js'), /\['habit-name', 'habit-target-value', 'habit-unit', 'habit-duration'\]\.includes\(target\.id\)/);
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Planned {planned} of {capacity}, habits {habits}', 'Planirano {planned} od {capacity}, od toga navike {habits}'], ['Duration must be 1 to 1440 minutes.', 'Trajanje mora biti od 1 do 1440 minuta.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.ok(sr.includes('"Duration": "Trajanje"') && sr.includes('"min": "min"'));
});

test('R85 shipped as 2.0.0-alpha.112 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 112) >= 112);
});
