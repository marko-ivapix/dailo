// Redesign R23: buttons on phone notifications (Završi, Odloži 1 h, Zabeleži) and haptic feedback (additions A, F).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r23-notification-actions.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const FUTURE = '2099-01-01T08:00:00.000Z';

function nativePlatform({ haptics = true, kind = 'android' } = {}) {
  const calls = [];
  const listeners = {};
  const ln = {
    checkPermissions: async () => ({ display: 'granted' }),
    checkExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
    getPending: async () => ({ notifications: [] }),
    cancel: async () => {},
    schedule: async options => { calls.push(['schedule', options.notifications]); },
    registerActionTypes: async options => { calls.push(['types', options.types]); },
    addListener: (name, listener) => { (listeners[name] ||= []).push(listener); return Promise.resolve({ remove() {} }); },
  };
  const hap = { impact: async options => { calls.push(['impact', options]); }, notification: async options => { calls.push(['notification', options]); } };
  const plugins = { LocalNotifications: ln, ...(haptics ? { Haptics: hap } : {}) };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => kind, registerPlugin: name => plugins[name] || {} }, console });
  return { platform, calls, listeners };
}

test('A: the platform registers the action types and schedules task and habit reminders with them', async () => {
  const { platform, calls } = nativePlatform();
  const types = [{ id: 'dailo-task', actions: [{ id: 'complete', title: 'Završi' }] }];
  assert.equal(await platform.notifications.setActionTypes(types), true);
  assert.deepEqual(calls.at(-1), ['types', types]);
  await platform.notifications.reconcile([{ key: 'task:t:1', at: FUTURE, title: 'Pay', body: '', route: 'task/t', actionType: 'dailo-task' }, { key: 'goal:g:1', at: FUTURE, title: 'Run', body: '', route: 'goal/g' }]);
  const [task, goal] = calls.find(call => call[0] === 'schedule')[1];
  assert.equal(task.actionTypeId, 'dailo-task');
  assert.equal(goal.actionTypeId, undefined, 'a goal reminder has no buttons');
  assert.equal(await Platform.notifications.setActionTypes(types), false, 'the web has no notification buttons');
});

test('A: a notification that was scheduled without buttons is scheduled again with them', async () => {
  const source = read('js/platform.js');
  assert.match(source, /sig: notificationId\(`\$\{item\.title\}\\u0000\$\{item\.body\}\\u0000\$\{item\.at\}\\u0000\$\{item\.route\}\\u0000\$\{exact\}\\u0000\$\{item\.actionType \|\| ''\}`\)\.toString\(36\)/);
});

test('A: the tap handler hears which button was pressed', () => {
  const { platform, listeners } = nativePlatform();
  const seen = [];
  platform.notifications.onOpen(extra => seen.push(extra));
  listeners.localNotificationActionPerformed[0]({ actionId: 'complete', notification: { extra: { route: 'task/t1', key: 'k' } } });
  assert.deepEqual(seen, [{ route: 'task/t1', key: 'k', actionId: 'complete' }]);
});

