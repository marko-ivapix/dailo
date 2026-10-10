// Android report 2026-10-10: a reminder set just before closing the app never arrived. Saves scheduled the phone
// notifications 2 s later, and the pause flush did not run that step, so an app swiped away right after a save
// never handed the reminder to the system. The pause flush now reconciles at once, without asking for permission.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

function flushContext(isNative) {
  const calls = [];
  const ctx = {
    calls, globalOperation: false, state: {}, modalState: null,
    flushTaskDraft: () => calls.push('draft'), flushTextSave: () => calls.push('text'), saveState: () => calls.push('save'),
    writeDurableMirror: () => calls.push('mirror'),
    reconcileNotifications: options => { calls.push(['reconcile', options]); return Promise.resolve(); },
    console: { error: () => {} },
  };
  ctx.globalThis = { DailoPlatform: { isNative } };
  vm.createContext(ctx);
  vm.runInContext(fn('flushPendingWork'), ctx);
  return ctx;
}

test('the pause flush hands reminders to the phone at once, after saving', () => {
  const native = flushContext(true);
  native.flushPendingWork('pause');
  assert.deepEqual(JSON.parse(JSON.stringify(native.calls)), ['draft', 'text', 'save', 'mirror', ['reconcile', { ask: false }]]);
  const web = flushContext(false);
  web.flushPendingWork('pagehide');
  assert.deepEqual(web.calls, ['draft', 'text', 'save']);
});

function reconcileContext() {
  const asked = [], stored = {};
  const ctx = {
    asked, stored, state: { tasks: [] }, globalOperation: false, recovery: false,
    notificationTimer: 1, notificationPermission: null, exactAlarmState: null,
    clearTimeout: () => {}, nowIso: () => '2026-10-10T10:00:00.000Z',
    Core: { notificationPlan: () => [{ key: 'task:a:1', kind: 'task', at: '2026-10-10T10:03:00.000Z' }] },
    notificationBody: () => 'Podsetnik', rememberNotified: () => {}, currentRoute: () => ({ type: 'today' }), render: () => {},
    localStorage: { getItem: key => stored[key] ?? null, setItem: (key, value) => { stored[key] = value; } },
  };
  ctx.globalThis = { DailoPlatform: { isNative: true, notifications: {
    reconcile: async () => ({ status: 'permission', permission: 'prompt' }),
    requestPermission: async () => { asked.push(true); return 'denied'; },
  } } };
  vm.createContext(ctx);
  vm.runInContext(fn('reconcileNotifications'), ctx);
  return ctx;
}

test('reconciling on pause never asks for permission; the next start or save still does', async () => {
  const quiet = reconcileContext();
  await quiet.reconcileNotifications({ ask: false });
  assert.equal(quiet.asked.length, 0, 'no system question while the app leaves the screen');
  assert.equal(quiet.stored.dailoNotifyAsked, undefined, 'the one question is kept for later');
  const normal = reconcileContext();
  await normal.reconcileNotifications();
  assert.equal(normal.asked.length, 1);
  assert.ok(normal.stored.dailoNotifyAsked);
});

test('released as 2.0.0-alpha.6', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.6');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.6';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.6');
});
