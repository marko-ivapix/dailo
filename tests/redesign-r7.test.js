// Redesign R7: Calendar (C1–C9).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r7-calendar.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { I18n, withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const calendar = read('js/calendar-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = Core.dateOnly();
const DAY = '2026-10-14'; // a Wednesday; its Monday week is 12–18 October
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));

function adapter() {
  let registered;
  runInNewContextWithI18n(calendar, { window: { TodoDomainModules: { register: value => { registered = value; } } } });
  return registered;
}

function calendarContext(data = {}, ui = {}) {
  const calls = [];
  const state = {
    tasks: [], goals: [], projects: [],
    habits: [{ id: 'h1', name: 'Walk the dog', status: 'active', frequency: { type: 'daily' } }],
    settings: { weekStartsOn: 1, dailyCapacityMinutes: 360 },
    ui: { calendarView: 'week', calendarDate: DAY, calendarDayMode: 'list', ...ui },
    ...data,
  };
  const ctx = {
    calls, state, Core, esc,
    route: { type: 'calendar' },
    currentRoute: () => ctx.route,
    listTasks: () => state.tasks.filter(task => task.projectId !== 'archived'),
    calendarDate: () => state.ui.calendarDate,
    parseLocalDate: Core.parseDateOnly,
    formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}"></header>`,
    durationLabel: minutes => `${minutes}m`,
    calendarTaskRow: task => `<row ${task.id}>`,
    deadlineRow: ({ goal, milestone }) => `<deadline ${milestone ? milestone.id : goal.id}>`,
    saveState: () => calls.push(['save']),
    saveAndRender: () => calls.push(['saveAndRender']),
    navigateCalendar: direction => calls.push(['navigateCalendar', direction]),
    navigate: route => calls.push(['navigate', route]),
  };
  return ctx;
}

const week = () => {
  const tasks = [
    { id: 'a', title: 'Late call', plannedDate: DAY, plannedTime: '14:00' },
    { id: 'b', title: 'Early run', plannedDate: DAY, plannedTime: '09:30', durationMinutes: 45 },
    { id: 'c', title: 'Untimed', plannedDate: DAY },
    { id: 'x', title: 'Hidden archived', plannedDate: DAY, projectId: 'archived' },
    { id: 'd', title: 'Due Friday', dueDate: '2026-10-16' },
  ];
  const goals = [{ id: 'g1', title: 'Marathon', status: 'active', targetDate: DAY, milestones: [] }];
  return { tasks, goals };
};

test('Core.calendarDayItems: open tasks on their plan day, else their due day; timed by time; deadlines; no habits', () => {
  const D = DAY;
  const state = {
    tasks: [
      { id: 'a', title: 'Late', plannedDate: D, plannedTime: '14:00' },
      { id: 'b', title: 'Early', plannedDate: D, plannedTime: '09:30' },
      { id: 'c', title: 'Untimed', plannedDate: D },
      { id: 'd', title: 'Due only', dueDate: D },
      { id: 'e', title: 'Planned elsewhere', plannedDate: '2026-10-13', dueDate: D },
      { id: 'f', title: 'Done', plannedDate: D, isCompleted: true },
      { id: 'g', title: 'Bad time', plannedDate: D, plannedTime: '25:00' },
      { id: 'h', title: 'Due with time', dueDate: D, dueTime: '08:00' },
      { id: 'i', title: 'Captured', dueDate: D, isInbox: true },
    ],
    goals: [
      { id: 'g1', title: 'Marathon', status: 'active', targetDate: D, milestones: [{ id: 'm1', title: '10 km', date: D, isCompleted: false }, { id: 'm2', title: 'Done step', date: D, isCompleted: true }] },
      { id: 'g2', title: 'Paused', status: 'paused', targetDate: D, milestones: [{ id: 'm3', title: 'Paused step', date: D }] },
    ],
    habits: [{ id: 'h1', name: 'Walk', status: 'active', frequency: { type: 'daily' } }],
  };
  const items = Core.calendarDayItems(state, D);
  assert.equal(items.date, D);
  assert.deepEqual(items.timed.map(task => task.id), ['b', 'a']);
  assert.deepEqual(items.untimed.map(task => task.id), ['g', 'i', 'd', 'h', 'c'], 'by title');
  assert.deepEqual(items.deadlines.map(item => item.milestone?.id || item.goal.id), ['g1', 'm1']);
  assert.equal(items.count, 9);
  assert.equal(Core.calendarDayItems(state, '2026-10-13').count, 1, 'the task planned elsewhere shows on its plan day only');
  assert.equal(Core.calendarDayItems({ tasks: [], goals: [] }, D).count, 0);
  assert.equal(Core.calendarDayItems({}, D).count, 0, 'missing lists are empty');
});

