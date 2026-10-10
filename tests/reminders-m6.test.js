// Modernization M6: reminders as phone notifications (audit R-1, R-2, H-2).
// Belgrade time: plan moments are local wall-clock times (node --test runs each file in its own process).
process.env.TZ = 'Europe/Belgrade';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Platform = require('../js/platform.js');
const { withI18n } = require('./support/i18n.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const region = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));

const local = (date, time) => new Date(`${date}T${time}:00`).toISOString();
const NOW = local('2026-10-09', '10:00'); // a Friday
const base = (extra = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { weekStartsOn: 'monday' }, ui: {}, ...extra });
const task = (id, extra = {}) => ({ id, title: `Task ${id}`, isCompleted: false, reminderAt: null, reminderFiredAt: null, dueDate: null, ...extra });
const habit = (id, extra = {}) => ({ id, name: `Habit ${id}`, status: 'active', frequencyType: 'daily', reminders: [{ id: 'r', time: '07:30', enabled: true }], reminderFiredMoments: [], ...extra });

test('R-2: reminderInstant reads floating local times and UTC timestamps', () => {
  assert.equal(Core.reminderInstant('2026-10-09T09:00:00'), new Date(2026, 9, 9, 9, 0).getTime(), 'no offset = local wall clock');
  assert.equal(Core.reminderInstant('2026-10-09T07:00:00.000Z'), Date.UTC(2026, 9, 9, 7, 0));
  assert.equal(Core.reminderInstant('2026-10-09'), null, 'a date alone is not a moment');
  assert.equal(Core.reminderInstant('soon'), null);
  assert.equal(Core.reminderInstant(null), null);
});

test('task reminders: open, unfired, in the future and inside the window', () => {
  const state = base({ tasks: [
    task('a', { reminderAt: '2026-10-09T18:00:00', dueDate: '2026-10-10' }),
    task('done', { reminderAt: '2026-10-09T18:00:00', isCompleted: true }),
    task('fired', { reminderAt: '2026-10-09T18:00:00', reminderFiredAt: local('2026-10-09', '18:01') }), // fired for this moment (M12 rule)
    task('past', { reminderAt: '2026-10-09T09:59:00' }),
    task('far', { reminderAt: '2026-10-24T09:00:00' }),
    task('utc', { reminderAt: '2026-10-12T06:00:00.000Z' }),
  ] });
  const plan = Core.notificationPlan(state, NOW);
  assert.deepEqual(plan.map(item => item.id), ['a', 'utc']);
  assert.deepEqual(plan[0], { key: 'task:a:2026-10-09T18:00:00', kind: 'task', id: 'a', at: local('2026-10-09', '18:00'), title: 'Task a', route: 'task/a', date: '2026-10-10' });
  assert.equal(plan[1].at, '2026-10-12T06:00:00.000Z');
  assert.equal(Core.notificationKey('task', 'a', '2026-10-09T18:00:00'), plan[0].key, 'the in-app checker builds the same key');
});

test('goal reminders: active goals, unfired moments before the target date', () => {
  const goal = { id: 'g', title: 'Goal', status: 'active', targetDate: '2026-10-14', reminders: { threeDaysBefore: true, onTargetDate: true, sevenDaysBefore: true, time: '08:00' }, reminderFiredMoments: ['2026-10-14T08:00:00'] };
  const plan = Core.notificationPlan(base({ goals: [goal, { ...goal, id: 'paused', status: 'paused' }] }), NOW);
  assert.deepEqual(plan.map(item => [item.key, item.route, item.date]), [['goal:g:2026-10-11T08:00:00', 'goal/g', '2026-10-14']], 'seven days before is past; the target day already fired');
});

test('habit reminders: scheduled days, snoozes and a met weekly target', () => {
  const daily = Core.notificationPlan(base({ habits: [habit('h')] }), NOW, { days: 3 });
  assert.deepEqual(daily.map(item => item.at), [local('2026-10-10', '07:30'), local('2026-10-11', '07:30'), local('2026-10-12', '07:30')], 'today 07:30 is past');
  assert.equal(daily[0].route, 'habit/h');

  const snoozed = habit('s', { snoozedUntil: local('2026-10-10', '19:00'), pendingSnoozeAt: local('2026-10-10', '19:00') });
  const snoozePlan = Core.notificationPlan(base({ habits: [snoozed] }), NOW, { days: 2 });
  assert.deepEqual(snoozePlan.map(item => item.key), [`habit:s:snooze:${local('2026-10-10', '19:00')}`, 'habit:s:2026-10-11T07:30:00'], 'moments before the snooze end are silent; the snooze is its own notification');

  const weekly = habit('w', { frequencyType: 'timesPerWeek', timesPerWeek: 2, startDate: '2026-09-01' });
  const logs = { w: [{ id: 'l1', habitId: 'w', date: '2026-10-06', status: 'done' }, { id: 'l2', habitId: 'w', date: '2026-10-08', status: 'done' }] };
  const met = Core.deriveHabitMetrics(weekly, logs.w, '2026-10-09', 'monday');
  assert.ok(met.currentPeriodCount >= met.currentPeriodTarget, 'fixture: the weekly target is met');
  const weekPlan = Core.notificationPlan(base({ habits: [weekly] }), NOW, { days: 4, logs });
  assert.deepEqual(weekPlan.map(item => item.at), [local('2026-10-12', '07:30'), local('2026-10-13', '07:30')], 'quiet for the rest of this week, back on Monday');

  assert.deepEqual(Core.notificationPlan(base({ habits: [habit('p', { status: 'paused' })] }), NOW), []);
});

