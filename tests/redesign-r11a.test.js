// Redesign R11a: the extended repeat rule (data model, no UI).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r11a-recurrence-rule.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const next = (date, rule) => Core.nextRecurrenceDate(date, rule);
const series = (date, rule, count) => { const out = []; let current = date; for (let i = 0; i < count; i += 1) { current = next(current, rule); out.push(current); } return out; };

test('normalization keeps the valid new fields and drops what does not fit', () => {
  const rule = value => plain(Core.normalizeRecurrenceV3(value));
  assert.deepEqual(rule({ frequency: 'yearly', interval: 2 }).frequency, 'yearly');
  assert.deepEqual(rule({ frequency: 'weekly', interval: 1, weekdays: [6, 3, 3] }).weekdays, [3, 6], 'distinct and sorted');
  assert.equal('weekdays' in rule({ frequency: 'weekly', interval: 1, weekdays: [] }), false, 'at least one day');
  assert.equal('weekdays' in rule({ frequency: 'weekly', interval: 1, weekdays: [7] }), false);
  assert.equal('weekdays' in rule({ frequency: 'daily', interval: 1, weekdays: [1] }), false, 'weekly only');
  assert.deepEqual(['monthMode', 'monthDay'].map(key => rule({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 10 })[key]), ['day', 10]);
  assert.equal(rule({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 'last' }).monthDay, 'last');
  assert.equal('monthMode' in rule({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 32 }), false);
  assert.deepEqual(['monthMode', 'weekOfMonth', 'weekday'].map(key => rule({ frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 'last', weekday: 5 })[key]), ['weekday', 'last', 5]);
  assert.equal('monthMode' in rule({ frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 5, weekday: 1 }), false);
  assert.equal('monthMode' in rule({ frequency: 'weekly', interval: 1, monthMode: 'day', monthDay: 3 }), false, 'monthly only');
  const legacy = rule({ frequency: 'monthly', interval: 3 });
  assert.deepEqual(Object.keys(legacy).filter(key => ['weekdays', 'monthMode', 'monthDay', 'weekOfMonth', 'weekday'].includes(key)), [], 'a legacy rule gains nothing');
  assert.equal(Core.normalizeRecurrenceV3({ frequency: 'hourly', interval: 1 }), null);
});