test('C1, C7: "Kalendar" with the Nedelja / Mesec / Predstojeće switch; no Dodaj, Danas, filter or summary', () => {
  const ctx = calendarContext(week());
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /^<header title="Calendar" subtitle="" add="false"><\/header><div class="view-tabs calendar-view-switch" role="group" aria-label="Calendar view"><button class="btn is-selected" type="button" data-action="calendar-view" data-view="week" aria-pressed="true">Week<\/button><button class="btn" type="button" data-action="calendar-view" data-view="month" aria-pressed="false">Month<\/button><button class="btn" type="button" data-action="calendar-view" data-view="upcoming" aria-pressed="false">Upcoming<\/button><\/div>/);
  assert.doesNotMatch(html, /calendar-add|calendar-today|data-calendar-visibility|calendar-summary|calendar-legend|calendar-detail|Walk the dog/);
});

test('C1, C3, C5: the week bar, a strip of seven days with dots, the selection and the wide-screen cards', () => {
  const ctx = calendarContext(week());
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /<div class="calendar-period-bar"><h2 class="calendar-period">Oct 12\s*–\s*18, 2026<\/h2><span class="calendar-arrows"><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="Previous week"><i class="ph ph-caret-left"><\/i><\/button><button class="btn-icon" type="button" data-action="calendar-next" aria-label="Next week"><i class="ph ph-caret-right"><\/i><\/button><\/span><\/div>/u);
  const days = [...html.matchAll(/<section class="calendar-strip-day([^"]*)" data-calendar-date="([\d-]+)">/g)].map(match => [match[2], match[1].trim()]);
  assert.deepEqual(days.map(day => day[0]), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(days.filter(day => day[1].includes('is-selected')).map(day => day[0]), [DAY]);
  assert.match(html, /<button class="calendar-strip-heading" type="button" data-action="calendar-pick" data-date="2026-10-14" aria-pressed="true" aria-label="F:2026-10-14, 4 planned"><span class="calendar-strip-weekday">Wed<\/span><strong>14<\/strong><i class="calendar-dot" aria-hidden="true"><\/i><\/button>/);
  assert.match(html, /data-date="2026-10-13" aria-pressed="false" aria-label="F:2026-10-13"><span class="calendar-strip-weekday">Tue<\/span><strong>13<\/strong><i class="calendar-dot is-empty" aria-hidden="true"><\/i>/);
  assert.match(html, /data-date="2026-10-16" aria-pressed="false" aria-label="F:2026-10-16, 1 planned">/, 'a due-only task marks its due day');
  // Wide screens: each day is a column of cards; a task card drags to another day (C3).
  assert.match(html, /<div class="calendar-cards"><button class="calendar-card" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="b" data-action="open-task" data-task-id="b"><b>09:30 · 45m<\/b>Early run<\/button><button class="calendar-card" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="a" data-action="open-task" data-task-id="a"><b>14:00<\/b>Late call<\/button><button class="calendar-card is-deadline" type="button" data-route="goal\/g1"><i class="ph ph-target" aria-hidden="true"><\/i>Marathon<\/button><button class="calendar-card" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="c" data-action="open-task" data-task-id="c">Untimed<\/button><\/div>/);
  assert.doesNotMatch(html, /Hidden archived/, 'S10: archived projects stay out');
  const sundayCtx = calendarContext(week());
  sundayCtx.state.settings.weekStartsOn = 'sunday';
  assert.match(adapter().renderRoute({ type: 'calendar' }, sundayCtx), /<section class="calendar-strip-day" data-calendar-date="2026-10-11">/, 'the week follows the week start');
});