test('the plan is sorted, never in the past and capped for the iOS pending limit', () => {
  const tasks = Array.from({ length: 80 }, (_, index) => task(`t${String(index).padStart(2, '0')}`, { reminderAt: new Date(Date.parse(NOW) + (80 - index) * 3600000).toISOString() }));
  const plan = Core.notificationPlan(base({ tasks }), NOW);
  assert.equal(plan.length, 60);
  assert.ok(plan.every((item, index) => Date.parse(item.at) > Date.parse(NOW) && (!index || plan[index - 1].at <= item.at)));
  assert.equal(plan[0].id, 't79');
  assert.deepEqual(Core.notificationPlan(null, NOW), []);
});

test('H-2: snooze and "later today" never land in the past or on the next day', () => {
  const at = time => new Date(`2026-10-09T${time}:00`);
  const iso = time => at(time).toISOString();
  assert.equal(Core.snoozeTarget('15m', at('10:00')), iso('10:15'));
  assert.equal(Core.snoozeTarget('1h', at('10:00')), iso('11:00'));
  assert.equal(Core.snoozeTarget('tonight', at('18:00')), iso('19:00'));
  assert.equal(Core.snoozeTarget('tonight', at('19:30')), iso('21:00'));
  assert.equal(Core.snoozeTarget('tonight', at('21:00')), null, 'no "tonight" left');
  assert.equal(Core.snoozeTarget('tonight', at('23:10')), null);
  assert.equal(Core.laterToday(at('10:00')), iso('12:00'));
  assert.equal(Core.laterToday(at('21:59')), iso('23:59'));
  assert.equal(Core.laterToday(at('22:30')), null, 'two hours later is tomorrow');
});

test('H-2: the pickers offer only snoozes that are still today', () => {
  assert.match(fn('snoozeHabit'), /Core\.snoozeTarget\(kind, new Date\(\)\)/);
  assert.match(fn('openReminderPicker'), /Core\.laterToday\(new Date\(\)\)/);
  const habitsUi = fs.readFileSync(path.join(__dirname, '..', 'js', 'habits-ui.js'), 'utf8');
  assert.match(habitsUi, /Core\.snoozeTarget\('tonight', new Date\(\)\)/);
});

// --- platform -----------------------------------------------------------------------------------------

function nativePlugin({ display = 'granted', exact = 'granted', pending = [], kind = 'ios' } = {}) {
  const calls = [];
  const listeners = {};
  const ln = {
    checkPermissions: async () => ({ display }),
    requestPermissions: async () => { calls.push(['request']); return { display: 'granted' }; },
    checkExactNotificationSetting: async () => ({ exact_alarm: exact }),
    changeExactNotificationSetting: async () => { calls.push(['exact']); return { exact_alarm: 'granted' }; },
    getPending: async () => ({ notifications: pending }),
    cancel: async options => { calls.push(['cancel', options.notifications.map(item => item.id)]); },
    schedule: async options => { calls.push(['schedule', options.notifications]); return { notifications: options.notifications.map(item => ({ id: item.id })) }; },
    addListener: (name, listener) => { (listeners[name] ||= []).push(listener); return Promise.resolve({ remove() {} }); },
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => kind, registerPlugin: name => (name === 'LocalNotifications' ? ln : {}) }, console });
  return { platform, calls, listeners };
}
const item = (key, at, extra = {}) => ({ key, at, title: key, body: 'Reminder', route: `task/${key}`, ...extra });
const FUTURE = '2099-01-01T08:00:00.000Z';