test('the next occurrence for each mode', () => {
  // Weekly on Wednesday and Saturday (2026-10-14 is a Wednesday)
  assert.deepEqual(series('2026-10-14', { frequency: 'weekly', interval: 1, weekdays: [3, 6] }, 4), ['2026-10-17', '2026-10-21', '2026-10-24', '2026-10-28']);
  // Every second week on Monday and Friday; weeks start on Monday
  assert.deepEqual(series('2026-10-12', { frequency: 'weekly', interval: 2, weekdays: [1, 5] }, 3), ['2026-10-16', '2026-10-26', '2026-10-30']);
  // Sunday ends the Monday-based week: from Saturday the next Sunday is the same week
  assert.deepEqual(series('2026-10-10', { frequency: 'weekly', interval: 2, weekdays: [0, 6] }, 3), ['2026-10-11', '2026-10-24', '2026-10-25']);
  // Monthly on the 10th, every 3 months
  assert.deepEqual(series('2026-10-10', { frequency: 'monthly', interval: 3, monthMode: 'day', monthDay: 10 }, 2), ['2027-01-10', '2027-04-10']);
  // The 31st falls on the last day of shorter months and comes back
  assert.deepEqual(series('2026-01-31', { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 31 }, 3), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(series('2026-01-31', { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 'last' }, 2), ['2026-02-28', '2026-03-31']);
  // The first Monday and the last Friday
  assert.deepEqual(series('2026-10-05', { frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 1, weekday: 1 }, 3), ['2026-11-02', '2026-12-07', '2027-01-04']);
  assert.deepEqual(series('2026-10-30', { frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 'last', weekday: 5 }, 2), ['2026-11-27', '2026-12-25']);
  // Yearly, with 29 February
  assert.deepEqual(series('2026-03-15', { frequency: 'yearly', interval: 1 }, 2), ['2027-03-15', '2028-03-15']);
  assert.equal(next('2028-02-29', { frequency: 'yearly', interval: 1 }), '2029-02-28');
  assert.equal(next('2026-10-10', { frequency: 'yearly', interval: 3 }), '2029-10-10');
  // Legacy rules are unchanged
  assert.equal(next('2026-10-14', { frequency: 'weekly', interval: 2 }), '2026-10-28');
  assert.equal(next('2026-01-31', { frequency: 'monthly', interval: 1 }), '2026-02-28');
  assert.equal(next('2026-10-10', { frequency: 'daily', interval: 3 }), '2026-10-13');
});

test('the first matching day from a start and the next dates, honoring the end', () => {
  assert.equal(Core.firstRecurrenceDate('2026-10-10', { frequency: 'weekly', interval: 1, weekdays: [1] }), '2026-10-12', 'the first Monday from a Saturday');
  assert.equal(Core.firstRecurrenceDate('2026-10-12', { frequency: 'weekly', interval: 1, weekdays: [1] }), '2026-10-12', 'the start itself when it matches');
  assert.equal(Core.firstRecurrenceDate('2026-10-11', { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 10 }), '2026-11-10');
  assert.equal(Core.firstRecurrenceDate('2026-10-03', { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 10 }), '2026-10-10');
  assert.equal(Core.firstRecurrenceDate('2026-10-10', { frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 1, weekday: 1 }), '2026-11-02');
  assert.equal(Core.firstRecurrenceDate('2026-10-10', { frequency: 'daily', interval: 2 }), '2026-10-10');
  assert.equal(Core.firstRecurrenceDate('2026-10-10', { frequency: 'yearly', interval: 1 }), '2026-10-10');
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-10', { frequency: 'weekly', interval: 1, weekdays: [3, 6] }, 3)), ['2026-10-10', '2026-10-14', '2026-10-17']);
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-10', { frequency: 'weekly', interval: 1, weekdays: [3, 6], endType: 'afterOccurrences', endAfterOccurrences: 2 }, 3)), ['2026-10-10', '2026-10-14']);
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-10', { frequency: 'daily', interval: 1, endType: 'date', endDate: '2026-10-11' }, 3)), ['2026-10-10', '2026-10-11']);
});

test('completing a task with an extended rule keeps the due day and reminder distance', () => {
  const task = { id: 't', title: 'Bins', plannedDate: '2026-10-14', dueDate: '2026-10-15', reminderAt: new Date('2026-10-14T08:30:00').toISOString(), recurrence: { frequency: 'weekly', interval: 1, weekdays: [3, 6], status: 'active', endType: 'never', occurrencesCreated: 0, seriesId: 't' }, subtasks: [] };
  const nextTask = Core.buildNextRecurringTask(task, '2026-10-14T10:00:00.000Z', 'n');
  assert.deepEqual([nextTask.plannedDate, nextTask.dueDate], ['2026-10-17', '2026-10-18']);
  assert.equal(new Date(nextTask.reminderAt).getHours(), 8);
  assert.equal(Core.localDateOf(nextTask.reminderAt), '2026-10-17');
  assert.deepEqual(plain(nextTask.recurrence.weekdays), [3, 6]);
  const skip = Core.buildNextRecurringTask({ ...task, recurrence: { ...task.recurrence, skipNext: true } }, '2026-10-14T10:00:00.000Z', 's');
  assert.deepEqual([skip.plannedDate, skip.dueDate], ['2026-10-21', '2026-10-22'], 'skipping one occurrence');
  // Legacy rules advance field by field, as before
  const legacy = Core.buildNextRecurringTask({ ...task, recurrence: { frequency: 'monthly', interval: 1, status: 'active', endType: 'never', occurrencesCreated: 0 }, plannedDate: '2026-01-31', dueDate: '2026-01-30', reminderAt: null }, '2026-01-31T10:00:00.000Z', 'l');
  assert.deepEqual([legacy.plannedDate, legacy.dueDate], ['2026-02-28', '2026-02-28']);
});

test('backups and templates accept the new fields and reject bad ones', () => {
  const state = extra => Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {}, ...extra });
  const task = recurrence => ({ id: 't', title: 'Repeat', createdAt: '2026-10-10T08:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z', plannedDate: '2026-10-14', recurrence: { status: 'active', endType: 'never', occurrencesCreated: 0, skipNext: false, seriesId: 't', ...recurrence } });
  for (const recurrence of [{ frequency: 'yearly', interval: 1 }, { frequency: 'weekly', interval: 1, weekdays: [3, 6] }, { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 'last' }, { frequency: 'monthly', interval: 2, monthMode: 'weekday', weekOfMonth: 1, weekday: 1 }]) {
    const valid = state({ tasks: [task(recurrence)] });
    assert.deepEqual(plain(valid.tasks[0].recurrence).frequency, recurrence.frequency, 'normalizeState keeps the rule');
    assert.doesNotThrow(() => Backup.validateDomain(valid, [], []), JSON.stringify(recurrence));
  }
  for (const recurrence of [{ frequency: 'weekly', interval: 1, weekdays: [8] }, { frequency: 'weekly', interval: 1, weekdays: [] }, { frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 0 }, { frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 5, weekday: 1 }, { frequency: 'monthly', interval: 1, monthMode: 'month' }]) {
    const raw = state({});
    raw.tasks = [task(recurrence)];
    assert.throws(() => Backup.validateDomain(raw, [], []), /recurrence/, JSON.stringify(recurrence));
  }
  // A task template carries the rule and instantiating keeps it
  const source = { title: 'Bins', plannedDate: '2026-10-14', recurrence: { frequency: 'weekly', interval: 1, weekdays: [3, 6], status: 'active', endType: 'never' } };
  const template = Core.templateFromEntity('task', source, {}, '2026-10-10');
  assert.deepEqual(plain(template.data.recurrence).weekdays, [3, 6]);
  const withTemplate = state({ templates: [{ id: 'tp', name: 'Bins', type: 'task', data: template.data, createdAt: '2026-10-10T08:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z' }] });
  assert.doesNotThrow(() => Backup.validateDomain(withTemplate, [], []));
  const made = Core.instantiateTemplate({ type: 'task', data: template.data }, '2026-10-10', { state: withTemplate, makeId: kind => `${kind}-1`, nowIso: '2026-10-10T08:00:00.000Z' });
  assert.deepEqual(plain(made.task.recurrence).weekdays, [3, 6]);
  const yearly = Core.templateFromEntity('task', { title: 'Taxes', recurrence: { frequency: 'yearly', interval: 1 } }, {}, '2026-10-10');
  assert.doesNotThrow(() => Backup.validateDomain(state({ templates: [{ id: 'ty', name: 'Taxes', type: 'task', data: yearly.data, createdAt: '2026-10-10T08:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z' }] }), [], []));
});

