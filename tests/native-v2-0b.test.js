const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const shellFiles = () => JSON.parse(`[${read('sw.js').match(/const SHELL_FILES = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const CAPACITOR = {
  '@capacitor/android': '8.5.3', '@capacitor/app': '8.1.2', '@capacitor/core': '8.5.3', '@capacitor/filesystem': '8.1.4',
  '@capacitor/ios': '8.5.3', '@capacitor/local-notifications': '8.3.1', '@capacitor/share': '8.0.3',
};

test('package.json pins the Capacitor packages exactly and keeps the tests CommonJS', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, undefined, 'no "type": "module", the Node tests use require');
  assert.deepEqual(pkg.dependencies, CAPACITOR);
  assert.deepEqual(pkg.devDependencies, { '@capacitor/cli': '8.5.3' });
  assert.equal(pkg.scripts.build, 'node tools/build-www.mjs');
  assert.equal(pkg.scripts.sync, 'node tools/build-www.mjs && cap sync');
  const lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of Object.entries({ ...CAPACITOR, '@capacitor/cli': '8.5.3' })) assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} is locked`);
  const ignored = read('.gitignore').split('\n').map(line => line.trim());
  for (const entry of ['node_modules/', 'www/']) assert.ok(ignored.includes(entry), `${entry} is ignored`);
});

