const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const DAY = 86400000;
const NOW = '2026-10-07T12:00:00.000Z';
const daysAgo = days => new Date(Date.parse(NOW) - days * DAY).toISOString();
const appSource = read('js/app.js');
const appRegion = (startMarker, endMarker) => {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `region ${startMarker} … ${endMarker}`);
  return appSource.slice(start, end);
};
const emptyState = (extra = {}) => Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {}, ...extra });

function renderSettings(settings, ctxExtra = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [], ...settings } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
    Core, ...ctxExtra,
  });
}

test('backup reminder interval defaults to 7 days and accepts integers 0–90', () => {
  assert.equal(Core.backupReminderDays({}), 7);
  assert.equal(Core.backupReminderDays(undefined), 7);
  assert.equal(Core.backupReminderDays({ backupReminderDays: 0 }), 0);
  assert.equal(Core.backupReminderDays({ backupReminderDays: 14 }), 14);
  for (const invalid of [-1, 91, 2.5, '7', null]) assert.equal(Core.backupReminderDays({ backupReminderDays: invalid }), 7, String(invalid));
});

test('backup reminder is due after the interval, respects snooze, and needs some data when never exported', () => {
  const due = options => Core.backupReminderDue({ reminderDays: 7, now: NOW, ...options });
  assert.equal(due({ lastExport: daysAgo(8) }), true);
  assert.equal(due({ lastExport: daysAgo(2) }), false);
  assert.equal(due({ lastExport: daysAgo(8), snoozedUntil: new Date(Date.parse(NOW) + 3600000).toISOString() }), false);
  assert.equal(due({ lastExport: daysAgo(8), snoozedUntil: daysAgo(1) }), true);
  assert.equal(due({ lastExport: null, oldestCreatedAt: daysAgo(10) }), true);
  assert.equal(due({ lastExport: null, oldestCreatedAt: daysAgo(1) }), false);
  assert.equal(due({ lastExport: null, oldestCreatedAt: null }), false, 'no user data, nothing to back up');
  assert.equal(due({ lastExport: daysAgo(100), reminderDays: 0 }), false, '0 turns the reminder off');
  assert.equal(due({ lastExport: 'not a date', oldestCreatedAt: daysAgo(10) }), true, 'an invalid export date falls back to the oldest record');
});

test('oldestCreatedAt looks at tasks, goals, habits, notes and resources and ignores invalid timestamps', () => {
  // Plain object: normalizeState would reject the invalid timestamp outright.
  const state = {
    tasks: [{ id: 't', createdAt: daysAgo(3) }, { id: 'bad', createdAt: 'yesterday' }],
    goals: [{ id: 'g', createdAt: daysAgo(9) }],
    habits: [], notes: [{ id: 'n', createdAt: daysAgo(5) }], resources: [], projects: [{ id: 'p', createdAt: daysAgo(30) }],
  };
  assert.equal(Core.oldestCreatedAt(state), daysAgo(9));
  assert.equal(Core.oldestCreatedAt(emptyState()), null);
});

test('backup import validates backupReminderDays and round-trips it', async () => {
  const valid = emptyState({ settings: { backupReminderDays: 14 } });
  assert.doesNotThrow(() => Backup.validateDomain(valid, [], []));
  for (const invalid of [120, -2, 3.5, '7']) {
    assert.throws(() => Backup.validateDomain(emptyState({ settings: { backupReminderDays: invalid } }), [], []), /backupReminderDays/, String(invalid));
  }
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };
  const inspected = await Backup.inspectBackupV3(await Backup.exportBackupV3(valid, storage, NOW));
  assert.equal(inspected.state.settings.backupReminderDays, 14);
});

