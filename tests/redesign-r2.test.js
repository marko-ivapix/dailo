// Redesign R2: Today (T1–T7, T2a, G6, H6, M3, M6, Z2 early).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r2-today.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`  const ${name} = [^\\n]+\\n`))[0];

const TODAY = Core.dateOnly();
const day = offset => Core.addDays(TODAY, offset);

function moduleFor(file) {
  let module;
  runInNewContextWithI18n(read(file), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  return module;
}

function todayContext(state, extra = {}) {
  const ctx = {
    state, Core, esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    formatDate: date => `D(${date})`, formatPageToday: date => `LONG(${date})`,
    saveAndRender() { ctx.saved = (ctx.saved || 0) + 1; },
    ...extra,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${constLine('TODAY_LIMITS')}${fn('todayLimited')}${fn('todayDueLabel')}${fn('deadlineRow')}${fn('listTasks')}`, ctx);
  return ctx;
}

test('deriveTodayV3 lists the open milestones of active goals due today', () => {
  const goals = [
    { id: 'g1', title: 'Run', status: 'active', milestones: [{ id: 'm1', title: '5 km', date: TODAY, isCompleted: false }, { id: 'm2', title: 'Done', date: TODAY, isCompleted: true }, { id: 'm3', title: 'Later', date: day(2) }] },
    { id: 'g2', title: 'Paused', status: 'paused', milestones: [{ id: 'm4', title: 'Hidden', date: TODAY }] },
  ];
  const sections = Core.deriveTodayV3({ tasks: [], goals, habits: [] }, [], TODAY);
  assert.deepEqual(sections.milestones.map(item => [item.goal.id, item.milestone.id]), [['g1', 'm1']]);
});

test('T7: sections show 3, 5 and 5 rows until opened in place, remembered in ui.todayExpanded', () => {
  const state = { ui: { todayExpanded: { overdue: false, today: true, habits: false } } };
  const ctx = todayContext(state);
  const rows = n => Array.from({ length: n }, (_, i) => `<r${i}>`);
  const overdue = ctx.todayLimited('overdue', rows(5));
  assert.equal((overdue.match(/<r\d>/g) || []).length, 3);
  assert.match(overdue, /<button class="today-more" type="button" data-action="today-expand" data-today-key="overdue" aria-expanded="false">Show 2 more<\/button>/);
  const planned = ctx.todayLimited('today', rows(8));
  assert.equal((planned.match(/<r\d>/g) || []).length, 8);
  assert.match(planned, /aria-expanded="true">Show less<\/button>/);
  assert.doesNotMatch(ctx.todayLimited('habits', rows(5)), /today-more/, 'no button at the limit');
  assert.match(app, /action === 'today-expand'\) \{ const key = el\.dataset\.todayKey; if \(Object\.hasOwn\(TODAY_LIMITS, key\)\) \{ state\.ui\.todayExpanded = \{ \.\.\.state\.ui\.todayExpanded, \[key\]: !state\.ui\.todayExpanded\?\.\[key\] \}; saveAndRender\(\); \} \}/);
  assert.match(app, /next\.ui\.todayExpanded = Object\.fromEntries\(\['overdue', 'today', 'habits'\]\.map\(key => \[key, next\.ui\.todayExpanded\?\.\[key\] === true\]\)\);/);
  assert.match(sr, /"Show \{count\} more": "Prikaži još \{count\}"/);
  assert.match(sr, /"Show less": "Prikaži manje"/);
});

test('G6: due labels are red when late, amber today, gray later', () => {
  const ctx = todayContext({ ui: {} });
  assert.equal(ctx.todayDueLabel(day(-2), TODAY), `<span class="task-due is-overdue">Due D(${day(-2)})</span>`);
  assert.equal(ctx.todayDueLabel(TODAY, TODAY), '<span class="task-due is-today">Due today</span>');
  assert.equal(ctx.todayDueLabel(day(1), TODAY), '<span class="task-due">Due tomorrow</span>');
  assert.equal(ctx.todayDueLabel(day(5), TODAY), `<span class="task-due">Due D(${day(5)})</span>`);
  assert.equal(ctx.todayDueLabel(null, TODAY), '');
  assert.match(sr, /"Due \{date\}": "Rok \{date\}"/, 'no colon: "Rok 8. okt"');
  assert.match(sr, /"Due tomorrow": "Rok sutra"/);
});

test('T3: a Today task row has the checkbox, title, time · place and the flag and due label on the right', () => {
  const module = moduleFor('js/tasks-ui.js');
  const ctx = { Core, esc: String, getProject: id => (id === 'p' ? { id: 'p', name: 'Posao', color: '#123456' } : null), getArea: id => (id === 'a' ? { id: 'a', name: 'Kuća' } : null), todayDueLabel: date => (date ? `<due ${date}>` : ''), state: { settings: { focusTaskIds: [] } } };
  const high = module.renderTaskRow({ id: 't1', title: 'Report', projectId: 'p', plannedTime: '09:30', priority: 'high', dueDate: TODAY, tagIds: [] }, 'today', { today: true, draggable: true }, ctx);
  assert.match(high, /class="task-row task-row--today "/);
  assert.match(high, /data-inline-today-complete/);
  assert.match(high, /<div class="task-meta">09:30 · Posao<\/div>/);
  assert.match(high, /<span class="task-side"><i class="ph ph-flag task-flag task-flag--high" role="img" aria-label="High priority"><\/i><due [^>]+><\/span>/);
  assert.match(high, /draggable="true"/);
  assert.match(high, /data-action="task-menu"/, 'the menu stays until R3');
  assert.doesNotMatch(high, /toggle-focus-task|task-plan-picker/);
  const area = module.renderTaskRow({ id: 't2', title: 'Clean', areaId: 'a', priority: 'low', tagIds: [] }, 'today', { today: true }, ctx);
  assert.match(area, /<div class="task-meta">Kuća<\/div>/);
  assert.match(area, /<span class="task-side"><\/span>/, 'no flag for low priority');
  const medium = module.renderTaskRow({ id: 't3', title: 'Call', priority: 'medium', tagIds: [] }, 'today', { today: true }, ctx);
  assert.match(medium, /task-flag--medium" role="img" aria-label="Medium priority"/);
  assert.doesNotMatch(medium, /task-meta/);
  const done = module.renderTaskRow({ id: 't4', title: 'Done', isCompleted: true, dueDate: day(-1), tagIds: [] }, 'completed', { today: true }, ctx);
  assert.match(done, /task-row--today is-completed/);
  assert.doesNotMatch(done, /<due /, 'no due label once done');
  const suggestion = module.renderTaskRow({ id: 't5', title: 'Soon', dueDate: day(1), tagIds: [] }, 'suggestion', { today: true, addToday: true }, ctx);
  assert.match(suggestion, /<button class="quick-chip" type="button" data-action="inbox-today" data-task-id="t5">\+ Today<\/button>/);
});

test('T2a: goals and milestones are rows with a target icon that open the goal', () => {
  const state = { ui: {}, habitMetrics: {}, tasks: [] };
  const ctx = todayContext(state, { Core: { ...Core, computeGoalProgress: () => ({ percent: 44.6 }) } });
  const goal = { id: 'g1', title: 'Marathon', targetDate: day(-1) };
  const goalRow = ctx.deadlineRow({ goal }, TODAY);
  assert.match(goalRow, /^<article class="today-row deadline-row" data-goal-id="g1"><span class="deadline-icon" aria-hidden="true"><i class="ph ph-target"><\/i><\/span>/);
  assert.match(goalRow, /<button class="today-row-main" type="button" data-route="goal\/g1"><span class="task-title">Marathon<\/span><span class="task-meta">Goal · 45%<\/span><\/button>/);
  assert.match(goalRow, /task-due is-overdue/);
  assert.doesNotMatch(goalRow, /task-row|complete-control/, 'not a task: no swipe, no checkbox');
  const milestoneRow = ctx.deadlineRow({ goal, milestone: { id: 'm1', title: '10 km', date: TODAY } }, TODAY);
  assert.match(milestoneRow, /<span class="task-title">10 km<\/span><span class="task-meta">Milestone · Marathon<\/span>/);
  assert.match(milestoneRow, /task-due is-today/);
  assert.match(sr, /"Goal · \{percent\}%": "Cilj · \{percent\}%"/);
  assert.match(sr, /"Milestone · \{goal\}": "Etapa · \{goal\}"/);
});

function renderTodayWith(stateExtra = {}, stubs = {}) {
  const state = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {}, ...stateExtra });
  state.ui.todayExpanded = { overdue: false, today: false, habits: false };
  state.habitLogCache = stubs.logs || {};
  const ctx = todayContext(state, {
    pageHeader: (title, subtitle, options) => `<header title="${title}" eyebrow="${options.eyebrow}" add="${options.add}"></header>`,
    transferNotice: () => '<transfer>', backupReminderNotice: () => '<backup>', weeklyReviewNotice: () => '<review>',
    taskRow: (task, context, options) => `<task ${task.id} ${context}${options.today ? ' today' : ''}${options.draggable ? ' drag' : ''}>`,
    renderHabitTodayRow: (habit, status) => `<habit ${habit.id} ${status.status}>`,
    globalThis: { DailoPlatform: stubs.native ? { isNative: true } : undefined },
    Core: { ...Core, computeGoalProgress: () => ({ percent: 10 }) },
  });
  vm.runInContext(fn('renderToday'), ctx);
  return vm.runInContext('renderToday()', ctx);
}

test('T1, T6: the header, the notices and the sections in order with their counts', () => {
  const tasks = [
    { id: 'late', title: 'Late', dueDate: day(-1) },
    { id: 'plan', title: 'Plan', plannedDate: TODAY },
    { id: 'done', title: 'Done', isCompleted: true, completedAt: `${TODAY}T08:00:00` },
  ];
  const goals = [{ id: 'g', title: 'Goal', status: 'active', targetDate: TODAY, milestones: [{ id: 'm', title: 'Step', date: day(-3), isCompleted: false }] }];
  const habits = [
    { id: 'h1', name: 'Read', status: 'active', frequencyType: 'daily', startDate: day(-10) },
    { id: 'h2', name: 'Walk', status: 'active', frequencyType: 'daily', startDate: day(-10) },
  ];
  const html = renderTodayWith({ tasks, goals, habits }, { native: true, logs: { h1: [{ habitId: 'h1', date: TODAY, status: 'done' }] } });
  assert.match(html, new RegExp(`^<header title="Today" eyebrow="LONG\\(${TODAY}\\)" add="false"></header><transfer><backup><review>`));
  const order = [...html.matchAll(/data-today-section="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['overdue', 'today', 'habits', 'completed']);
  assert.match(html, /<h2 class="section-label danger">Past due<\/h2><span class="section-count">2<\/span>/);
  assert.match(html, /<task late today today><article class="today-row deadline-row" data-goal-id="g">.*Milestone · Goal/s, 'overdue: tasks, then goals and milestones');
  assert.match(html, /<h2 class="section-label">Planned today<\/h2><span class="section-count">2<\/span>/);
  assert.match(html, /<div class="task-list today-card" data-list-context="today"><task plan today today drag><article class="today-row deadline-row" data-goal-id="g">/);
  assert.match(html, /<h2 class="section-label">Habits<\/h2><span class="section-count">1\/2<\/span><\/div><div class="habit-list today-card"><habit h2 pending><habit h1 done>/, 'done habits move to the bottom');
  assert.match(html, /data-action="toggle-today-completed"/);
  assert.match(html, /data-action="quick-add" data-today="true"/, 'the inline add row stays');
  for (const gone of ['data-today-focus-strip', 'data-today-focus', 'data-daily-review', 'data-today-actions', 'dashboard-', 'data-today-filter', 'data-today-capacity', 'toggle-suggestions', 'open-focus']) assert.ok(!html.includes(gone), gone);
  assert.match(sr, /"Past due": "Zakasnelo"/);
  assert.match(sr, /"Planned today": "Planirano danas"/);
});

test('an empty Today keeps "Planirano danas" with its hint and no other section', () => {
  const html = renderTodayWith();
  assert.deepEqual([...html.matchAll(/data-today-section="([^"]+)"/g)].map(match => match[1]), ['today']);
  assert.match(html, /<p class="today-empty">Nothing planned\. “\+” adds a task for today\.<\/p>/);
  assert.match(sr, /"Nothing planned\. “\+” adds a task for today\.": "Ništa nije planirano\. „\+“ dodaje zadatak za danas\."/);
});

function habitCtx(extra = {}) {
  const calls = [];
  const ctx = {
    Core, esc: String, calls,
    state: { habitLogCache: {}, settings: {} },
    habitMetrics: () => ({ currentPeriodCount: 2, currentPeriodTarget: 4 }),
    getHabit: id => extra.habits?.find(habit => habit.id === id),
    setHabitLog: (...args) => { calls.push(['log', ...args]); return Promise.resolve(true); },
    openPopover: (anchor, html, meta) => calls.push(['popover', html, meta]),
    closePopover: () => calls.push(['close']),
    navigate: route => calls.push(['navigate', route]),
    openHabitValue: id => calls.push(['value', id]),
    closeModal: () => calls.push(['closeModal']),
    renderModal: () => calls.push(['renderModal']),
    ...extra,
  };
  return ctx;
}

test('T5, H6: compact habit rows with a round check, the week or the value on the right', () => {
  const module = moduleFor('js/habits-ui.js');
  const render = (habit, status) => module.renderRoute({ type: 'habit-today-row', habit, todayStatus: status }, habitCtx());
  const done = render({ id: 'h1', name: 'Read', trackingType: 'checkbox', frequencyType: 'daily' }, { status: 'done' });
  assert.match(done, /^<article class="today-row habit-today-row is-done" data-habit-id="h1">/);
  assert.match(done, /<button class="habit-check" type="button" data-action="habit-today-toggle" data-habit-id="h1" data-long-press="habit-today-menu" aria-pressed="true" aria-label="Read">/);
  assert.match(done, /habit-circle is-done/);
  assert.match(done, /<button class="today-row-main" type="button" data-action="habit-today-menu" data-habit-id="h1" aria-haspopup="dialog"><span class="task-title">Read<\/span><\/button>/);
  const skipped = render({ id: 'h2', name: 'Run', trackingType: 'checkbox', frequencyType: 'daily' }, { status: 'skipped' });
  assert.match(skipped, /is-skipped/);
  assert.match(skipped, /habit-circle is-skipped/);
  const weekly = render({ id: 'h3', name: 'Gym', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 4 }, { status: 'pending' });
  assert.match(weekly, /<span class="task-side habit-today-count">2\/4 weekly<\/span>/);
  assert.match(weekly, /stroke-dasharray="34\.6 69\.1"/, 'half the week');
  const numeric = render({ id: 'h4', name: 'Water', trackingType: 'numeric', targetValue: 2, unit: 'l', frequencyType: 'daily' }, { status: 'missed', value: 1.5 });
  assert.match(numeric, /<span class="task-side habit-today-count">1\.5 \/ 2 l<\/span>/);
  assert.match(numeric, /stroke-dasharray="51\.8 69\.1"/);
  assert.match(numeric, /aria-label="Enter value: Water"/);
  assert.doesNotMatch(numeric, /aria-pressed/);
  assert.match(sr, /"\{count\}\/\{target\} weekly": "\{count\}\/\{target\} nedeljno"/);
});

test('T5: a tap checks in, a long press or the name opens skip and details', async () => {
  const module = moduleFor('js/habits-ui.js');
  const habits = [{ id: 'h1', name: 'Read', status: 'active', trackingType: 'checkbox' }, { id: 'h2', name: 'Water', status: 'active', trackingType: 'numeric', targetValue: 2 }];
  const ctx = habitCtx({ habits });
  const target = dataset => ({ closest: () => ({ dataset }) });
  module.handleAction('habit-today-toggle', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.at(-1), ['log', 'h1', TODAY, 'done']);
  ctx.state.habitLogCache.h1 = [{ habitId: 'h1', date: TODAY, status: 'done' }];
  module.handleAction('habit-today-toggle', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.at(-1), ['log', 'h1', TODAY, 'missed']);
  ctx.state.habitLogCache.h1 = [{ habitId: 'h1', date: TODAY, status: 'skipped' }];
  module.handleAction('habit-today-toggle', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.at(-1), ['log', 'h1', TODAY, 'done'], 'a skipped day becomes done');
  module.handleAction('habit-today-toggle', { target: target({ habitId: 'h2' }) }, ctx);
  assert.deepEqual(ctx.calls.at(-1), ['value', 'h2'], 'numeric habits open the value sheet');

  module.handleAction('habit-today-menu', { target: target({ habitId: 'h1' }) }, ctx);
  const [, menu, meta] = ctx.calls.at(-1);
  assert.equal(meta.type, 'habit-today-menu');
  assert.match(menu, /data-pop-action="habit-today-skip" data-habit-id="h1">.*Undo skip/s, 'today is skipped');
  assert.match(menu, /data-pop-action="habit-today-details" data-habit-id="h1">.*Habit details/s);
  assert.doesNotMatch(menu, /habit-today-value/);
  module.handleAction('habit-today-menu', { target: target({ habitId: 'h2' }) }, ctx);
  assert.match(ctx.calls.at(-1)[1], /data-pop-action="habit-today-value" data-habit-id="h2">.*Enter value/s);
  assert.doesNotMatch(ctx.calls.at(-1)[1], /habit-today-skip/, 'a numeric day cannot be skipped');

  module.handleAction('habit-today-skip', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['log', 'h1', TODAY, 'missed']], 'undo skip');
  ctx.state.habitLogCache.h1 = [];
  module.handleAction('habit-today-skip', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.at(-1), ['log', 'h1', TODAY, 'skipped']);
  // R8c: "Detalji navike" opens the details window instead of the habit page.
  ctx.openHabitDetails = id => ctx.calls.push(['details', id]);
  module.handleAction('habit-today-details', { target: target({ habitId: 'h1' }) }, ctx);
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['details', 'h1']]);
  module.handleAction('habit-today-value', { target: target({ habitId: 'h2' }) }, ctx);
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['value', 'h2']]);
  for (const [key, value] of [['Habit details', 'Detalji navike'], ['Undo skip', 'Poništi preskakanje'], ['Enter value', 'Upiši vrednost']]) assert.match(sr, new RegExp(`"${key}": "${value}"`));
});

test('H6: the value sheet has the quick values, the total and "Primeni"', async () => {
  const module = moduleFor('js/habits-ui.js');
  const habits = [{ id: 'h2', name: 'Water', status: 'active', trackingType: 'numeric', targetValue: 2, unit: 'l', quickValues: [0.25, 0.5] }];
  const ctx = habitCtx({ habits, modalState: { type: 'habit-value', habitId: 'h2', date: TODAY, total: 1.5 }, modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`, $: () => ({ value: '1.75' }) });
  const html = module.renderRoute({ type: 'modal', modalType: 'habit-value' }, ctx);
  assert.match(html, /^<frame habit-value-modal>/);
  assert.match(html, /<h2 class="modal-title">Water<\/h2>/);
  assert.match(html, /<strong class="habit-value-total">1\.5<\/strong> \/ 2 l/);
  assert.match(html, /<button class="quick-chip" type="button" data-action="habit-value-add" data-value="0\.25">\+0\.25 l<\/button><button class="quick-chip" type="button" data-action="habit-value-add" data-value="0\.5">\+0\.5 l<\/button>/);
  assert.match(html, /<input id="habit-value-total" class="input" type="number" min="0" step="any" value="1\.5"/);
  assert.match(html, /data-action="habit-value-apply"[^>]*>Apply<\/button>/);
  module.handleAction('habit-value-add', { target: { closest: () => ({ dataset: { value: '0.25' } }) } }, ctx);
  assert.equal(ctx.modalState.total, 1.75);
  assert.deepEqual(ctx.calls.at(-1), ['renderModal']);
  module.handleAction('habit-value-apply', { target: { closest: () => ({ dataset: {} }) } }, ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ctx.calls.slice(-2), [['log', 'h2', TODAY, 'done', 1.75], ['closeModal']]);
  // R8a: the sheet takes the day (today by default) so the Habits screen can fix a past day.
  assert.match(fn('openHabitValue'), /modalState = \{ type: 'habit-value', habitId, date, total: Number\(existing\?\.value \|\| 0\) \}/);
  assert.match(fn('openHabitValue'), /function openHabitValue\(habitId, date = Core\.dateOnly\(\)\)/);
});