test('capacitor.config.json names the app, uses www and keeps the dark edge-to-edge layout', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'cloud.ivapix.dailo');
  assert.equal(config.appName, 'Dailo');
  assert.equal(config.webDir, 'www');
  assert.equal(config.backgroundColor, '#0F1114');
  assert.equal(config.ios.contentInset, 'never');
  assert.deepEqual(config.plugins.SystemBars, { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' });
  assert.equal(config.plugins.LocalNotifications.smallIcon, 'ic_stat_dailo');
  assert.match(config.plugins.LocalNotifications.iconColor, /^#[0-9A-F]{6}$/);
});

test('the vendored Capacitor runtime loads first, is precached and is the 8.5.3 file', () => {
  const html = read('index.html');
  const at = file => html.indexOf(`<script src="${file}"></script>`);
  assert.ok(at('vendor/capacitor/capacitor.js') > 0);
  assert.ok(at('vendor/capacitor/capacitor.js') < at('js/release.js'), 'before every app script');
  assert.ok(shellFiles().includes('vendor/capacitor/capacitor.js'));
  assert.match(read('vendor/capacitor/LICENSE'), /MIT License/);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/capacitor/capacitor.js'))).digest('hex');
  assert.equal(hash, read('vendor/capacitor/capacitor.js.sha256').trim().split(/\s+/)[0], 'unchanged copy of @capacitor/core/dist/capacitor.js');
});

test('the www build copies exactly the precached shell and no service worker', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dailo-www-'));
  fs.writeFileSync(path.join(out, 'stale.txt'), 'old');
  execFileSync(process.execPath, [path.join(root, 'tools/build-www.mjs'), out], { cwd: root });
  assert.deepEqual(listFiles(out).sort(), shellFiles().sort());
  assert.ok(!fs.existsSync(path.join(out, 'sw.js')));
  for (const file of ['index.html', 'js/app.js', 'vendor/capacitor/capacitor.js']) {
    assert.ok(fs.readFileSync(path.join(out, file)).equals(fs.readFileSync(path.join(root, file))), `${file} is copied unchanged`);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test('the iOS and Android projects carry the app id and every native plugin', () => {
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PRODUCT_BUNDLE_IDENTIFIER = cloud\.ivapix\.dailo;/);
  const swift = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(swift, /capacitor-swift-pm\.git", exact: "8\.5\.3"/);
  for (const plugin of ['CapacitorApp', 'CapacitorFilesystem', 'CapacitorLocalNotifications', 'CapacitorShare']) assert.match(swift, new RegExp(`\\.product\\(name: "${plugin}"`));
  assert.match(read('ios/.gitignore'), /^App\/App\/public$/m, 'copied web files are not committed');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /applicationId "cloud\.ivapix\.dailo"/);
  assert.match(gradle, /namespace = "cloud\.ivapix\.dailo"/);
  const settings = read('android/capacitor.settings.gradle');
  for (const plugin of ['capacitor-app', 'capacitor-filesystem', 'capacitor-local-notifications', 'capacitor-share']) assert.match(settings, new RegExp(`include ':${plugin}'`));
  assert.match(read('android/.gitignore'), /app\/src\/main\/assets\/public/);
  assert.ok(exists('android/gradlew') && exists('android/gradle/wrapper/gradle-wrapper.properties'));
});

// --- Step 2: reminders and the native bridge ---------------------------------------------

const Core = require('../js/core.js');
const local = value => new Date(value).toISOString(); // local wall-clock time as the ISO instant

test('upcomingReminders lists the next task, goal and habit reminders like the in-app checker', () => {
  const now = local('2026-10-09T08:00:00'); // Friday
  const state = {
    settings: { weekStartsOn: 'monday' },
    tasks: [
      { id: 't1', title: 'Call', isCompleted: false, reminderAt: '2026-10-09T09:00', reminderFiredAt: null },
      { id: 't2', title: 'Done', isCompleted: true, reminderAt: '2026-10-09T10:00' },
      { id: 't3', title: 'Fired', isCompleted: false, reminderAt: '2026-10-09T11:00', reminderFiredAt: '2026-10-09T07:00:00.000Z' },
      { id: 't4', title: 'Past', isCompleted: false, reminderAt: '2026-10-09T07:00' },
      { id: 't5', title: 'Far', isCompleted: false, reminderAt: '2026-11-30T09:00' },
    ],
    goals: [
      { id: 'g1', title: 'Launch', status: 'active', targetDate: '2026-10-12', reminders: { oneDayBefore: true, onTargetDate: true, time: '10:00' }, reminderFiredMoments: ['2026-10-11T10:00:00'] },
      { id: 'g2', title: 'Paused', status: 'paused', targetDate: '2026-10-12', reminders: { onTargetDate: true } },
    ],
    habits: [
      { id: 'h1', name: 'Read', status: 'active', frequencyType: 'weekdays', weekdays: [1], startDate: '2026-09-01', reminders: [{ enabled: true, time: '20:00' }, { enabled: false, time: '21:00' }] },
      { id: 'h2', name: 'Run', status: 'active', frequencyType: 'timesPerWeek', timesPerWeek: 2, trackingType: 'checkbox', startDate: '2026-09-01', reminders: [{ enabled: true, time: '07:30' }] },
      { id: 'h3', name: 'Stretch', status: 'active', frequencyType: 'daily', startDate: '2026-09-01', reminders: [{ enabled: true, time: '09:00' }], snoozedUntil: local('2026-10-10T12:00:00'), pendingSnoozeAt: local('2026-10-09T08:30:00'), reminderFiredMoments: ['2026-10-11T09:00:00'] },
      { id: 'h4', name: 'Archived', status: 'archived', frequencyType: 'daily', reminders: [{ enabled: true, time: '09:00' }] },
    ],
  };
  const logs = { h2: [{ id: 'a', habitId: 'h2', date: '2026-10-06', status: 'done', value: 1 }, { id: 'b', habitId: 'h2', date: '2026-10-08', status: 'done', value: 1 }] };
  const list = Core.upcomingReminders(state, now, { days: 7, logs });
  const seen = list.map(item => `${item.kind}:${item.id}@${item.at}`);
  assert.deepEqual(seen, [
    `habit:h3@${local('2026-10-09T08:30:00')}`,
    `task:t1@${local('2026-10-09T09:00:00')}`,
    `habit:h2@${local('2026-10-12T07:30:00')}`,
    `habit:h3@${local('2026-10-12T09:00:00')}`,
    `goal:g1@${local('2026-10-12T10:00:00')}`,
    `habit:h1@${local('2026-10-12T20:00:00')}`,
    `habit:h2@${local('2026-10-13T07:30:00')}`,
    `habit:h3@${local('2026-10-13T09:00:00')}`,
    `habit:h2@${local('2026-10-14T07:30:00')}`,
    `habit:h3@${local('2026-10-14T09:00:00')}`,
    `habit:h2@${local('2026-10-15T07:30:00')}`,
    `habit:h3@${local('2026-10-15T09:00:00')}`,
    `habit:h2@${local('2026-10-16T07:30:00')}`,
  ], 'sorted; completed, fired, past, far, paused, archived and disabled skipped; the met week and the snooze are quiet');
  assert.deepEqual(list[1], { key: 'task:t1:2026-10-09T09:00', kind: 'task', id: 't1', at: local('2026-10-09T09:00:00'), title: 'Call' });
  assert.equal(new Set(list.map(item => item.key)).size, list.length, 'keys are unique');
  assert.equal(Core.upcomingReminders(state, now, { days: 7, logs, limit: 3 }).length, 3);
  assert.equal(Core.upcomingReminders(state, now).length > list.length, true, 'the default horizon is 14 days');
  assert.deepEqual(Core.upcomingReminders(null, now), []);
  assert.deepEqual(Core.upcomingReminders(state, 'not a date'), []);
});

const Native = require('../js/native.js');

function fakeCapacitor({ display = 'granted', platform = 'ios', shareError = null } = {}) {
  const calls = [];
  const listeners = {};
  let pending = [{ id: 7 }, { id: 8 }];
  const plugins = {
    LocalNotifications: {
      checkPermissions: async () => ({ display }),
      requestPermissions: async () => { display = 'granted'; calls.push(['request']); return { display }; },
      getPending: async () => ({ notifications: pending }),
      cancel: async options => { calls.push(['cancel', options.notifications.map(item => item.id)]); pending = []; },
      schedule: async options => { calls.push(['schedule', options.notifications]); pending = options.notifications.map(item => ({ id: item.id })); },
      addListener: async (event, fn) => { listeners[event] = fn; return { remove() {} }; },
    },
    App: { addListener: async (event, fn) => { listeners[event] = fn; return { remove() {} }; } },
    Filesystem: { writeFile: async options => { calls.push(['write', options]); return { uri: `file:///cache/${options.path}` }; } },
    Share: { share: async options => { calls.push(['share', options]); if (shareError) throw new Error(shareError); return {}; } },
  };
  return {
    calls, listeners, plugins,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, registerPlugin: name => plugins[name] },
  };
}

test('notification ids are stable positive 31-bit numbers and notifications carry a route', () => {
  const id = Native.notificationId('task:t1:2026-10-09T09:00');
  assert.equal(id, Native.notificationId('task:t1:2026-10-09T09:00'));
  assert.ok(Number.isInteger(id) && id > 0 && id <= 0x7fffffff);
  assert.notEqual(id, Native.notificationId('task:t1:2026-10-09T09:01'));
  const reminders = [
    { key: 'task:t1:x', kind: 'task', id: 't1', at: '2026-10-09T07:00:00.000Z', title: 'Call' },
    { key: 'goal:g1:y', kind: 'goal', id: 'g1', at: '2026-10-12T08:00:00.000Z', title: 'Launch' },
    { key: 'habit:h1:z', kind: 'habit', id: 'h1', at: '2026-10-12T18:00:00.000Z', title: 'Read' },
  ];
  const notifications = Native.toNotifications(reminders, { task: 'Task reminder', goal: 'Goal reminder', habit: 'Habit reminder' });
  assert.deepEqual(notifications.map(item => [item.id, item.title, item.body, item.schedule.at.toISOString(), item.schedule.allowWhileIdle, item.extra.route]), [
    [Native.notificationId('task:t1:x'), 'Call', 'Task reminder', '2026-10-09T07:00:00.000Z', true, '#today'],
    [Native.notificationId('goal:g1:y'), 'Launch', 'Goal reminder', '2026-10-12T08:00:00.000Z', true, '#goals'],
    [Native.notificationId('habit:h1:z'), 'Read', 'Habit reminder', '2026-10-12T18:00:00.000Z', true, '#habits'],
  ]);
});

test('the bridge is inert on the web', async () => {
  const bridge = Native.createBridge({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } });
  assert.equal(bridge.isNative, false);
  assert.equal(Native.createBridge({}).isNative, false);
  assert.deepEqual(await bridge.scheduleReminders([{ id: 1 }]), { scheduled: 0 });
  assert.equal(await bridge.permission(), 'unavailable');
});