test('a yearly rule has its own label and template choice', () => {
  const { withI18n } = require('./support/i18n.js');
  const vm = require('node:vm');
  const app = read('js/app.js');
  const start = app.indexOf('\n  function recurrenceLabel(') + 1;
  const ctx = vm.createContext(withI18n({}));
  vm.runInContext(app.slice(start, app.indexOf('\n  }\n', start) + 4), ctx);
  assert.equal(ctx.recurrenceLabel({ frequency: 'yearly', interval: 1 }), 'Every year');
  assert.equal(ctx.recurrenceLabel({ frequency: 'yearly', interval: 2 }), 'Every 2 years');
  assert.equal(ctx.recurrenceLabel({ frequency: 'monthly', interval: 1 }), 'Every month');
  assert.match(read('js/templates-ui.js'), /\['monthly', tr\('Monthly'\)\], \['yearly', tr\('Yearly'\)\]\]/);
  const sr = read('js/i18n-sr.js');
  for (const line of ['"Every year": "Svake godine"', '"Every {count} years": { one: "Svakih {count} godinu", few: "Svake {count} godine", other: "Svakih {count} godina" }', '"Yearly": "Godišnje"']) assert.ok(sr.includes(line), line);
});

test('R11a shipped as 2.0.0-alpha.26 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 26);
});
