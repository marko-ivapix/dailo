// R91: Kalendar. A "3 dana" view: three days side by side with their cards (a phone can read them), aligned to today
// so that picking one of them does not move the columns; the arrows move three days. A task shown on its deadline day
// (it has no planned day) looks different from a planned one: the hourglass, as everywhere for "Rok". On a touch
// screen a calendar task can be held and dragged onto a day (the week strip, a 3-day column, a month day) or an hour
// of Raspored, like the mouse drag on a computer.
// Spec: docs/superpowers/specs/2026-10-15-r91-calendar.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const css = read('css/styles.css');
const TODAY = '2026-10-15';
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function calendarModule() {
  let registered;
  runInNewContextWithI18n(read('js/calendar-ui.js'), { window: { TodoDomainModules: { register: value => { registered = value; } } } });
  return registered;
}
function context(tasks, ui = {}) {
  const state = { tasks, goals: [], projects: [], habits: [], settings: { weekStartsOn: 1, dailyCapacityMinutes: 360 }, ui: { calendarView: 'three', calendarDate: TODAY, calendarDayMode: 'list', ...ui } };
  return {
    state, Core: { ...Core, dateOnly: date => (date ? Core.dateOnly(date) : TODAY) }, esc,
    currentRoute: () => ({ type: 'calendar' }), listTasks: () => state.tasks, calendarDate: () => state.ui.calendarDate,
    parseLocalDate: Core.parseDateOnly, formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    pageHeader: title => `<header>${title}</header>`, durationLabel: minutes => `${minutes}m`, plannedMonthLabel: month => month,
    calendarTaskRow: (task, date) => `<row ${task.id}${date ? ` on ${date}` : ''}>`, deadlineRow: () => '<deadline>', foldButton: () => '', emptyState: () => '<empty>',
  };
}
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, plannedDate: null, dueDate: null, ...fields });