test('the bridge schedules reminders only with permission and replaces the previous set', async () => {
  const fake = fakeCapacitor({ display: 'prompt' });
  const bridge = Native.createBridge({ Capacitor: fake.Capacitor });
  assert.equal(bridge.isNative, true);
  assert.equal(bridge.platform, 'ios');
  const notifications = Native.toNotifications([{ key: 'task:t1:x', kind: 'task', id: 't1', at: '2026-10-09T07:00:00.000Z', title: 'Call' }], { task: 'Task reminder' });
  assert.deepEqual(await bridge.scheduleReminders(notifications), { scheduled: 0 });
  assert.deepEqual(fake.calls, [], 'nothing is scheduled before permission');
  assert.equal(await bridge.permission(), 'prompt');
  assert.equal(await bridge.requestPermission(), 'granted');
  assert.deepEqual(await bridge.scheduleReminders(notifications), { scheduled: 1 });
  assert.deepEqual(fake.calls.slice(1).map(call => call[0] === 'schedule' ? ['schedule', call[1].map(item => item.id)] : call), [['cancel', [7, 8]], ['schedule', [notifications[0].id]]]);
  const before = fake.calls.length;
  assert.deepEqual(await bridge.scheduleReminders(notifications), { scheduled: 1 });
  assert.equal(fake.calls.length, before, 'an unchanged set is not rescheduled');
  assert.deepEqual(await bridge.scheduleReminders([]), { scheduled: 0 });
  assert.deepEqual(fake.calls.at(-1), ['cancel', [notifications[0].id]], 'an empty set clears the pending reminders');
});

