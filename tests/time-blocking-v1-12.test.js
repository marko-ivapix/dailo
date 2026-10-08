const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');

const DAY = '2026-10-09';
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: DAY, plannedTime: null, durationMinutes: null, dueDate: null, todayOrder: null, tagIds: [], subtasks: [], ...fields });
const json = value => JSON.parse(JSON.stringify(value));

test('daySchedule lays out timed tasks, estimates missing durations and flags overlaps among open tasks', () => {
  const tasks = [
    task('a', { plannedTime: '09:30', durationMinutes: 90 }),
    task('b', { plannedTime: '10:00', durationMinutes: 30 }),
    task('c', { plannedTime: '14:00' }),
    task('d', { plannedTime: '10:15', durationMinutes: 60, isCompleted: true }),
    task('e', { plannedTime: '12:00', durationMinutes: 30, plannedDate: '2026-10-10' }),
    task('u2', { todayOrder: 2, title: 'Zeta' }),
    task('u1', { todayOrder: 1, title: 'Alfa' }),
    task('u3', { title: 'Beta' }),
    task('done', { isCompleted: true }),
  ];
  const schedule = Core.daySchedule(tasks, DAY);
  assert.deepEqual(schedule.blocks.map(block => [block.task.id, block.startMinutes, block.endMinutes, block.estimated, block.conflict]), [
    ['a', 570, 660, false, true], ['b', 600, 630, false, true], ['d', 615, 675, false, false], ['c', 840, 870, true, false],
  ]);
  assert.deepEqual(schedule.unscheduled.map(item => item.id), ['u1', 'u2', 'u3']);
  assert.deepEqual(json(schedule.range), { startHour: 6, endHour: 24 });
  assert.deepEqual(json(Core.daySchedule([task('early', { plannedTime: '05:15', durationMinutes: 30 })], DAY).range), { startHour: 5, endHour: 24 });
  assert.equal(Core.daySchedule(tasks, DAY, { defaultMinutes: 60 }).blocks.find(block => block.task.id === 'c').endMinutes, 900);
});

test('dayLoad sums durations of open tasks planned for the day', () => {
  const tasks = [task('a', { durationMinutes: 90 }), task('b', { durationMinutes: 45, plannedTime: '08:00' }), task('c'), task('d', { durationMinutes: 60, isCompleted: true }), task('e', { durationMinutes: 30, plannedDate: '2026-10-10' })];
  assert.deepEqual(json(Core.dayLoad(tasks, DAY)), { minutes: 135, withDuration: 2, withoutDuration: 1 });
});

test('daily capacity defaults to 6 hours, 0 turns it off, and backups reject invalid values', async () => {
  for (const [settings, expected] of [[{}, 360], [{ dailyCapacityMinutes: 0 }, 0], [{ dailyCapacityMinutes: 480 }, 480], [{ dailyCapacityMinutes: 2000 }, 360], [{ dailyCapacityMinutes: '480' }, 360], [{ dailyCapacityMinutes: 90.5 }, 360]]) {
    assert.equal(Core.dailyCapacityMinutes(settings), expected, JSON.stringify(settings));
  }
  const base = Core.migrateStateV3({ version: 2, tasks: [], projects: [], tags: [], settings: {}, ui: {} }).state;
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };
  const good = await Backup.exportBackupV3({ ...base, settings: { ...base.settings, dailyCapacityMinutes: 480 } }, storage, '2026-10-09T18:00:00.000Z');
  assert.equal((await Backup.inspectBackupV3(good)).state.settings.dailyCapacityMinutes, 480);
  await assert.rejects(Backup.exportBackupV3({ ...base, settings: { ...base.settings, dailyCapacityMinutes: 2000 } }, storage, '2026-10-09T18:00:00.000Z'), /dailyCapacityMinutes/);
});

function calendarAdapter() {
  let adapter;
  runInNewContextWithI18n(read('js/calendar-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter;
}

function renderDay(tasks, settings = {}) {
  const state = { tasks, habits: [], goals: [], settings: { weekStartsOn: 1, ...settings }, ui: { calendarView: 'day', calendarDate: DAY, calendarVisibility: { tasks: true, habits: true, goals: true, milestones: true } } };
  const ctx = {
    state, Core, calendarDate: () => DAY, calendarLogs: () => [], parseLocalDate: value => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); },
    formatDate: value => `F:${value}`, pageHeader: title => `<h1>${title}</h1>`, esc: value => String(value), durationLabel: minutes => `${minutes}m`,
    goalProgressLabel: () => '', goalStatusLabel: () => '',
  };
  return calendarAdapter().renderRoute({ type: 'calendar' }, ctx);
}