test('"3 dana" shows three days side by side, aligned to today, with their cards', () => {
  const html = calendarModule().renderRoute({ type: 'calendar' }, context([task('plan', { plannedDate: '2026-10-16' }), task('due', { dueDate: '2026-10-17' }), task('far', { plannedDate: '2026-10-19' })]));
  assert.match(html, /data-action="calendar-view" data-view="three" aria-pressed="true">3 days<\/button>/);
  const days = [...html.matchAll(/<section class="calendar-three-day([^"]*)" data-calendar-date="([\d-]+)">/g)].map(match => [match[2], match[1]]);
  assert.deepEqual(days, [['2026-10-15', ' is-today is-selected'], ['2026-10-16', ''], ['2026-10-17', '']]);
  assert.match(html, /data-calendar-date="2026-10-16"><button class="calendar-three-heading" type="button" data-action="calendar-pick" data-date="2026-10-16" aria-pressed="false"/);
  assert.match(html, /data-calendar-item-id="plan"/);
  assert.doesNotMatch(html, /data-calendar-item-id="far"/, 'the fourth day is in the next three');
  assert.match(html, /aria-label="Previous 3 days"/);
  const later = calendarModule().renderRoute({ type: 'calendar' }, context([], { calendarDate: '2026-10-17' }));
  assert.deepEqual([...later.matchAll(/class="calendar-three-day[^"]*" data-calendar-date="([\d-]+)"/g)].map(match => match[1]), ['2026-10-15', '2026-10-16', '2026-10-17'], 'picking the third day keeps the columns');
  const next = calendarModule().renderRoute({ type: 'calendar' }, context([], { calendarDate: '2026-10-18' }));
  assert.deepEqual([...next.matchAll(/class="calendar-three-day[^"]*" data-calendar-date="([\d-]+)"/g)].map(match => match[1]), ['2026-10-18', '2026-10-19', '2026-10-20']);
  assert.match(fn('navigateCalendar'), /else if \(state\.ui\.calendarView === 'three'\) state\.ui\.calendarDate = Core\.addDays\(date, direction \* 3\);/);
  assert.match(app, /next\.ui\.calendarView = \['week', 'three', 'month', 'upcoming'\]\.includes\(next\.ui\.calendarView\) \? next\.ui\.calendarView : 'week';/);
});

test('a task on its deadline day looks different from a planned one', () => {
  const module = calendarModule();
  const html = module.renderRoute({ type: 'calendar' }, context([task('plan', { plannedDate: TODAY }), task('due', { dueDate: TODAY })]));
  assert.match(html, /<button class="calendar-card is-due" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="due" data-action="open-task" data-task-id="due"><i class="ph ph-hourglass-medium" aria-hidden="true"><\/i><span class="sr-only">Due: <\/span>due<\/button>/);
  assert.match(html, /<button class="calendar-card" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="plan"/);
  assert.match(html, /<row due on 2026-10-15>/, 'the day list passes the day, so its row can tell');
  assert.match(app, /calendarTaskRow\(task, date\) \{ return taskRow\(task, 'calendar', \{ today: true, dueItem: Boolean\(date\) && !task\.plannedDate && task\.dueDate === date \}\); \},/);
  const tasksUi = read('js/tasks-ui.js');
  assert.match(tasksUi, /<article class="task-row task-row--today \$\{task\.isCompleted \? 'is-completed' : ''\}\$\{options\.dueItem \? ' is-due-item' : ''\}"/);
  assert.match(tasksUi, /<div class="task-title">\$\{options\.dueItem \? '<i class="ph ph-hourglass-medium task-due-icon" aria-hidden="true"><\/i>' : ''\}\$\{esc\(task\.title\)\}<\/div>/);
  assert.match(read('js/calendar-ui.js'), /<span class="calendar-month-title\$\{due \? ' is-due' : ''\}">/);
  for (const rule of ['.calendar-card.is-due {', '.task-row.is-due-item {', '.task-due-icon {', '.calendar-month-title.is-due {']) assert.ok(css.includes(rule), rule);
});

test('a phone can hold a calendar task and drop it on a day or an hour', () => {
  const drag = read('js/drag-ui.js'); // R110: the touch drag moved to js/drag-ui.js.
  assert.match(drag, /const CALENDAR_TOUCH_SOURCES = '\[data-calendar-drag="task"\], \.task-row\[data-list-context="calendar"\]';/);
  assert.match(drag, /const CALENDAR_TOUCH_TARGETS = '\[data-calendar-time\], \[data-calendar-date\]';/);
  const start = fn('handleCalendarTouchStart');
  assert.match(start, /if \(event\.pointerType === 'mouse' \|\| !event\.isPrimary \|\| calendarTouch \|\| touchReorder \|\| currentRoute\(\)\.type !== 'calendar'\) return;/);
  assert.match(start, /drag\.timer = setTimeout\(\(\) => startCalendarTouch\(drag\), 400\);/);
  assert.match(fn('startCalendarTouch'), /if \(taskSwipeState\?\.row === drag\.source\) \{ resetTaskSwipe\(taskSwipeState\.row, taskSwipeState\.originalStyle\); taskSwipeState = null; \}/, 'the swipe gives way');
  assert.match(fn('handleCalendarTouchMove'), /const target = document\.elementFromPoint\(event\.clientX, event\.clientY\)\?\.closest\?\.\(CALENDAR_TOUCH_TARGETS\) \|\| null;/);
  assert.match(fn('finishCalendarTouch'), /if \(Core\.parseDateOnly\(date\)\) dropTaskOnDay\(drag\.id, date, Core\.normalizeTime\(target\.dataset\.calendarTime\)\);/);
  for (const listener of ["document.addEventListener('pointerdown', handleCalendarTouchStart);", "document.addEventListener('pointermove', handleCalendarTouchMove, { passive: false });", "document.addEventListener('pointerup', finishCalendarTouch);", "document.addEventListener('pointercancel', finishCalendarTouch);"]) assert.ok(fn('attach').includes(listener), listener); // R110: wired by js/drag-ui.js
  assert.match(fn('blockTouchScroll'), /calendarTouch\?\.active/);
  assert.match(read('js/calendar-ui.js'), /<button class="calendar-month-cell\$\{classes\}" type="button" data-action="calendar-pick" data-date="\$\{date\}" data-calendar-date="\$\{date\}"/, 'a month day takes a drop');
  for (const rule of ['.calendar-card.is-touch-dragging, .day-grid-block.is-touch-dragging, .day-unscheduled-item.is-touch-dragging {', '.calendar-three-day.is-drop-target, .calendar-month-cell.is-drop-target, .calendar-strip-day.is-drop-target {']) assert.ok(css.includes(rule), rule);
});

test('the 3-day columns are styled for a phone; the guide and the lines are Serbian', () => {
  for (const rule of ['.calendar-three {', '.calendar-three-day {', '.calendar-three-heading {', '.calendar-three .calendar-cards {', '.calendar-three .calendar-day-add {']) assert.ok(css.includes(rule), rule);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['3 days', '3 dana'], ['Previous 3 days', 'Prethodna 3 dana'], ['Next 3 days', 'Sledeća 3 dana']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('U <strong>Kalendaru</strong> je i prikaz <strong>3 dana</strong>. Zadatak držiš pa ga prevučeš na drugi dan ili, u Rasporedu, na drugi sat. Zadatak koji je tu zbog roka ima peščani sat.'));
});

test('R91 shipped as 2.0.0-alpha.118 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 118) >= 118);
});