test('the bridge shares files through the cache and reports resume and notification taps', async () => {
  const fake = fakeCapacitor();
  const bridge = Native.createBridge({ Capacitor: fake.Capacitor });
  const blob = new Blob([Uint8Array.from([80, 75, 3, 4, 255])], { type: 'application/zip' });
  assert.equal(await bridge.shareFile(blob, 'todo-backup-2026-10-09.zip', 'Dailo backup'), true);
  assert.deepEqual(fake.calls.map(call => call[0]), ['write', 'share']);
  assert.deepEqual(fake.calls[0][1], { path: 'todo-backup-2026-10-09.zip', data: Buffer.from([80, 75, 3, 4, 255]).toString('base64'), directory: 'CACHE' });
  assert.deepEqual(fake.calls[1][1], { title: 'Dailo backup', dialogTitle: 'Dailo backup', url: 'file:///cache/todo-backup-2026-10-09.zip' });
  const cancelled = Native.createBridge({ Capacitor: fakeCapacitor({ shareError: 'Share canceled' }).Capacitor });
  assert.equal(await cancelled.shareFile(blob, 'a.zip', 'Dailo backup'), false, 'a cancelled share sheet is not an error');
  const failing = Native.createBridge({ Capacitor: fakeCapacitor({ shareError: 'Disk full' }).Capacitor });
  await assert.rejects(failing.shareFile(blob, 'a.zip', 'Dailo backup'), /Disk full/);

  let resumed = 0; let route = null;
  bridge.onResume(() => { resumed += 1; });
  bridge.onNotificationTap(extra => { route = extra.route; });
  await new Promise(resolve => setImmediate(resolve));
  fake.listeners.resume();
  fake.listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { id: 1, extra: { route: '#habits' } } });
  assert.equal(resumed, 1);
  assert.equal(route, '#habits');
});

// --- Step 2: app wiring ---------------------------------------------------------------------

const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const Release = require('../js/release.js');

test('the native bridge loads after sync and before the app, and is precached', () => {
  const html = read('index.html');
  const at = file => html.indexOf(`<script src="${file}"></script>`);
  assert.ok(at('js/sync.js') < at('js/native.js') && at('js/native.js') < at('js/domain-modules.js') && at('js/native.js') < at('js/app.js'));
  assert.ok(shellFiles().includes('js/native.js'));
});

