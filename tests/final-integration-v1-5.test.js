const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Core = global.TodoCore = require('../js/core.js');
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const clean = value => JSON.parse(JSON.stringify(value));
function functions(source, names) {
  return names.map(name => {
    const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
    assert.notEqual(start, -1, `missing ${name}`);
    const rest = source.slice(start + 1);
    const end = rest.search(/\n  (?:(?:async )?function |window\.TodoApp)/);
    return source.slice(start, end < 0 ? undefined : start + 1 + end);
  }).join('\n');
}
function state() { return Core.normalizeState({ version: 3, tasks: [], projects: [], areas: [], goals: [], habits: [], tags: [], templates: [], savedViews: [], notes: [], resources: [], settings: {}, ui: {} }); }

// Redesign R2 (T2): the Today dashboard cards and their order, pin and "Focus View" controls are gone. A stored
// "Focus View" must not hide the new sections, so nothing on Today reads the dashboard settings any more; the
// settings themselves stay normalized for older backups.
test('Today no longer applies the dashboard layout; its stored settings stay valid', () => {
  assert.doesNotMatch(app, /applyTodayDashboard|today-focus-view|dashboard-move|dashboard-pin|dashboard-focus-toggle/);
  const dashboard = state().settings.dashboard;
  assert.ok(dashboard && typeof dashboard === 'object');
});

test('Calendar Week and Day Detail honor hidden Tasks and retain combined planned/due metadata', () => {
  const source = fs.readFileSync(require.resolve('../js/calendar-ui.js'), 'utf8');
  const ctx = { state: state(), Core, calendarDate: () => '2026-09-17', calendarLogs: () => [], parseLocalDate: value => new Date(`${value}T12:00:00`), formatDate: String, esc: String, pageHeader: () => '', modalFrame: value => value, modalState: { date: '2026-09-17' } };
  ctx.state.tasks = [{ id: 'timed', title: 'Visible timed Task', plannedDate: '2026-09-17', dueDate: '2026-09-17', plannedTime: '09:00', dueTime: '11:00', durationMinutes: 45 }];
  const sandbox = { ctx }; vm.createContext(withI18n(sandbox));
  vm.runInContext(functions(source, ['minutesLabel', 'calendarItem', 'timedEntries', 'calendarCounts', 'calendarCountTotal', 'renderCalendar', 'renderCalendarDetail']), sandbox);
  for (const render of ['renderCalendar', 'renderCalendarDetail']) {
    ctx.state.ui.calendarVisibility = { tasks: false };
    const hidden = vm.runInContext(`${render}(ctx)`, sandbox);
    assert.doesNotMatch(hidden, /Visible timed Task|calendar-timed-block|Time overlap/);
    ctx.state.ui.calendarVisibility.tasks = true;
    const shown = vm.runInContext(`${render}(ctx)`, sandbox);
    assert.match(shown, /09:00–09:45/); assert.match(shown, /Plan · 09:00/); assert.match(shown, /Due · 11:00/);
  }
});

function scheduler() {
  let date = '2026-09-17', index = 0;
  const ctx = { state: state(), Core: { ...Core, dateOnly: () => date }, uid: kind => `${kind}-${++index}`, nowIso: () => `${date}T12:00:00Z`, nextOrder: () => 0,
    globalOperation: null, recovery: null, startupPromise: null, structuredClone, copyTemplate: clean, modalState: {}, saveState: () => true, closeModal() {}, render() {},
    lastToday: date, attachEvents() {}, restoreDurableMirror: async () => false, startReady: async () => {}, scheduleAutomaticSnapshot() {}, startSync() {}, updateStoragePersistence: async () => ({ state: 'unsupported' }), registerServiceWorker() {}, startPlatform() {}, location: { hash: '#today' }, checkReminders() {}, refreshHabitDateBoundary: async () => {}, console,
    setInterval: callback => { ctx.tick = callback; }, getGoal: id => ctx.state.goals.find(goal => goal.id === id) };
  vm.createContext(withI18n(ctx)); vm.runInContext(functions(app, ['runScheduledTaskTemplates', 'syncTemplateEntityGoalLinks', 'saveTemplateRecord', 'checkDateAndReminders', 'init']), ctx);
  return { ctx, date: value => { date = value; } };
}
const schedule = date => ({ id: 'template', name: 'Scheduled', type: 'task', data: { title: 'Work {{date}}', goalIds: ['goal'], plannedOffsetDays: 0, scheduleEnabled: true, scheduleDate: date } });