test('notification ids are stable positive 31-bit numbers', () => {
  const { notificationId } = Platform.notifications;
  const ids = ['task:a:1', 'task:b:1', 'habit:h:2026-10-10T07:30:00', 'goal:g:x'].map(notificationId);
  assert.ok(ids.every(id => Number.isInteger(id) && id > 0 && id <= 0x7fffffff));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(notificationId('task:a:1'), ids[0]);
});

test('the web schedules nothing', async () => {
  assert.deepEqual(await Platform.notifications.reconcile([item('a', FUTURE)]), { status: 'web' });
  assert.equal(await Platform.notifications.permission(), 'unavailable');
});

test('without permission nothing is scheduled and the state is reported', async () => {
  const { platform, calls } = nativePlugin({ display: 'prompt-with-rationale' });
  assert.deepEqual(await platform.notifications.reconcile([item('a', FUTURE)]), { status: 'permission', permission: 'prompt' });
  assert.deepEqual(calls, []);
});

test('reconcile keeps unchanged notifications, cancels only stale ones and schedules the rest', async () => {
  const probe = nativePlugin();
  await probe.platform.notifications.reconcile([item('keep', FUTURE), item('changed', FUTURE)]);
  const [, first] = probe.calls.find(([name]) => name === 'schedule');
  const pendingOf = entry => ({ id: entry.id, title: entry.title, body: entry.body, schedule: { at: FUTURE }, extra: entry.extra });
  const keep = pendingOf(first[0]);
  const changed = pendingOf(first[1]);
  const stale = { id: 42, title: 'gone', body: '', schedule: { at: FUTURE }, extra: { key: 'gone' } };
  const delivered = { id: 43, title: 'shown', body: '', schedule: { at: '2001-01-01T00:00:00.000Z' }, extra: { key: 'shown' } };

  const { platform, calls } = nativePlugin({ pending: [keep, changed, stale, delivered] });
  const result = await platform.notifications.reconcile([item('keep', FUTURE), item('changed', FUTURE, { title: 'New title' }), item('new', FUTURE)]);
  assert.equal(result.status, 'ok');
  assert.deepEqual({ scheduled: result.scheduled, cancelled: result.cancelled, kept: result.kept }, { scheduled: 2, cancelled: 2, kept: 1 });
  assert.deepEqual(calls[0], ['cancel', [changed.id, 42]], 'never cancel-all; delivered ones are left alone');
  const [name, scheduled] = calls[1];
  assert.equal(name, 'schedule');
  assert.deepEqual(scheduled.map(entry => entry.extra.key), ['changed', 'new']);
  const entry = scheduled[1];
  assert.equal(entry.id, Platform.notifications.notificationId('new'));
  assert.ok(entry.schedule.at instanceof Date && entry.schedule.at.toISOString() === FUTURE);
  assert.equal(entry.schedule.allowWhileIdle, true);
  assert.deepEqual([entry.title, entry.body, entry.extra.route], ['new', 'Reminder', 'task/new']);
  assert.equal('isExactNotification' in entry, false, 'iOS: no Android-only option');
});

test('Android without exact alarms schedules inexact reminders instead of opening the settings screen', async () => {
  const { platform, calls } = nativePlugin({ kind: 'android', exact: 'denied' });
  const result = await platform.notifications.reconcile([item('a', FUTURE)]);
  assert.equal(result.exact, 'denied');
  assert.equal(calls[0][1][0].isExactNotification, false);
  assert.equal(await platform.notifications.exactAlarms(), 'denied');
  assert.equal(await platform.notifications.allowExactAlarms(), 'granted');
  const ios = nativePlugin({ kind: 'ios' });
  assert.equal(await ios.platform.notifications.exactAlarms(), null);
});

test('a tapped notification reports its route; permission can be requested', async () => {
  const { platform, listeners } = nativePlugin({ display: 'denied' });
  const opened = [];
  platform.notifications.onOpen(extra => opened.push(extra.route));
  listeners.localNotificationActionPerformed[0]({ actionId: 'tap', notification: { id: 1, extra: { key: 'k', route: 'goal/g' } } });
  assert.deepEqual(opened, ['goal/g']);
  assert.equal(await platform.notifications.permission(), 'denied');
  assert.equal(await platform.notifications.requestPermission(), 'granted');
});

// --- app ---------------------------------------------------------------------------------------------