test('the app wires the bridge: no service worker, app storage, reminders after saves and on start', () => {
  const app = read('js/app.js');
  assert.match(app, /const Native = window\.DailoNative\?\.createBridge\?\.\(\) \|\| \{ isNative: false \};/);
  assert.match(app, /function registerServiceWorker\(\) \{\n\s+if \(Native\.isNative\) return;/);
  assert.match(app, /async function refreshStoragePersistence\(request = false\) \{\n\s+if \(Native\.isNative\) return \{ state: 'native' \};/);
  assert.match(app, /scheduleSync\(\);\n\s+scheduleNativeReminders\(\);\n\s+return true;/, 'every successful save reschedules the reminders');
  assert.match(app, /startSync\(\);\n\s+startNative\(\);/);
  assert.match(app, /standalone: Native\.isNative \|\| navigator\.standalone === true/);
  assert.match(app, /nativeApp: Native\.isNative,/);
  assert.match(app, /guideUrl: Native\.isNative \? 'https:\/\/marko-ivapix\.github\.io\/dailo\/uputstvo\.html' : 'uputstvo\.html',/);
  assert.match(app, /const delivered = await downloadBackup\(blob\);/);
});

function nativeHarness({ permission = 'granted', share = true } = {}) {
  const app = read('js/app.js');
  const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const calls = { scheduled: [], timers: [], toasts: [], renders: 0, checks: 0, syncs: [], shared: [] };
  const handlers = {};
  const context = {
    console, Promise, Object, JSON, Date, Error, Core,
    state: { settings: { weekStartsOn: 'monday' }, tasks: [{ id: 't1', title: 'Call', isCompleted: false, reminderAt: '2099-01-01T09:00' }], goals: [], habits: [], habitLogCache: {} },
    recovery: null, globalOperation: null, startupPromise: null,
    nowIso: () => '2098-12-31T09:00:00.000Z',
    setTimeout: (fn, delay) => { calls.timers.push({ fn, delay }); return calls.timers.length; }, clearTimeout() {},
    location: { hash: '#today' }, currentRoute: () => ({ type: 'settings' }),
    render() { calls.renders += 1; }, setToastMessage(message) { calls.toasts.push(message); },
    checkReminders() { calls.checks += 1; }, scheduleSync(delay) { calls.syncs.push(delay); },
    Native: {
      isNative: true, platform: 'ios', toNotifications: require('../js/native.js').toNotifications,
      permission: async () => permission,
      requestPermission: async () => { permission = 'granted'; return permission; },
      scheduleReminders: async list => { calls.scheduled.push(list); return { scheduled: list.length }; },
      shareFile: async (blob, name, title) => { calls.shared.push({ name, title }); if (share instanceof Error) throw share; return share; },
      onResume(fn) { handlers.resume = fn; }, onNotificationTap(fn) { handlers.tap = fn; },
    },
  };
  vm.createContext(withI18n(context));
  vm.runInContext([
    slice('  // Native app (V2.0-b):', '  // Optional sync (V2.0-a).'),
    slice('  function downloadBackup(', '  function compactState('),
    slice('  async function enableBrowserNotifications(', '  function checkReminders('),
  ].join('\n'), context);
  const flush = async () => { for (let index = 0; index < 5; index += 1) await new Promise(resolve => setImmediate(resolve)); };
  const fire = async () => { const timer = calls.timers.pop(); timer.fn(); await flush(); return timer.delay; };
  return { context, calls, handlers, flush, fire };
}

test('the app schedules native reminders after a pause, on start and on resume, and opens tapped routes', async () => {
  const { context, calls, handlers, flush, fire } = nativeHarness();
  vm.runInContext('scheduleNativeReminders()', context);
  assert.equal(await fire(), 2000, 'saves are batched for two seconds');
  assert.equal(calls.scheduled.length, 1);
  assert.deepEqual(calls.scheduled[0].map(item => [item.title, item.body, item.extra.route]), [['Call', 'Task reminder', '#today']]);
  context.globalOperation = {};
  vm.runInContext('scheduleNativeReminders(0)', context);
  await fire();
  assert.equal(calls.scheduled.length, 1, 'nothing is scheduled during a global operation');
  context.globalOperation = null;

  vm.runInContext('startNative()', context);
  await flush();
  assert.equal(vm.runInContext('nativePermission', context), 'granted');
  assert.equal(await fire(), 0, 'start schedules at once');
  assert.equal(calls.scheduled.length, 2);
  handlers.resume();
  assert.equal(calls.checks, 1, 'resume checks due reminders');
  assert.deepEqual(calls.syncs, [500], 'resume syncs');
  assert.equal(await fire(), 0);
  handlers.tap({ route: '#habits' });
  assert.equal(context.location.hash, '#habits');
  handlers.tap({ route: 'javascript:alert(1)' });
  assert.equal(context.location.hash, '#habits', 'only app routes are opened');

  context.Native.isNative = false;
  const timers = calls.timers.length;
  vm.runInContext('scheduleNativeReminders(); startNative()', context);
  assert.equal(calls.timers.length, timers, 'the web build schedules nothing');
});

test('the Settings notification button asks for native permission, and backups go through the share sheet', async () => {
  const prompt = nativeHarness({ permission: 'prompt' });
  await vm.runInContext('enableBrowserNotifications()', prompt.context);
  assert.equal(vm.runInContext('nativePermission', prompt.context), 'granted');
  assert.equal(prompt.calls.toasts.at(-1), 'Notifications are on');
  assert.equal(prompt.calls.timers.at(-1).delay, 0, 'reminders are scheduled right after permission');
  const denied = nativeHarness({ permission: 'denied' });
  await vm.runInContext('enableBrowserNotifications()', denied.context);
  assert.equal(denied.calls.toasts.at(-1), 'Notifications are turned off in the phone settings');
  const granted = nativeHarness();
  await vm.runInContext('enableBrowserNotifications()', granted.context);
  assert.equal(granted.calls.toasts.at(-1), 'Notifications are already on');

  const shared = nativeHarness();
  assert.equal(await vm.runInContext('downloadBackup({})', shared.context), true);
  assert.match(shared.calls.shared[0].name, /^todo-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.equal(shared.calls.shared[0].title, 'Dailo backup');
  const cancelled = nativeHarness({ share: false });
  assert.equal(await vm.runInContext('downloadBackup({})', cancelled.context), false);
  const failed = nativeHarness({ share: new Error('Disk full') });
  assert.equal(await vm.runInContext('downloadBackup({})', failed.context), null);
  assert.equal(failed.calls.toasts.at(-1), 'The backup could not be shared: Disk full');
});

test('Settings in the app shows phone reminders, app storage and the online guide', () => {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const render = fields => adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
    release: Release, environmentInfo: () => ({ standalone: true }), ...fields,
  });
  const web = render({ storagePersistence: () => ({ state: 'granted' }) });
  assert.match(web, /<strong>Browser reminders<\/strong>/);
  assert.match(web, /href="uputstvo\.html"/);
  const native = render({ nativeApp: true, storagePersistence: () => ({ state: 'native' }), guideUrl: 'https://marko-ivapix.github.io/dailo/uputstvo.html' });
  assert.match(native, /<strong>Reminders<\/strong><span>Task, goal and habit reminders arrive as notifications on this device, also when Dailo is closed\.<\/span>/);
  assert.match(native, /<span data-storage-persistence="native">The app keeps its data in its own storage on this device\. Keep regular backups\.<\/span>/);
  assert.doesNotMatch(native, /data-action="request-storage-persistence"/);
  assert.match(native, /href="https:\/\/marko-ivapix\.github\.io\/dailo\/uputstvo\.html" target="_blank"/);
});

// --- Step 3: assets and native settings --------------------------------------------------

const { readPng } = require('./support/png.js');
const BLUE = [6, 25, 254];
const DARK = [15, 17, 20];
const near = (actual, expected) => expected.every((value, index) => Math.abs(actual[index] - value) <= 2);
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

test('the native app icons and splash screens are the Dailo mark on its colors', () => {
  const icon = readPng(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  assert.deepEqual([icon.width, icon.height, icon.channels], [1024, 1024, 3], 'the App Store icon has no alpha channel');
  assert.ok(near(icon.pixel(4, 4), BLUE), 'full-bleed blue');
  for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    const splash = readPng(path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', file));
    assert.deepEqual([splash.width, splash.height], [2732, 2732]);
    assert.ok(near(splash.pixel(10, 10), DARK), `${file} is dark`);
    assert.ok(near(splash.pixel(1366 - 270, 1366), BLUE), `${file} shows the blue tile in the middle`);
  }
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const res = `android/app/src/main/res`;
    const launcher = readPng(path.join(root, res, `mipmap-${density}/ic_launcher.png`));
    assert.equal(launcher.width, 48 * scale);
    assert.ok(near(launcher.pixel(Math.round(2 * scale), Math.round(24 * scale)), BLUE));
    const round = readPng(path.join(root, res, `mipmap-${density}/ic_launcher_round.png`));
    assert.equal(round.width, 48 * scale);
    assert.equal(round.pixel(0, 0)[3], 0, 'the round icon has transparent corners');
    const foreground = readPng(path.join(root, res, `mipmap-${density}/ic_launcher_foreground.png`));
    assert.equal(foreground.width, 108 * scale);
    assert.equal(foreground.pixel(Math.round(10 * scale), Math.round(54 * scale))[3], 0, 'the adaptive foreground stays inside the safe zone');
    const port = readPng(path.join(root, res, `drawable-port-${density}/splash.png`));
    assert.ok(near(port.pixel(2, 2), DARK), `${density} splash is dark`);
    assert.ok(near(port.pixel(Math.round(port.width / 2) - Math.round(port.width * 0.11), Math.round(port.height / 2)), BLUE));
  }
  assert.match(read('android/app/src/main/res/values/ic_launcher_background.xml'), /<color name="ic_launcher_background">#0619FE<\/color>/);
});

test('the Android notification icon is a white silhouette on transparency at every density', () => {
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const image = readPng(path.join(root, `android/app/src/main/res/drawable-${density}/ic_stat_dailo.png`));
    assert.deepEqual([image.width, image.height, image.channels], [24 * scale, 24 * scale, 4]);
    let visible = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const [r, g, b, a] = image.pixel(x, y);
        if (a) { visible += 1; assert.deepEqual([r, g, b], [255, 255, 255], `${density} (${x},${y}) is white`); }
      }
    }
    assert.ok(visible > image.width * image.height * 0.1, `${density} draws the mark`);
    assert.equal(image.pixel(0, 0)[3], 0);
  }
});