test('Scheduled Tasks join reciprocal Goal contribution and remain idempotent', () => {
  const { ctx } = scheduler(); ctx.state.goals = [{ id: 'goal', title: 'Goal', taskIds: [], progressMode: 'linkedTasks' }]; ctx.state.templates = [schedule('2026-09-17')];
  assert.equal(ctx.runScheduledTaskTemplates(), 1);
  assert.deepEqual(clean(ctx.state.goals[0].taskIds), [ctx.state.tasks[0].id]);
  ctx.state.tasks[0].isCompleted = true;
  assert.equal(Core.computeGoalProgress(ctx.state.goals[0], ctx.state).percent, 100);
  assert.equal(ctx.runScheduledTaskTemplates(), 0);
  ctx.state = clean(ctx.state); assert.equal(ctx.runScheduledTaskTemplates(), 0, 'persisted marker survives reload');
});

test('Scheduler runs after due template save and date-boundary tick, catching up once', async () => {
  const { ctx, date } = scheduler(); ctx.state.goals = [{ id: 'goal', title: 'Goal', taskIds: [] }];
  ctx.saveTemplateRecord(null, schedule('2026-09-17'));
  assert.equal(ctx.state.tasks.length, 1, 'due schedule runs on save');
  ctx.state.templates.push({ ...schedule('2026-09-18'), id: 'tomorrow' });
  await ctx.init(); date('2026-09-20'); ctx.tick();
  assert.equal(ctx.state.tasks.length, 2, 'missed date catches up on next tick');
  assert.equal(ctx.state.tasks[1].title, 'Work 2026-09-18', 'offsets and variables stay anchored to scheduled day');
  assert.equal(ctx.state.tasks[1].plannedDate, '2026-09-18');
  assert.equal(ctx.state.templates[1].data.scheduleGeneratedOn, '2026-09-18');
  ctx.tick(); date('2026-09-21'); ctx.tick(); assert.equal(ctx.state.tasks.length, 2);
});

test('Scheduler does not mutate during recovery and retries a failed save without duplicates', () => {
  const { ctx } = scheduler(); ctx.state.templates = [schedule('2026-09-17')];
  ctx.globalOperation = {}; assert.equal(ctx.runScheduledTaskTemplates(), 0); assert.equal(ctx.state.tasks.length, 0);
  ctx.globalOperation = null; ctx.recovery = 'migration-loading'; assert.equal(ctx.runScheduledTaskTemplates(), 0);
  ctx.recovery = null; ctx.startupPromise = Promise.resolve(); assert.equal(ctx.runScheduledTaskTemplates(), 0); ctx.startupPromise = null;
  ctx.recovery = null; ctx.saveState = () => false; assert.equal(ctx.runScheduledTaskTemplates(), 0);
  assert.equal(ctx.state.tasks.length, 0); assert.ok(!ctx.state.templates[0].data.scheduleGeneratedOn);
  ctx.saveState = () => true; assert.equal(ctx.runScheduledTaskTemplates(), 1); assert.equal(ctx.runScheduledTaskTemplates(), 0);
});

test('Selective Goal restore reconciles all owner memberships while preserving unrelated fields', () => {
  const saved = state(); saved.goals = [{ id: 'g', title: 'Saved', taskIds: ['added-t'], projectLinks: [{ projectId: 'added-p', contributionMode: 'allTasks', selectedTaskIds: [] }], habitLinks: [{ habitId: 'added-h', metric: 'totalCheckins', target: 2 }] }, { id: 'other', title: 'Other' }];
  for (const [collection, suffix] of [['tasks', 't'], ['projects', 'p'], ['habits', 'h']]) saved[collection] = ['added', 'removed'].map(kind => ({ id: `${kind}-${suffix}`, name: kind, title: kind, goalIds: kind === 'added' ? ['other', 'g'] : ['other'] }));
  const source = Core.normalizeState(saved), current = structuredClone(source);
  current.goals[0].taskIds = ['removed-t']; current.goals[0].projectLinks = [{ projectId: 'removed-p', contributionMode: 'allTasks', selectedTaskIds: [] }]; current.goals[0].habitLinks = [{ habitId: 'removed-h', metric: 'totalCheckins', target: 3 }];
  for (const collection of ['tasks', 'projects', 'habits']) for (const item of current[collection]) { item.goalIds = item.id.startsWith('removed') ? ['other', 'g'] : ['other']; item.title = 'Keep current title'; }
  const candidate = Backup.prepareSelectiveRestore({ state: current, attachmentRecords: [], habitLogs: [], goalHistory: [] }, { appData: source, attachments: [], habitLogs: [], goalHistory: [] }, 'goals', 'g');
  for (const collection of ['tasks', 'projects', 'habits']) for (let index = 0; index < 2; index++) {
    assert.deepEqual(candidate.state[collection][index], { ...current[collection][index], goalIds: index === 0 ? ['other', 'g'] : ['other'] });
  }
  assert.deepEqual(candidate.state.goals[0], source.goals[0]);
});