test('C1, C5: the month grid has weekday names, blanks, dates and dots only', () => {
  const ctx = calendarContext(week(), { calendarView: 'month' });
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /<h2 class="calendar-period">October 2026<\/h2><span class="calendar-arrows"><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="Previous month">/);
  assert.match(html, /aria-label="Next month"/);
  const grid = html.slice(html.indexOf('<div class="calendar-month-grid">'), html.indexOf('<section class="calendar-day-panel"'));
  assert.deepEqual([...grid.matchAll(/<span class="calendar-grid-weekday">(\w+)<\/span>/g)].map(match => match[1]), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal((grid.match(/<span class="calendar-grid-blank" aria-hidden="true"><\/span>/g) || []).length, 3, '1 October 2026 is a Thursday');
  assert.equal((grid.match(/class="calendar-month-cell/g) || []).length, 31);
  assert.match(grid, /<button class="calendar-month-cell is-selected" type="button" data-action="calendar-pick" data-date="2026-10-14" aria-pressed="true" aria-label="F:2026-10-14, 4 planned"><span>14<\/span><i class="calendar-dot" aria-hidden="true"><\/i><\/button>/);
  assert.match(grid, /data-date="2026-10-15" aria-pressed="false" aria-label="F:2026-10-15"><span>15<\/span><i class="calendar-dot is-empty" aria-hidden="true"><\/i>/);
  assert.doesNotMatch(grid, /Early run|Marathon|calendar-card/, 'no task content in the month grid');
  ctx.state.settings.weekStartsOn = 'sunday';
  const sunday = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(sunday, /<div class="calendar-month-grid"><span class="calendar-grid-weekday">Sun<\/span>/);
  assert.equal((sunday.match(/calendar-grid-blank/g) || []).length, 4);
});

test('C4, C6: the day panel with the long date, "Lista / Raspored", the Today rows and the empty text', () => {
  const ctx = calendarContext(week());
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /<section class="calendar-day-panel" data-calendar-day="2026-10-14"><div class="calendar-day-head"><h2 class="calendar-day-title">F:2026-10-14<\/h2><div class="view-tabs calendar-day-mode" role="group" aria-label="Day view"><button class="btn is-selected" type="button" data-action="calendar-day-mode" data-mode="list" aria-pressed="true">List<\/button><button class="btn" type="button" data-action="calendar-day-mode" data-mode="schedule" aria-pressed="false">Schedule<\/button><\/div><\/div><div class="task-list today-card" data-list-context="calendar"><row b><row a><deadline g1><row c><\/div><\/section>$/);
  ctx.state.ui.calendarDate = '2026-10-13';
  assert.match(adapter().renderRoute({ type: 'calendar' }, ctx), /<div class="today-card"><p class="today-empty">No tasks for this day\. “\+” adds a task for this day\.<\/p><\/div><\/section>$/);
});

test('C6: Raspored is the V1.12 day view for the selected day, without the archived projects', () => {
  const data = week();
  data.tasks.push({ id: 'y', title: 'Archived block', plannedDate: DAY, plannedTime: '11:00', durationMinutes: 60, projectId: 'archived' });
  const ctx = calendarContext(data, { calendarDayMode: 'schedule' });
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /data-action="calendar-day-mode" data-mode="schedule" aria-pressed="true">Schedule<\/button><\/div><\/div><div class="day-view"><div class="day-capacity" data-day-capacity role="status"><span>Planned 45m of 360m<\/span>/);
  assert.match(html, /<section class="section day-unscheduled" data-calendar-date="2026-10-14">/);
  assert.match(html, /<div class="day-grid" data-calendar-date="2026-10-14">/);
  assert.match(html, /class="day-grid-block"[^>]*draggable="true" data-calendar-drag="task" data-calendar-item-id="b"/);
  assert.doesNotMatch(html, /Archived block|Hidden archived/);
  ctx.state.ui.calendarDate = '2026-10-13';
  const empty = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(empty, /<div class="day-view"><p class="today-empty">No tasks for this day\. “\+” adds a task for this day\.<\/p><\/div>/);
  assert.doesNotMatch(empty, /calendar-new-task|data-day-capacity/);
});

test('C9: Predstojeće lists the next 21 days by day, "Sutra" first; #upcoming opens it', () => {
  const plus = days => Core.addDays(TODAY, days);
  const data = {
    tasks: [
      { id: 't0', title: 'Today task', plannedDate: TODAY },
      { id: 't1', title: 'Tomorrow task', plannedDate: plus(1) },
      { id: 't3', title: 'Due later', dueDate: plus(3) },
      { id: 't21', title: 'Last day', plannedDate: plus(21) },
      { id: 't22', title: 'Too far', plannedDate: plus(22) },
      { id: 'tx', title: 'Archived later', plannedDate: plus(2), projectId: 'archived' },
    ],
    goals: [{ id: 'g1', title: 'Marathon', status: 'active', targetDate: plus(3), milestones: [] }],
  };
  const ctx = calendarContext(data, { calendarView: 'upcoming' });
  const html = adapter().renderRoute({ type: 'calendar' }, ctx);
  assert.match(html, /data-view="upcoming" aria-pressed="true">Upcoming<\/button><\/div><section class="calendar-upcoming-day" data-upcoming-date=/);
  const groups = [...html.matchAll(/<section class="calendar-upcoming-day" data-upcoming-date="([\d-]+)"><h2 class="section-label calendar-upcoming-label">([^<]+) <span>· D:[\d-]+<\/span><\/h2><div class="task-list today-card" data-list-context="calendar">(.*?)<\/div><\/section>/g)].map(match => match.slice(1));
  const weekday = date => { const name = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'long' }).format(Core.parseDateOnly(date)); return name.charAt(0).toUpperCase() + name.slice(1); };
  assert.deepEqual(groups, [[plus(1), 'Tomorrow', '<row t1>'], [plus(3), weekday(plus(3)), '<deadline g1><row t3>'], [plus(21), weekday(plus(21)), '<row t21>']]);
  assert.doesNotMatch(html, /calendar-period-bar|calendar-day-panel|Today task|Too far|Archived later/);
  const route = calendarContext(data, { calendarView: 'week' });
  route.route = { type: 'upcoming' };
  assert.match(adapter().renderRoute({ type: 'upcoming' }, route), /data-view="upcoming" aria-pressed="true"/, 'the old route opens Predstojeće');
  assert.match(adapter().renderRoute({ type: 'calendar' }, calendarContext({}, { calendarView: 'upcoming' })), /<div class="empty-state calendar-upcoming-empty"><h3>Nothing in the coming days<\/h3><\/div>$/);
});