test('the calendar day view shows capacity, tasks without a time and an hour grid of blocks', () => {
  const html = renderDay([
    task('a', { title: 'Pisanje', plannedTime: '09:30', durationMinutes: 90 }),
    task('b', { plannedTime: '10:00', durationMinutes: 30 }),
    task('c', { plannedTime: '14:00' }),
    task('d', { plannedTime: '16:00', durationMinutes: 30, isCompleted: true }),
    task('u1', { title: 'Bez vremena jedan' }),
  ]);
  assert.match(html, /data-action="calendar-view" data-view="day" aria-pressed="true"/);
  assert.match(html, /data-action="calendar-prev" aria-label="Previous day"/);
  assert.match(html, /<div class="day-capacity" data-day-capacity role="status"><span>Planned 120m of 360m<\/span>/);
  assert.match(html, /<div class="day-unscheduled-item" draggable="true" data-calendar-drag="task" data-calendar-item-id="u1">/);
  assert.match(html, /<input class="input task-time-input" type="time" data-task-time="plannedTime" data-task-id="u1" aria-label="Time for Bez vremena jedan">/);
  assert.match(html, /<div class="day-grid" data-calendar-date="2026-10-09"/);
  const rows = [...html.matchAll(/class="day-grid-hour" data-calendar-time="(\d\d:00)"/g)].map(match => match[1]);
  assert.equal(rows.length, 18);
  assert.equal(rows[0], '06:00');
  assert.equal(rows[17], '23:00');
  assert.match(html, /class="day-grid-block has-conflict"[^>]*data-action="open-task" data-task-id="a"[^>]*style="top:calc\(var\(--hour-height\) \* 3\.5\);height:calc\(var\(--hour-height\) \* 1\.5\)"[^>]*><strong>Pisanje<\/strong><span>09:30–11:00<\/span>/);
  assert.match(html, /class="day-grid-block is-estimated"[^>]*data-task-id="c"[^>]*height:calc\(var\(--hour-height\) \* 0\.5\)/);
  assert.match(html, /class="day-grid-block is-completed"[^>]*data-task-id="d"/);
});

test('an over-full day warns, an empty day offers to add a task, and capacity can be off', () => {
  const over = renderDay([task('a', { durationMinutes: 300 }), task('b', { durationMinutes: 120 })]);
  assert.match(over, /<div class="day-capacity is-over" data-day-capacity role="status"><span>Planned 420m of 360m<\/span>[\s\S]*Over capacity by 60m/);
  const empty = renderDay([]);
  assert.match(empty, /No tasks planned for this day\./);
  assert.match(empty, /data-action="calendar-new-task" data-date="2026-10-09"/);
  assert.doesNotMatch(empty, /data-day-capacity/);
  assert.doesNotMatch(renderDay([task('a', { durationMinutes: 60 })], { dailyCapacityMinutes: 0 }), /data-day-capacity/);
});

test('the day view is a stored calendar view and moves by one day', () => {
  const app = read('js/app.js');
  assert.match(app, /next\.ui\.calendarView = \['day', 'week', 'month'\]\.includes\(next\.ui\.calendarView\) \? next\.ui\.calendarView : 'week';/);
  const start = app.indexOf('  function navigateCalendar(');
  const navigate = app.slice(start, app.indexOf('\n  function ', start + 1));
  const context = { Core, state: { ui: { calendarView: 'day', calendarDate: DAY } }, calendarDate: () => context.state.ui.calendarDate, parseLocalDate: value => new Date(`${value}T00:00:00`), saveAndRender() {} };
  vm.createContext(context);
  vm.runInContext(navigate, context);
  vm.runInContext('navigateCalendar(1)', context);
  assert.equal(context.state.ui.calendarDate, '2026-10-10');
  const adapter = calendarAdapter();
  const ctx = { state: { ui: { calendarView: 'week' } }, saveAndRender() {} };
  adapter.handleAction('calendar-view', { target: { closest: () => ({ dataset: { view: 'day' } }) } }, ctx);
  assert.equal(ctx.state.ui.calendarView, 'day');
});