test('A: the app names the buttons in Serbian and gives tasks and habits their buttons', () => {
  assert.match(fn('notificationActionTypes'), /\{ id: 'dailo-task', actions: \[\{ id: 'complete', title: tr\('Complete'\), foreground: true \}, \{ id: 'snooze', title: tr\('Snooze 1 hour'\), foreground: true \}\] \}/);
  assert.match(fn('notificationActionTypes'), /\{ id: 'dailo-habit', actions: \[\{ id: 'checkin', title: tr\('Check in'\), foreground: true \}\] \}/);
  assert.match(fn('startPlatform'), /platform\.notifications\.setActionTypes\?\.\(notificationActionTypes\(\)\);/);
  assert.match(fn('reconcileNotifications'), /actionType: item\.kind === 'task' \? 'dailo-task' : item\.kind === 'habit' \? 'dailo-habit' : undefined/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Complete', 'Završi'], ['Snooze 1 hour', 'Odloži 1 sat'], ['Check in', 'Zabeleži']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

function actionHarness() {
  const calls = [];
  const tasks = [{ id: 't1', title: 'Pay', isCompleted: false, reminderAt: '2026-10-11T08:00:00.000Z' }];
  const habits = [{ id: 'h1', name: 'Walk', trackingType: 'checkbox' }, { id: 'h2', name: 'Water', trackingType: 'numeric', targetValue: 2 }];
  const ctx = withI18n({
    state: { tasks, habits }, globalOperation: null, recovery: null, modalState: null,
    getTask: id => tasks.find(task => task.id === id), getHabit: id => habits.find(habit => habit.id === id), getGoal: () => null,
    Core: { dateOnly: () => '2026-10-11' }, Date, Math,
    toggleComplete: id => calls.push(['complete', id]), setHabitLog: (...args) => calls.push(['log', ...args]),
    saveState: () => { calls.push(['save']); return true; }, render: () => calls.push(['render']), setToastMessage: text => calls.push(['toast', text]),
    formatReminder: value => `F(${value})`, openTaskDetail: id => calls.push(['open', id]), navigate: route => calls.push(['navigate', route]),
    nowIso: () => '2026-10-11T08:00:00.000Z', flushTextSave: () => calls.push(['flush']), closeModal: () => calls.push(['close']),
  });
  vm.createContext(ctx);
  vm.runInContext(`${fn('openNotificationTarget')}\n${fn('runNotificationAction')}`, ctx);
  return { ctx, calls, tasks };
}

test('A: "Završi" completes the task, "Odloži 1 h" moves its reminder, "Zabeleži" checks the habit in', () => {
  const { ctx, calls, tasks } = actionHarness();
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'complete' });
  assert.deepEqual(calls.at(-1), ['complete', 't1']);
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'snooze' });
  assert.equal(tasks[0].reminderAt, '2026-10-11T09:00:00.000Z');
  assert.deepEqual(calls.slice(-3).map(call => call[0]), ['save', 'render', 'toast']);
  ctx.openNotificationTarget({ route: 'habit/h1', actionId: 'checkin' });
  assert.deepEqual(calls.at(-1), ['log', 'h1', '2026-10-11', 'done', null]);
  ctx.openNotificationTarget({ route: 'habit/h2', actionId: 'checkin' });
  assert.deepEqual(calls.at(-1), ['log', 'h2', '2026-10-11', 'done', 2], 'a numeric habit reaches its target');
  ctx.openNotificationTarget({ route: 'task/t1' });
  assert.deepEqual(calls.at(-1), ['open', 't1'], 'a plain tap still opens the task');
});

test('A: a done task is not completed again, and the task\'s open window is closed before it is completed', () => {
  const { ctx, calls, tasks } = actionHarness();
  tasks[0].isCompleted = true;
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'complete' });
  assert.equal(calls.filter(call => call[0] === 'complete').length, 0);
  tasks[0].isCompleted = false;
  ctx.modalState = { type: 'task', taskId: 't1' };
  ctx.openNotificationTarget({ route: 'task/t1', actionId: 'complete' });
  assert.deepEqual(calls.slice(-3), [['flush'], ['close'], ['complete', 't1']]);
});

test('F: haptics — the plugin in the app, a short vibration in a browser, nothing with reduced motion', async () => {
  const { platform, calls } = nativePlatform();
  platform.haptics('success');
  platform.haptics('tick');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice(-2), [['notification', { type: 'SUCCESS' }], ['impact', { style: 'LIGHT' }]]);
  const vibrations = [];
  const web = Platform.create({ navigator: { vibrate: ms => vibrations.push(ms) }, console });
  web.haptics('success'); web.haptics('tick');
  assert.deepEqual(vibrations, [18, 8]);
  assert.doesNotThrow(() => Platform.create({ console }).haptics('tick'), 'no vibration support is fine');
  assert.match(fn('haptic'), /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return;/);
});

test('F: completing a task, checking a habit in and passing the swipe threshold give feedback', () => {
  assert.match(fn('toggleComplete'), /haptic\('success'\);/);
  assert.match(fn('setHabitLog'), /if \(record\.status === 'done'\) haptic\('success'\);/);
  // R25: the tick works in both swipe directions.
  assert.match(fn('handleTaskSwipeMove'), /if \(!swipe\.armed && reach >= 96\) \{ swipe\.armed = true; haptic\('tick'\); \}/);
});

test('F: the Haptics plugin is pinned and synced into both native projects', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@capacitor/haptics'], '8.0.2');
  assert.match(read('android/capacitor.settings.gradle'), /include ':capacitor-haptics'/);
  assert.match(read('ios/App/CapApp-SPM/Package.swift'), /\.product\(name: "CapacitorHaptics"/);
  assert.match(read('js/platform.js'), /plugin\('Haptics'\)/);
});

test('R23 shipped as 2.0.0-alpha.48 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 48);
});