test('the native projects carry the version, the dark style and the store settings', () => {
  const plist = read('ios/App/App/Info.plist');
  for (const [key, value] of [['CFBundleDisplayName', '<string>Dailo</string>'], ['UIUserInterfaceStyle', '<string>Dark</string>'], ['ITSAppUsesNonExemptEncryption', '<false/>'], ['CFBundleAllowMixedLocalizations', '<true/>']]) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*${value}`), key);
  }
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/MARKETING_VERSION = 2\.0\.0;/g) || []).length, 2, 'Debug and Release');
  assert.doesNotMatch(project, /MARKETING_VERSION = 1\.0;/);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionCode 1\n/);
  assert.match(gradle, /versionName "2\.0\.0"/);
  assert.match(read('android/app/src/main/res/values/styles.xml'), /<item name="windowSplashScreenBackground">#0F1114<\/item>/);
  assert.match(read('tools/generate-icons.py'), /--native/);
});

test('the Serbian build guide covers both platforms with the repository commands', () => {
  const guide = read('docs/v2/izrada-aplikacije.md');
  for (const command of ['npm ci', 'npm run sync', 'npx cap open ios', 'npx cap open android', 'git checkout ccr-95f6062b-lgg2fr']) assert.ok(guide.includes(command), command);
  for (const step of ['Signing & Capabilities', 'Režim za programere', 'USB otklanjanje grešaka', 'Obaveštenja → Podsetnici → Uključi', 'Izvezi ZIP']) assert.ok(guide.includes(step), step);
  assert.doesNotMatch(guide, /[Ѐ-ӿ]/, 'Latin script only');
});

test('V2.0-b is released as 2.0.0-alpha.2', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.2');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.2';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0', 'the native marketing version');
});
