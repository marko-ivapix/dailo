// R79: a task notification gets a third button, "Sutra". It plans the task for tomorrow, like the plan picker, and its
// own reminder moves to the same time tomorrow, with Undo. A repeating task asks "this or future" as the swipe does.
// Spec: docs/superpowers/specs/2026-10-15-r79-notification-tomorrow.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;

function harness(tasks) {
  const calls = [];
  const ctx = withI18n({
    state: { tasks }, globalOperation: null, recovery: null, modalState: null,
    getTask: id => tasks.find(task => task.id === id), getHabit: () => null, getGoal: () => null,
    Core: { ...Core, dateOnly: () => '2026-10-11' }, Date, Math, String,
    taskRecurrence: task => task.recurrence || null, moveTaskToTomorrow: id => calls.push(['tomorrow-repeat', id]),
    toggleComplete: id => calls.push(['complete', id]), setHabitLog: () => {},
    saveState: () => { calls.push(['save']); return true; }, render: () => calls.push(['render']), setToastMessage: text => calls.push(['toast', text]),
    setUndo: (message, undo) => { calls.push(['undo', message]); ctx.undo = undo; },
    formatReminder: value => value, openTaskDetail: () => {}, navigate: () => {},
    nowIso: () => '2026-10-11T08:00:00.000Z', flushTextSave: () => calls.push(['flush']), closeModal: () => calls.push(['close']),
  });
  vm.createContext(ctx);
  vm.runInContext(`${fn('openNotificationTarget')}\n${fn('runNotificationAction')}\n${fn('planTaskForTomorrowFromNotification')}`, ctx);
  return { ctx, calls };
}

test('task notifications carry Završi, Odloži 1 sat and Sutra', () => {
  assert.match(fn('notificationActionTypes'), /\{ id: 'dailo-task', actions: \[\{ id: 'complete', title: tr\('Complete'\), foreground: true \}, \{ id: 'snooze', title: tr\('Snooze 1 hour'\), foreground: true \}, \{ id: 'tomorrow', title: tr\('Tomorrow'\), foreground: true \}\] \}/);
  assert.ok(read('js/i18n-sr.js').includes('"Tomorrow": "Sutra"'));
});

test('"Sutra" plans the task for tomorrow and moves its reminder to the same time, with Undo', () => {
  const tasks = [{ id: 't1', title: 'Pay', isCompleted: false, isInbox: true, plannedDate: '2026-10-11', todayOrder: 3, reminderAt: '2026-10-11T08:30:00', reminderFiredAt: '2026-10-11T06:30:00.000Z', updatedAt: 'old' }];
  const { ctx, calls } = harness(tasks);
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'tomorrow' });
  assert.deepEqual([tasks[0].plannedDate, tasks[0].reminderAt, tasks[0].isInbox, tasks[0].todayOrder], ['2026-10-12', '2026-10-12T08:30:00', false, null]);
  assert.deepEqual(calls.map(call => call[0]), ['save', 'render', 'undo']);
  assert.equal(calls.at(-1)[1], 'Task moved to Tomorrow');
  ctx.undo();
  assert.deepEqual([tasks[0].plannedDate, tasks[0].reminderAt, tasks[0].isInbox, tasks[0].todayOrder], ['2026-10-11', '2026-10-11T08:30:00', true, 3]);
});

test('a task without its own reminder only moves; a done task stays; a repeating one asks as the swipe does', () => {
  const tasks = [
    { id: 'plain', isCompleted: false, plannedDate: '2026-10-11', plannedTime: '09:00', reminderAt: null },
    { id: 'done', isCompleted: true, plannedDate: '2026-10-11', reminderAt: null },
    { id: 'repeat', isCompleted: false, plannedDate: '2026-10-11', reminderAt: '2026-10-11T08:00:00', recurrence: { frequency: 'daily' } },
  ];
  const { ctx, calls } = harness(tasks);
  ctx.openNotificationTarget({ route: 'task/plain', actionId: 'tomorrow' });
  assert.deepEqual([tasks[0].plannedDate, tasks[0].plannedTime, tasks[0].reminderAt], ['2026-10-12', '09:00', null], 'its planned-time reminder follows the day');
  ctx.openNotificationTarget({ route: 'task/done', actionId: 'tomorrow' });
  assert.equal(tasks[1].plannedDate, '2026-10-11');
  ctx.openNotificationTarget({ route: 'task/repeat', actionId: 'tomorrow' });
  assert.deepEqual(calls.at(-1), ['tomorrow-repeat', 'repeat']);
});

test('the task\'s open window is saved and closed first', () => {
  const tasks = [{ id: 't1', isCompleted: false, plannedDate: '2026-10-11', reminderAt: null }];
  const { ctx, calls } = harness(tasks);
  ctx.modalState = { type: 'task', taskId: 't1' };
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'tomorrow' });
  assert.deepEqual(calls.slice(0, 2), [['flush'], ['close']]);
});

test('R79 shipped as 2.0.0-alpha.106 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 106) >= 106);
});
