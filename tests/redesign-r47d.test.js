// Redesign R47d: the desktop layer, part 4 — the calendar on a wide screen (K8) and dragging tasks onto the sidebar (K9).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r47-desktop.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const calendar = read('js/calendar-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fnIn = source => name => { const start = source.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
const fn = fnIn(app);
const cal = fnIn(calendar);
const block = css.slice(css.indexOf('/* Redesign R47d'), css.indexOf('/* Keep primary compact actions touchable'));
const T = '2026-10-12';
const plain = value => JSON.parse(JSON.stringify(value));

function calendarContext(state) {
  const context = withI18n({
    I18n: { locale: () => 'en-US' }, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : T) },
    WEEKDAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  });
  context.ctx = {
    state, Core: context.Core, esc: value => String(value), listTasks: () => state.tasks,
    formatDate: value => `D:${value}`, parseLocalDate: value => new Date(`${value}T12:00:00`), durationLabel: minutes => `${minutes} min`,
  };
  vm.createContext(context);
  vm.runInContext(['capitalized', 'listed', 'periodBar', 'dayLabel', 'dot', 'cards', 'dayLoadBar', 'monthTitles', 'renderWeek', 'renderMonth'].map(cal).join(''), context);
  return context;
}
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, plannedDate: null, plannedTime: null, dueDate: null, durationMinutes: null, projectId: null, ...fields });