test('a long press runs the element\'s long-press action once and swallows the click that follows', () => {
  const calls = []; const timers = [];
  const el = { dataset: { longPress: 'habit-today-menu' } };
  const ctx = {
    calls, setTimeout: (callback, ms) => { timers.push([callback, ms]); return timers.length; }, clearTimeout: () => {},
    callDomainHook: (...args) => calls.push(args),
  };
  vm.createContext(ctx);
  vm.runInContext(`let longPressTimer = null, longPressFired = false;\n${fn('handleLongPressStart')}${fn('cancelLongPress')}${fn('handleLongPressClick')}`, ctx);
  ctx.handleLongPressStart({ isPrimary: true, button: 0, target: { closest: () => el } });
  assert.equal(timers[0][1], 500);
  timers[0][0]();
  assert.deepEqual(calls[0].slice(0, 2), ['handleAction', 'habit-today-menu']);
  let stopped = false;
  ctx.handleLongPressClick({ preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  stopped = false;
  ctx.handleLongPressClick({ preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, false, 'only the one click');
  const attach = fn('attachEvents');
  for (const line of ["document.addEventListener('pointerdown', handleLongPressStart);", "document.addEventListener('pointerup', cancelLongPress);", "document.addEventListener('pointercancel', cancelLongPress);", "document.addEventListener('click', handleLongPressClick, true);"]) assert.ok(attach.includes(line), line);
  assert.match(attach, /document\.addEventListener\('contextmenu', event => \{ if \(event\.target\.closest\?\.\('\[data-long-press\]'\)\) event\.preventDefault\(\); \}\);/);
});

test('Z2 early: the suggestions card is at the top of Zadaci with "+ Danas" and "Dodaj sve u Danas"', () => {
  const screen = fn('renderTasksScreen');
  // Redesign R5 (S10): the suggestions come from listTasks (no archived projects).
  assert.match(screen, /const suggestions = Core\.deriveTodaySections\(tasks, Core\.dateOnly\(\)\)\.suggestions;/);
  assert.match(screen, /<section class="tasks-suggestions" data-tasks-suggestions>/);
  assert.match(screen, /data-action="toggle-suggestions" aria-expanded="\$\{open\}"/);
  assert.match(screen, /taskRow\(item\.task, 'suggestion', \{ today: true, addToday: true, suggestionReason: item\.reason \}\)/);
  assert.match(screen, /data-action="add-all-suggestions"/);
  assert.ok(screen.indexOf('data-tasks-suggestions') < screen.indexOf('tasks-view-switch'), 'above the switch');
});

test('T2, M3, M6: the removed cards, capacity item and Today settings are gone; stored values stay', () => {
  for (const gone of ['function todayCapacityItem(', "data-today-focus-strip", 'data-daily-review', 'data-today-actions', "event.target.matches('[data-today-filter]')"]) assert.ok(!app.includes(gone), gone);
  const settings = read('js/settings-ui.js');
  for (const gone of ['preference-today-filter', 'data-preference-today-section', 'preference-focus-strip']) assert.ok(!settings.includes(gone), gone);
  const save = fn('savePersonalization');
  assert.doesNotMatch(save, /todayFocusFilter|todayVisibleSections|todayFocusStrip/, 'stored values are not reset');
  const normalized = Core.normalizeV16Settings({ todayFocusFilter: 'open', todayFocusStrip: false, todayVisibleSections: ['focus'] });
  assert.equal(normalized.todayFocusFilter, 'open');
});

test('R2 shipped as 2.0.0-alpha.7 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.([7-9]|\d{2,})$|^2\.\d+\.\d+/);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