test('Today shows the planned load against capacity once a task has a duration', () => {
  const app = read('js/app.js');
  const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const context = { Core, state: { tasks: [task('a', { plannedDate: Core.dateOnly(), durationMinutes: 300 }), task('b', { plannedDate: Core.dateOnly(), durationMinutes: 90 })], settings: {} } };
  vm.createContext(withI18n(context));
  vm.runInContext(`${slice('  function durationLabel(', '  function todayCapacityItem(')}\n${slice('  function todayCapacityItem(', '  function renderToday(')}`, context);
  assert.match(vm.runInContext('todayCapacityItem()', context), /<span class="today-capacity is-over" data-today-capacity aria-label="Over capacity: 6 h 30 min of 6 h">6 h 30 min \/ 6 h<\/span>/);
  context.state.settings.dailyCapacityMinutes = 480;
  assert.match(vm.runInContext('todayCapacityItem()', context), /<span class="today-capacity" data-today-capacity>6 h 30 min \/ 8 h<\/span>/);
  context.state.tasks = [task('c', { plannedDate: Core.dateOnly() })];
  assert.equal(vm.runInContext('todayCapacityItem()', context), '');
  assert.equal(vm.runInContext('durationLabel(45)', context), '45 min');
  assert.equal(vm.runInContext('durationLabel(120)', context), '2 h');
  assert.match(app, /data-today-open-count>[^`]*<\/span>\$\{todayCapacityItem\(\)\}/);
});

test('Settings offers the daily capacity and the app stores a valid choice', () => {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const html = adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [], dailyCapacityMinutes: 480 } }, Core,
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value), release: Release, environmentInfo: () => ({}),
  });
  assert.match(html, /<label class="settings-label" for="daily-capacity"><strong>Daily capacity<\/strong>[\s\S]*?<select class="input" id="daily-capacity">/);
  assert.match(html, /<option value="0">Off<\/option>/);
  assert.match(html, /<option value="480" selected>8 h<\/option>/);
  assert.match(read('js/app.js'), /event\.target\.id === 'daily-capacity'\) \{ const minutes = Number\(event\.target\.value\); if \(Number\.isInteger\(minutes\) && minutes >= 0 && minutes <= 1440\)/);
});

test('Quick Add has a duration chip with preset values that wins over the parsed duration', () => {
  const app = read('js/app.js');
  assert.match(app, /data-action="quick-duration-picker"><i class="ph ph-timer"><\/i>\$\{d\.durationMinutes \? esc\(durationLabel\(d\.durationMinutes\)\) : tr\('Duration'\)\}/);
  const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const context = { Core, modalState: { type: 'quick', draft: { durationMinutes: null } }, esc: String, popover: null, openPopover(anchor, html) { context.popover = html; }, closePopover() { context.closed = true; }, renderModal() { context.rendered = true; } };
  vm.createContext(withI18n(context));
  vm.runInContext(`${slice('  function durationLabel(', '  function todayCapacityItem(')}\n${slice('  function openDurationPicker(', '  function setReminder(')}`, context);
  vm.runInContext('openDurationPicker({})', context);
  for (const minutes of [15, 30, 45, 60, 90, 120]) assert.match(context.popover, new RegExp(`data-pop-action="set-duration" data-minutes="${minutes}"`));
  assert.doesNotMatch(context.popover, /data-minutes=""/, 'nothing to remove yet');
  context.modalState.draft.durationMinutes = 30;
  vm.runInContext('openDurationPicker({})', context);
  assert.match(context.popover, /class="popover-option is-selected" type="button" data-pop-action="set-duration" data-minutes="30"/);
  assert.match(context.popover, /data-pop-action="set-duration" data-minutes=""><i class="ph ph-x"><\/i>Remove duration/);
  vm.runInContext("setQuickDuration('45')", context);
  assert.equal(context.modalState.draft.durationMinutes, 45);
  vm.runInContext("setQuickDuration('')", context);
  assert.equal(context.modalState.draft.durationMinutes, null);
  assert.ok(context.closed && context.rendered);
  assert.match(app, /action === 'set-duration'\) setQuickDuration\(button\.dataset\.minutes\)/);
});

test('V1.12 is released as 1.12.0', () => {
  assert.equal(Release.APP_VERSION, '1.12.0');
  assert.match(read('sw.js'), /const VERSION = '1\.12\.0';/);
});