test('K8 week: each day has a load bar against the daily capacity and "+ Dodaj" for that day; "Danas" sits next to the arrows', () => {
  const state = { tasks: [task('a', { plannedDate: T, durationMinutes: 240 }), task('b', { plannedDate: T, durationMinutes: 180 }), task('c', { plannedDate: '2026-10-13', durationMinutes: 60 })], goals: [], settings: { weekStartsOn: 'monday', dailyCapacityMinutes: 360 } };
  const context = calendarContext(state);
  const html = vm.runInContext(`renderWeek(ctx, '${T}')`, context);
  assert.match(html, /<span class="calendar-load is-over" title="Planned 420 min of 360 min" aria-hidden="true"><span style="width:100%"><\/span><\/span>/, 'over capacity');
  assert.match(html, /<span class="calendar-load" title="Planned 60 min of 360 min" aria-hidden="true"><span style="width:17%"><\/span><\/span>/);
  assert.equal((html.match(/class="calendar-load/g) || []).length, 2, 'days without planned time have no bar');
  assert.match(html, /<button class="calendar-day-add" type="button" data-action="quick-add" data-date="2026-10-14" aria-label="Add a task for D:2026-10-14"><i class="ph ph-plus" aria-hidden="true"><\/i> Add<\/button>/);
  // R63: "Danas" is a styled secondary button (it was a bare grey button on a wide screen).
  assert.match(html, /<button class="btn btn-secondary calendar-today" type="button" data-action="calendar-today">Today<\/button><button class="btn-icon" type="button" data-action="calendar-prev"/);
  state.settings.dailyCapacityMinutes = 0;
  assert.doesNotMatch(vm.runInContext(`renderWeek(ctx, '${T}')`, context), /calendar-load/, 'no bar with the capacity off');
});

test('K8 month: a day lists up to three titles and "+N još"', () => {
  const state = { tasks: ['one', 'two', 'three', 'four', 'five'].map((id, index) => task(id, { plannedDate: T, plannedTime: index === 4 ? '08:00' : null })), goals: [], settings: { weekStartsOn: 'monday' } };
  const context = calendarContext(state);
  const html = vm.runInContext(`renderMonth(ctx, '${T}')`, context);
  assert.match(html, /<span>12<\/span><i class="calendar-dot" aria-hidden="true"><\/i><small class="calendar-month-titles"><span class="calendar-month-title">five<\/span><span class="calendar-month-title">four<\/span><span class="calendar-month-title">one<\/span><span class="calendar-month-more">\+2 more<\/span><\/small><\/button>/, 'timed first, then by title, like the day list');
  assert.doesNotMatch(html.slice(html.indexOf('data-date="2026-10-13"')), /calendar-month-titles/, 'an empty day has none');
});

test('K8: "+ Dodaj" plans for its day; "Danas" selects today', () => {
  assert.match(app, /plannedDate: Core\.parseDateOnly\(el\.dataset\.date\) \? el\.dataset\.date : null/);
  assert.match(app, /else if \(action === 'calendar-today'\) calendarToday\(\);/);
});

test('K8 CSS: the bar, "+ Dodaj", the titles and "Danas" only on a wide screen', () => {
  assert.ok(block.length > 0, 'the R47d block sits before the touch guard');
  assert.match(block, /\.calendar-load, \.calendar-day-add, \.calendar-month-titles, \.calendar-today \{ display: none; \}/);
  assert.match(block, /@media \(min-width: 1024px\) \{\n  \.calendar-load \{ display: block;/);
  assert.match(block, /  \.calendar-day-add \{ display: flex;/);
  assert.match(block, /  \.calendar-month-titles \{ display: grid;/);
  assert.match(block, /  \.calendar-today \{ display: inline-flex; \}/);
  assert.match(block, /  \.calendar-month-cell \.calendar-dot \{ display: none; \}/);
});

test('K9: a task dropped on the sidebar goes to Danas, to tomorrow or into a project, with Poništi', () => {
  const calls = [];
  const context = {
    addTaskToToday: id => calls.push(['today', id]), moveTaskToTomorrow: id => calls.push(['tomorrow', id]), moveTaskToProject: (id, project) => calls.push(['project', id, project]),
    decodeURIComponent,
  };
  vm.createContext(context);
  vm.runInContext(`${fn('sidebarDropTarget')}${fn('dropTaskOnSidebar')}`, context);
  const target = attrs => { const el = { dataset: attrs }; return context.sidebarDropTarget({ closest: selector => (selector.includes('#desktop-sidebar') ? el : null) }); };
  context.dropTaskOnSidebar('t1', target({ route: 'today' }));
  context.dropTaskOnSidebar('t1', target({ sidebarDrop: 'tomorrow' }));
  context.dropTaskOnSidebar('t1', target({ route: 'project/p%201' }));
  assert.deepEqual(calls, [['today', 't1'], ['tomorrow', 't1'], ['project', 't1', 'p 1']]);
  assert.equal(context.sidebarDropTarget({ closest: () => null }), null);
  assert.match(fn('sidebarDropTarget'), /'#desktop-sidebar \[data-sidebar-drop\], #desktop-sidebar \[data-route="today"\], #desktop-sidebar \[data-route\^="project\/"\]'/);
});

test('K9: moving into a project by drag can be undone; a repeating task keeps its own question', () => {
  const tasks = [{ id: 't1', projectId: null, areaId: 'a1', isInbox: false }, { id: 't2', projectId: 'p1', areaId: null, isInbox: false }];
  const calls = [];
  const context = {
    getTask: id => tasks.find(item => item.id === id), getProject: id => (id === 'p1' || id === 'p2' ? { id } : null),
    requestTaskEdit: (id, changes) => { Object.assign(tasks.find(item => item.id === id), changes); calls.push(['edit', id, changes]); return false; },
    setUndo: (message, undo) => { calls.push(['undo', message]); context.undo = undo; },
    msg: key => key, nowIso: () => 'now', saveState: () => calls.push(['save']), render: () => calls.push(['render']),
  };
  vm.createContext(context);
  vm.runInContext(fn('moveTaskToProject'), context);
  context.moveTaskToProject('t1', 'p1');
  assert.deepEqual(plain(calls.splice(0)), [['edit', 't1', { projectId: 'p1', areaId: null, isInbox: false }], ['undo', 'Task moved to project']]);
  context.undo();
  assert.deepEqual(tasks[0], { id: 't1', projectId: null, areaId: 'a1', isInbox: false, updatedAt: 'now' });
  context.moveTaskToProject('t2', 'p1');
  context.moveTaskToProject('t1', 'gone');
  assert.deepEqual(calls.filter(call => call[0] === 'edit'), [], 'the same project or a missing one changes nothing');
});

test('K9: a calendar card dropped on a day plans it with Poništi; a repeating task asks first', () => {
  const tasks = [{ id: 't1', plannedDate: '2026-10-10', plannedTime: null, isInbox: true, todayOrder: null }];
  const calls = [];
  let asks = false;
  const context = {
    Core: { ...Core, dateOnly: () => T }, getTask: id => tasks.find(item => item.id === id),
    requestTaskEdit: (id, changes) => { calls.push(['edit', id, changes]); if (asks) return true; Object.assign(tasks.find(item => item.id === id), changes); return false; },
    setUndo: (message, undo) => { calls.push(['undo', message]); context.undo = undo; },
    msg: key => key, nowIso: () => 'now', saveState: () => {}, render: () => {},
  };
  vm.createContext(context);
  vm.runInContext(fn('dropTaskOnDay'), context);
  context.dropTaskOnDay('t1', '2026-10-15', '09:30');
  assert.deepEqual(plain(calls.splice(0)), [['edit', 't1', { plannedDate: '2026-10-15', plannedTime: '09:30', isInbox: false }], ['undo', 'Task moved to another day']]);
  context.undo();
  assert.deepEqual(tasks[0], { id: 't1', plannedDate: '2026-10-10', plannedTime: null, isInbox: true, todayOrder: null, updatedAt: 'now' });
  context.dropTaskOnDay('t1', T, null);
  assert.deepEqual(calls.splice(0).map(call => (call[0] === 'undo' ? call[1] : call[0])), ['edit', 'Task moved to Today']);
  asks = true;
  context.dropTaskOnDay('t1', '2026-10-13', null);
  assert.deepEqual(calls.splice(0).map(call => call[0]), ['edit'], 'the "Samo ovo / Ovo i buduća" question has its own Poništi');
});

test('K9 wiring: rows and cards drop on the sidebar; the drop zone lights up while dragging', () => {
  const over = fn('handleDragOver');
  assert.match(over, /const sidebarTarget = \['task', 'calendar-task'\]\.includes\(dragState\.type\) && sidebarDropTarget\(event\.target\);\n    if \(sidebarTarget\) \{ event\.preventDefault\(\); sidebarTarget\.element\.classList\.add\('is-drop-target'\); return; \}/);
  const drop = fn('handleDrop');
  assert.match(drop, /const sidebarTarget = \['task', 'calendar-task'\]\.includes\(dragState\.type\) && sidebarDropTarget\(event\.target\);\n    if \(sidebarTarget\) dropTaskOnSidebar\(dragState\.id, sidebarTarget\);\n    else if \(dragState\.type\.startsWith\('calendar-'\)\) \{/);
  assert.match(drop, /if \(Core\.parseDateOnly\(date\) && dragState\.type === 'calendar-task'\) dropTaskOnDay\(dragState\.id, date, time\);/);
  assert.match(fn('handleDragStart'), /calendar\.classList\.add\('is-dragging'\); document\.body\.classList\.add\('task-drag-active'\); return; \}/);
  assert.match(block, /  \.task-drag-active \.sidebar-drop \{ border-color: var\(--blue-300\); color: var\(--ink-2\); \}/);
});

test('Serbian', () => {
  for (const [en, value] of [['+{count} more', '+{count} još'], ['Task moved to another day', 'Zadatak je premešten na drugi dan'], ['Add a task for {date}', 'Dodaj zadatak za {date}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R47d shipped as 2.0.0-alpha.76 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 76);
});
