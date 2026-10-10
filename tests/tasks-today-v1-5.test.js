const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const Core = require('../js/core.js');

function taskState(tasks, focusTaskIds = []) {
  return { version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { focusTaskIds }, ui: {} };
}

test('load/save normalizes focus IDs to three existing open tasks in requested order', () => {
  const tasks = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id }));
  tasks.push({ id: 'done', title: 'Done', isCompleted: true });
  const state = taskState(tasks, ['gone', 'done', 'a', 'a', 'b', 'c', 'd']);
  assert.deepEqual(Core.normalizeState(state).settings.focusTaskIds, ['a', 'b', 'c']);
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const save = source.slice(source.indexOf('  function saveState()'), source.indexOf('  function saveAndRender()'));
  let persisted;
  const context = { state, Core, globalOperation: null, STORAGE_KEY: 'state', reportStorageFailure: error => { throw error; },
    localStorage: { setItem(key, value) { persisted = JSON.parse(value); } }, scheduleAutomaticSnapshot() {}, scheduleSync() {} };
  vm.createContext(withI18n(context));
  assert.equal(vm.runInContext(`${save}\nsaveState()`, context), true);
  assert.deepEqual(persisted.settings.focusTaskIds, ['a', 'b', 'c']);
  assert.deepEqual(Array.from(state.settings.focusTaskIds), ['a', 'b', 'c']);
  tasks[0].isCompleted = true;
  vm.runInContext('saveState()', context);
  assert.deepEqual(persisted.settings.focusTaskIds, ['b', 'c']);
});

test('Add another retains implicit Today and resets explicit times before parsing the second task', () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const create = source.slice(source.indexOf('  function createTask('), source.indexOf('  function syncQuickDraftFromDom()'));
  const parse = source.slice(source.indexOf('  function parseQuickAddTitle('), source.indexOf('  function nextOrder('));
  // Redesign R4: createTask files the task through quickPlace.
  const place = source.slice(source.indexOf('  function quickPlace('), source.indexOf('  // S7: the "Iz šablona" chip'));
  const today = Core.dateOnly();
  const defaults = { projectId: null, areaId: null, plannedDate: today, explicitPlan: false };
  const context = { Core, state: taskState([]), modalState: { type: 'quick', defaults,
    draft: { title: 'First today 09:30', explicitPlan: false, plannedDate: today, plannedTime: '14:00', dueTime: '15:00', explicitPlannedTime: true, subtasks: [] } },
    syncQuickDraftFromDom() {}, uid: () => 'task', nowIso: () => new Date().toISOString(), nextOrder: () => 0,
    saveState() {}, closeModal() {}, render() {}, renderModal() {}, requestAnimationFrame() {}, $() {}, getProject: () => null };
  vm.createContext(withI18n(context));
  vm.runInContext(`${parse}\n${place}\n${create}\ncreateTask(true)`, context);
  assert.equal(context.modalState.draft.explicitPlan, false);
  assert.equal(context.modalState.draft.plannedTime, null);
  assert.equal(context.modalState.draft.dueTime, null);
  assert.equal(context.modalState.draft.explicitPlannedTime, false);
  context.modalState.draft.title = 'Second tomorrow 09:30';
  vm.runInContext('createTask(false)', context);
  assert.equal(context.state.tasks[1].title, 'Second');
  assert.equal(context.state.tasks[1].plannedDate, Core.addDays(today, 1));
  assert.equal(context.state.tasks[1].plannedTime, '09:30');
  assert.equal(context.state.tasks[1].dueTime, null);
  context.modalState = { type: 'quick', defaults: { ...defaults, explicitPlan: true }, draft: { title: 'Explicit', explicitPlan: true, plannedDate: today, subtasks: [] } };
  vm.runInContext('createTask(true)', context);
  assert.equal(context.modalState.draft.explicitPlan, true);
});

test('Task module renders duration, daily focus controls and inline Today completion', () => {
  let module;
  runInNewContextWithI18n(fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8'), {
    window: { TodoDomainModules: { register(value) { module = value; } } },
  });
  const task = { id: 'a', title: 'Read', durationMinutes: 30, tagIds: [] };
  const html = module.renderTaskRow(task, 'today', {}, {
    Core, esc: String, getProject: () => null, state: { settings: { focusTaskIds: ['a'] } },
  });
  assert.match(html, /30 min/);
  assert.match(html, /data-inline-today-complete/);
  assert.match(html, /data-action="toggle-focus-task"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-action="task-plan-picker"/);
});

// Redesign R2 (T2, T2a) replaced the Focus and Daily Review cards: "Planirano danas" keeps the user's order
// and its count, and "Završeno" counts what was finished today.
test('Today lists planned tasks in their order with counts instead of the Focus and Daily Review cards', () => {
  const today = Core.dateOnly();
  const tasks = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, title: id, plannedDate: today, todayOrder: 3 - index }));
  tasks.push({ id: 'done', title: 'Done', isCompleted: true, completedAt: `${today}T12:00:00` });
  const state = Core.normalizeState({ version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { focusTaskIds: ['a', 'b', 'c', 'd'] }, ui: {} });
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const fn = name => { const start = source.indexOf(`  function ${name}(`); return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
  const context = { state, Core, esc: String, formatDate: String, formatPageToday: String,
    pageHeader: () => '', backupReminderNotice: () => '', weeklyReviewNotice: () => '', callDomainHook: () => '' /* R12c: journal notice */, renderHabitTodayRow: () => '', taskRow: (task, view) => `<article data-view="${view}">${task.id}</article>` };
  vm.createContext(withI18n(context));
  vm.runInContext(`const TODAY_LIMITS = { overdue: 3, today: 5, habits: 5 };\n${fn('todayLimited')}${fn('todayDueLabel')}${fn('deadlineRow')}${fn('listTasks')}${fn('renderToday')}`, context);
  const html = vm.runInContext('renderToday()', context);
  assert.deepEqual([...html.matchAll(/<article data-view="today">(\w+)</g)].map(match => match[1]), ['d', 'c', 'b', 'a']);
  assert.match(html, /Planned today<\/h2><span class="section-count">4<\/span>/);
  assert.match(html, /Completed<\/span><span>1 /);
  assert.doesNotMatch(html, /data-view="focus"|data-daily-review/);
});