test('Settings shows persistence status, the reminder interval, and a formatted last export', () => {
  const granted = renderSettings({ backupStatus: { lastExport: '2026-10-01T09:30:00.000Z' } }, { storagePersistence: () => ({ state: 'granted', usage: 5 * 1024 * 1024, quota: 1024 * 1024 * 1024 }) });
  assert.match(granted, /data-storage-persistence="granted"/);
  assert.match(granted, /5\.0 MB/);
  assert.doesNotMatch(granted, /data-action="request-storage-persistence"/);
  assert.match(granted, /<time datetime="2026-10-01T09:30:00\.000Z">/);
  assert.match(granted, /<select class="input" id="backup-reminder-days">[\s\S]*<option value="7" selected>/);

  const denied = renderSettings({ backupReminderDays: 14 }, { storagePersistence: () => ({ state: 'denied' }) });
  assert.match(denied, /data-storage-persistence="denied"/);
  assert.match(denied, /data-action="request-storage-persistence"/);
  assert.match(denied, /<option value="14" selected>/);

  const unsupported = renderSettings({}, { storagePersistence: () => ({ state: 'unsupported' }) });
  assert.match(unsupported, /data-storage-persistence="unsupported"/);
  assert.doesNotMatch(unsupported, /data-action="request-storage-persistence"/);

  const legacyContext = renderSettings({});
  assert.match(legacyContext, /data-storage-persistence="unknown"/);
});

function reminderApp(state, stored = {}) {
  const values = new Map(Object.entries(stored));
  const ctx = {
    state, Core, esc: String, nowIso: () => NOW,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
    navigator: {},
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(appRegion('  function backupReminderNotice(', '  async function exportBackupAction('), ctx);
  return { ctx, values };
}

test('Today shows one backup notice with export and snooze actions only when the reminder is due', () => {
  const stale = emptyState({ tasks: [{ id: 't', title: 'Keep me', createdAt: daysAgo(20) }], settings: { backupStatus: { lastExport: daysAgo(8) } } });
  const { ctx, values } = reminderApp(stale);
  const html = ctx.backupReminderNotice();
  assert.match(html, /data-backup-reminder/);
  assert.match(html, /data-action="export-backup"/);
  assert.match(html, /data-action="snooze-backup-reminder"/);
  ctx.snoozeBackupReminder();
  const snoozedUntil = values.get('todoAppBackupReminderSnoozedUntil');
  assert.equal(snoozedUntil, new Date(Date.parse(NOW) + DAY).toISOString());
  assert.equal(ctx.backupReminderNotice(), '', 'snoozed for 24 h');

  const fresh = emptyState({ tasks: [{ id: 't', title: 'Keep me', createdAt: daysAgo(20) }], settings: { backupStatus: { lastExport: daysAgo(1) } } });
  assert.equal(reminderApp(fresh).ctx.backupReminderNotice(), '');

  const renderToday = appRegion('  function renderToday()', '  function renderInbox()');
  assert.match(renderToday, /backupReminderNotice\(\)/);
  assert.doesNotMatch(appRegion('  function renderModal(', '\n  function '), /backupReminderNotice/);
});

test('storage persistence is requested only on demand and reports unsupported browsers', async () => {
  const run = async (navigatorValue, request) => {
    const ctx = { state: emptyState(), Core, esc: String, nowIso: () => NOW, localStorage: { getItem: () => null, setItem() {} }, navigator: navigatorValue };
    vm.createContext(withI18n(ctx));
    vm.runInContext(appRegion('  function backupReminderNotice(', '  async function exportBackupAction('), ctx);
    // The status object comes from another realm; compare plain data.
    return JSON.parse(JSON.stringify(await ctx.refreshStoragePersistence(request)));
  };
  let persistCalls = 0;
  const storage = { persisted: async () => false, persist: async () => { persistCalls += 1; return true; }, estimate: async () => ({ usage: 2048, quota: 4096 }) };
  assert.deepEqual(await run({ storage }, false), { state: 'denied', usage: 2048, quota: 4096 });
  assert.equal(persistCalls, 0, 'checking status never requests');
  assert.deepEqual(await run({ storage }, true), { state: 'granted', usage: 2048, quota: 4096 });
  assert.equal(persistCalls, 1);
  assert.deepEqual(await run({}, true), { state: 'unsupported' });
});