test('the switch, the day pick, Lista / Raspored and the arrows', () => {
  const calendarAdapter = adapter();
  const act = (ctx, action, dataset = {}) => calendarAdapter.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
  const ctx = calendarContext();
  assert.equal(act(ctx, 'calendar-view', { view: 'month' }), true);
  assert.equal(ctx.state.ui.calendarView, 'month');
  act(ctx, 'calendar-view', { view: 'day' });
  assert.equal(ctx.state.ui.calendarView, 'week', 'only the three views');
  act(ctx, 'calendar-pick', { date: '2026-10-20' });
  assert.equal(ctx.state.ui.calendarDate, '2026-10-20');
  act(ctx, 'calendar-pick', { date: 'nope' });
  assert.equal(ctx.state.ui.calendarDate, '2026-10-20');
  act(ctx, 'calendar-day-mode', { mode: 'schedule' });
  assert.equal(ctx.state.ui.calendarDayMode, 'schedule');
  act(ctx, 'calendar-day-mode', { mode: 'other' });
  assert.equal(ctx.state.ui.calendarDayMode, 'list');
  act(ctx, 'calendar-prev');
  act(ctx, 'calendar-next');
  assert.deepEqual(ctx.calls.filter(call => call[0] === 'navigateCalendar'), [['navigateCalendar', -1], ['navigateCalendar', 1]]);
  assert.equal(ctx.calls.filter(call => call[0] === 'saveAndRender').length, 5, 'the ignored pick does not render');
  ctx.route = { type: 'upcoming' };
  act(ctx, 'calendar-view', { view: 'week' });
  assert.deepEqual(ctx.calls.slice(-2), [['save'], ['navigate', 'calendar']], 'from #upcoming a view opens #calendar');
  for (const old of ['calendar-detail', 'calendar-add', 'calendar-today', 'calendar-habit-checkin', 'calendar-goal-progress', 'calendar-new-task']) assert.equal(act(ctx, old, { date: DAY }), false, old);
  assert.equal(calendarAdapter.handleInput, undefined, 'no type filter');
  for (const modalType of ['calendar-day', 'calendar-value', 'calendar-progress']) assert.equal(calendarAdapter.renderRoute({ type: 'modal', modalType }, ctx), undefined, modalType);
});