function checker({ native = true, permission = 'granted', notified = {} } = {}) {
  const storage = new Map([['dailoNotified', JSON.stringify(notified)]]);
  const toasts = [];
  let saves = 0;
  const ctx = {
    state: base({ tasks: [task('a', { reminderAt: '2026-10-09T09:00:00' }), task('b', { reminderAt: '2026-10-09T09:30:00' })] }),
    globalOperation: null, Core, nowIso: () => NOW, relativeDateLabel: value => value, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    saveState: () => { saves += 1; return true; }, setToastMessage: message => toasts.push(message),
    notificationPermission: permission, DailoPlatform: { isNative: native },
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${region('  // Native reminders (audit R-1', '\n  async function reconcileNotifications(')}\n${fn('checkReminders')}`, ctx);
  return { ctx, toasts, saves: () => saves, storage };
}

test('on the phone a reminder the system already showed is recorded without a second toast', () => {
  const shown = checker({ notified: { 'task:a:2026-10-09T09:00:00': local('2026-10-09', '09:00') } });
  shown.ctx.checkReminders();
  assert.ok(shown.ctx.state.tasks.every(item => item.reminderFiredAt === NOW), 'both are recorded');
  assert.equal(shown.saves(), 1);
  assert.equal(shown.toasts.length, 1);
  assert.match(String(shown.toasts[0]), /Task b/, 'only the one the phone never scheduled is toasted');

  const all = checker({ notified: { 'task:a:2026-10-09T09:00:00': NOW, 'task:b:2026-10-09T09:30:00': NOW } });
  all.ctx.checkReminders();
  assert.deepEqual(all.toasts, []);

  const blocked = checker({ permission: 'denied', notified: { 'task:a:2026-10-09T09:00:00': NOW, 'task:b:2026-10-09T09:30:00': NOW } });
  blocked.ctx.checkReminders();
  assert.equal(blocked.toasts.length, 1, 'without permission the toast stays');

  const web = checker({ native: false, notified: { 'task:a:2026-10-09T09:00:00': NOW } });
  web.ctx.checkReminders();
  assert.equal(web.toasts.length, 1);
});

test('the app reconciles after saves, habit log changes, start and resume, and opens tapped items', () => {
  const native = 'if \\(globalThis\\.DailoPlatform\\?\\.isNative\\) ';
  assert.match(fn('saveState'), new RegExp(`${native}scheduleNotificationPlan\\(\\);`));
  assert.match(app.slice(app.indexOf('  async function refreshHabitMetrics('), app.indexOf('  function readHabitDraft(')), new RegExp(`${native}scheduleNotificationPlan\\(\\);`));
  assert.match(fn('resumeApp'), /scheduleNotificationPlan\(500\)/);
  const start = fn('startPlatform');
  assert.match(start, /platform\.notifications\.onOpen\(openNotificationTarget\)/);
  assert.match(start, /scheduleNotificationPlan\(0\)/);
  assert.match(fn('enableBrowserNotifications'), /platform\.notifications\.requestPermission\(\)/);
});

test('a tapped notification opens its task, goal or habit, and never interrupts an open dialog', () => {
  const opened = [];
  const ctx = {
    state: {}, globalOperation: null, recovery: null, modalState: null,
    getTask: id => (id === 't' ? {} : null), getGoal: id => (id === 'g' ? {} : null), getHabit: id => (id === 'h' ? {} : null),
    openTaskDetail: id => opened.push(`task:${id}`), navigate: route => opened.push(route),
  };
  vm.createContext(ctx);
  vm.runInContext(fn('openNotificationTarget'), ctx);
  ctx.openNotificationTarget({ route: 'task/t' });
  ctx.openNotificationTarget({ route: 'goal/g' });
  ctx.openNotificationTarget({ route: 'habit/h' });
  ctx.openNotificationTarget({ route: 'task/missing' });
  ctx.openNotificationTarget({ route: 'settings' });
  ctx.modalState = { type: 'task' };
  ctx.openNotificationTarget({ route: 'goal/g' });
  assert.deepEqual(opened, ['task:t', '#goal/g', '#habit/h']);
});

test('Settings names the phone notification state and offers exact alarms only on Android when they are off', () => {
  const { runInNewContextWithI18n } = require('./support/i18n.js');
  let adapter;
  runInNewContextWithI18n(fs.readFileSync(path.join(__dirname, '..', 'js', 'settings-ui.js'), 'utf8'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const render = notificationSettings => adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
    environmentInfo: () => ({ userAgent: 'iPhone', standalone: false }), notificationSettings,
  });
  assert.match(render(undefined), /nothing arrives while the app is closed/, 'the web row is unchanged');
  const granted = render(() => ({ permission: 'granted', exact: null }));
  assert.match(granted, /even when Dailo is closed\./);
  assert.doesNotMatch(granted, /allow-exact-alarms/);
  assert.match(render(() => ({ permission: 'denied', exact: null })), /Turn them on in the phone settings/);
  assert.match(render(() => ({ permission: 'granted', exact: 'denied' })), /data-action="allow-exact-alarms"/);
});