test('V1.5 template settings survive snapshot, ZIP, instantiation and Habit creation draft without history', async () => {
  await Storage.clearAllForTests(); const s = state();
  const task = { id: 'old-task', title: 'Timed', durationMinutes: 45, projectId: 'old-project', isCompleted: true, attachmentIds: ['old-file'] };
  const habit = { id: 'old-habit', name: 'Drink', trackingType: 'numeric', targetValue: 1, minimumTarget: 0.5, idealTarget: 1.5, graceDays: 2, status: 'archived', pauseIntervals: [{ start: '2026-09-01' }], reminderFiredMoments: ['old'] };
  s.templates = [Core.templateFromEntity('task', task), Core.templateFromEntity('habit', habit), Core.templateFromEntity('project', { id: 'old-project', name: 'Project' }, { tasks: [task] })].map((item, i) => ({ ...item, id: `tpl-${i}`, name: `Template ${i}` }));
  assert.equal(s.templates[0].data.durationMinutes, 45); assert.equal(s.templates[1].data.minimumTarget, 0.5);
  const restored = await Backup.inspectBackupV3(await Backup.exportBackupV3(s, Storage, '2026-09-17T12:00:00Z'));
  let index = 0; const instances = restored.state.templates.map(template => Core.instantiateTemplate(template, '2026-09-17', { state: s, makeId: kind => `${kind}-${++index}` }));
  assert.equal(instances[0].task.durationMinutes, 45); assert.equal(instances[2].tasks[0].durationMinutes, 45);
  assert.equal(instances[0].task.isCompleted, false); assert.deepEqual(instances[0].task.attachmentIds, []); assert.notEqual(instances[0].task.id, task.id);
  const ctx = { Core }; vm.createContext(withI18n(ctx)); vm.runInContext(functions(app, ['habitDraft']), ctx);
  const draft = ctx.habitDraft(instances[1].habit);
  for (const key of ['minimumTarget', 'idealTarget', 'graceDays']) assert.equal(draft[key], habit[key]);
  assert.equal(instances[1].habit.status, 'active'); assert.deepEqual(instances[1].habit.pauseIntervals, []); assert.deepEqual(instances[1].habit.reminderFiredMoments, []);
});

test('Template UI and backup validation enforce duration and fractional-versus-count Habit targets', () => {
  const source = fs.readFileSync(require.resolve('../js/templates-ui.js'), 'utf8');
  const ctx = {}; vm.createContext(withI18n(ctx)); vm.runInContext(functions(source, ['templateDataProblem']), ctx);
  for (const [type, data, field] of [['task', { title: 'Task', durationMinutes: -1 }, 'duration'], ['task', { title: 'Task', durationMinutes: 0.5 }, 'duration'], ['habit', { name: 'Habit', trackingType: 'checkbox', minimumTarget: 0.5 }, 'target'], ['habit', { name: 'Habit', trackingType: 'numeric', frequencyType: 'timesPerWeek', minimumTarget: 0.5 }, 'target'], ['habit', { name: 'Habit', idealTarget: 1, minimumTarget: 2 }, 'target'], ['habit', { name: 'Habit', graceDays: -1 }, 'grace']]) {
    assert.match(ctx.templateDataProblem(type, data), new RegExp(field, 'i'));
    const s = state(); s.templates = [{ id: 'bad', name: 'Bad', type, data }];
    assert.throws(() => Backup.validateDomain(s, [], []), new RegExp(field, 'i'));
  }
  assert.equal(ctx.templateDataProblem('habit', { trackingType: 'numeric', targetValue: 1, minimumTarget: 0.5, idealTarget: 1.5, graceDays: 0 }), null);
  assert.match(source, /field\('durationMinutes'/); assert.match(source, /field\('minimumTarget'/); assert.match(source, /field\('idealTarget'/); assert.match(source, /field\('graceDays'/);
});