test('stored views: week, month or upcoming; a stored "day" opens the week on Raspored', () => {
  const lines = app.match(/ {4}if \(next\.ui\.calendarView === 'day'\) next\.ui\.calendarDayMode = 'schedule';\n {4}next\.ui\.calendarView = \['week', 'month', 'upcoming'\]\.includes\(next\.ui\.calendarView\) \? next\.ui\.calendarView : 'week';\n {4}next\.ui\.calendarDayMode = next\.ui\.calendarDayMode === 'schedule' \? 'schedule' : 'list';\n/);
  assert.ok(lines, 'normalization lines');
  const run = ui => { const ctx = { next: { ui } }; vm.runInNewContext(lines[0], ctx); return plain(ctx.next.ui); };
  assert.deepEqual(run({ calendarView: 'day' }), { calendarView: 'week', calendarDayMode: 'schedule' });
  assert.deepEqual(run({ calendarView: 'upcoming' }), { calendarView: 'upcoming', calendarDayMode: 'list' });
  assert.deepEqual(run({ calendarView: 'month', calendarDayMode: 'schedule' }), { calendarView: 'month', calendarDayMode: 'schedule' });
  assert.deepEqual(run({}), { calendarView: 'week', calendarDayMode: 'list' });
  assert.match(app, /calendarView: 'week',\n\s+calendarDayMode: 'list',/, 'default state');
});

test('the arrows move a week, or a month that selects today when it holds today', () => {
  const ctx = { Core, state: { ui: { calendarView: 'week', calendarDate: DAY } }, parseLocalDate: Core.parseDateOnly, saveAndRender() {} };
  ctx.calendarDate = () => ctx.state.ui.calendarDate;
  vm.createContext(ctx);
  vm.runInContext(fn('navigateCalendar'), ctx);
  ctx.navigateCalendar(1);
  assert.equal(ctx.state.ui.calendarDate, '2026-10-21');
  ctx.navigateCalendar(-1);
  assert.equal(ctx.state.ui.calendarDate, DAY);
  ctx.state.ui.calendarView = 'month';
  const thisMonth = Core.parseDateOnly(`${TODAY.slice(0, 7)}-01`);
  ctx.state.ui.calendarDate = Core.dateOnly(new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 9));
  ctx.navigateCalendar(-1);
  assert.equal(ctx.state.ui.calendarDate, TODAY, 'back to the month of today selects today');
  ctx.navigateCalendar(-1);
  assert.equal(ctx.state.ui.calendarDate, Core.dateOnly(new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1)), 'another month selects its first day');
});

test('C1: the Calendar starts on today when it is opened from another screen', () => {
  const ctx = { Core, state: { ui: { calendarDate: '2026-01-05' } } };
  vm.createContext(ctx);
  vm.runInContext(`let calendarOpen = false;\n${fn('enterCalendarRoute')}`, ctx);
  ctx.enterCalendarRoute({ type: 'calendar' });
  assert.equal(ctx.state.ui.calendarDate, TODAY);
  ctx.state.ui.calendarDate = DAY;
  ctx.enterCalendarRoute({ type: 'calendar' });
  ctx.enterCalendarRoute({ type: 'upcoming' });
  assert.equal(ctx.state.ui.calendarDate, DAY, 'moving inside the Calendar keeps the day');
  ctx.enterCalendarRoute({ type: 'today' });
  ctx.enterCalendarRoute({ type: 'calendar' });
  assert.equal(ctx.state.ui.calendarDate, TODAY);
  assert.match(fn('renderMain'), /enterCalendarRoute\(route\);/);
});

test('C8: the floating "+" plans for the selected day in Nedelja and Mesec', () => {
  const ctx = { state: { ui: { tasksView: 'anytime', calendarView: 'week', calendarDate: DAY } }, route: { type: 'calendar' }, getProject: () => null };
  ctx.currentRoute = () => ctx.route;
  ctx.calendarDate = () => ctx.state.ui.calendarDate;
  vm.createContext(ctx);
  vm.runInContext(fn('routeQuickAddContext'), ctx);
  assert.deepEqual(plain(ctx.routeQuickAddContext()), { day: DAY });
  ctx.state.ui.calendarView = 'month';
  assert.deepEqual(plain(ctx.routeQuickAddContext()), { day: DAY });
  ctx.state.ui.calendarView = 'upcoming';
  assert.deepEqual(plain(ctx.routeQuickAddContext()), {});
  ctx.route = { type: 'upcoming' };
  assert.deepEqual(plain(ctx.routeQuickAddContext()), {});
  // The day is a default like Today's: a date typed in the title still wins.
  assert.match(fn('openQuickAdd'), /plannedDate: context\.plannedDate \|\| context\.day \|\| \(context\.today \? Core\.dateOnly\(\) : null\),\n\s+explicitPlan: Boolean\(context\.plannedDate\),/);
});

test('C9: Predstojeće left "Još"; the Day Detail, the type filter and the old Upcoming screen are gone', () => {
  assert.doesNotMatch(fn('renderMoreScreen'), /'upcoming'/);
  for (const name of ['renderUpcoming', 'openCalendarDetail', 'calendarHabitAction', 'openCalendarValue', 'openCalendarGoalProgress']) assert.doesNotMatch(app, new RegExp(`function ${name}\\(`), name);
  assert.doesNotMatch(app, /calendarReturnDate|calendarHabitQueues|'calendar-value'|'calendar-day'/);
  assert.doesNotMatch(calendar, /renderCalendarDetail|renderCalendarValue|renderCalendarGoalProgress|data-calendar-visibility|calendarVisibility/);
  assert.match(fn('renderMain'), /<div class="content \$\{route\.type === 'calendar' && state\.ui\.calendarView !== 'upcoming' \? 'calendar-content' : ''\}">/);
  assert.match(app, /const BOTTOM_NAV_PARENT = \{[^}]*upcoming: 'calendar'/);
});

test('the R7 layer: cards only on wide screens, dots, the selected switch button', () => {
  const start = css.indexOf('/* Redesign R7');
  assert.ok(start > 0, 'R7 layer');
  const layer = css.slice(start);
  assert.match(layer, /\.view-tabs \.btn\.is-selected \{[^}]*background: var\(--graphite-750\)/);
  assert.match(layer, /\.calendar-cards \{ display: none; \}/);
  assert.match(layer, /@media \(min-width: 1024px\) \{[\s\S]*?\.calendar-cards \{ display: grid;/);
  assert.match(layer, /\.calendar-dot\.is-empty \{ visibility: hidden; \}/);
  assert.match(layer, /\.calendar-day-title::first-letter \{ text-transform: uppercase; \}/);
});

test('Serbian labels for the calendar', () => {
  for (const [en, value] of [['List', 'Lista'], ['Schedule', 'Raspored'], ['Day view', 'Prikaz dana'], ['Nothing in the coming days', 'Ništa u narednim danima'], ['No tasks for this day. “+” adds a task for this day.', 'Nema zadataka za ovaj dan. „+“ dodaje zadatak za ovaj dan.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R7 shipped as 2.0.0-alpha.12 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 12);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
