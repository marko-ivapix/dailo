// M12: audit fixes S-4 (colors), E-1 (export limits), R-3 (device-local reminder state), A-2 (focus and title).
// Spec: docs/superpowers/specs/2026-10-10-audit-fixes-m12.md
process.env.TZ = 'Europe/Belgrade';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = (source, name) => { const start = source.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
const NOW = '2026-10-10T08:00:00.000Z';

// --- S-4 ---------------------------------------------------------------------------------------------

test('S-4: only hex colors are accepted', () => {
  for (const color of ['#5362FF', '#30cbad', '#abc']) assert.equal(Core.safeColor(color, '#000000'), color);
  for (const color of ['red', 'red;background:url(x)', '#12345', '#1234567', 'url(#a)', '', null, 42]) assert.equal(Core.safeColor(color, '#000000'), '#000000', String(color));
});

test('S-4: loads, imports and sync replace bad project, tag and area colors; templates too', () => {
  const normalize = app.slice(app.indexOf('  function normalizeState('), app.indexOf('    next.habits = (next.habits || []).map('));
  assert.match(normalize, /color: Core\.safeColor\(tag\.color, PROJECT_COLORS\[i % PROJECT_COLORS\.length\]\)/);
  assert.match(normalize, /color: Core\.safeColor\(p\.color, PROJECT_COLORS\[i % PROJECT_COLORS\.length\]\)/);
  assert.match(normalize, /color: Core\.safeColor\(area\.color, PROJECT_COLORS\[i % PROJECT_COLORS\.length\]\)/);
  const made = Core.instantiateTemplate({ type: 'project', data: { name: 'P', color: 'red;background:url(x)' } }, '2026-10-10');
  assert.equal(made.project.color, '#5362FF');
});

// --- E-1 ---------------------------------------------------------------------------------------------

const exportState = () => Core.normalizeState({ ...Core.migrateStateV3({ version: 2, tasks: [], projects: [], tags: [], settings: {}, ui: {} }).state, tasks: [{ id: 'task', title: 'Task', attachmentIds: ['file'], createdAt: NOW, updatedAt: NOW }] });
const exportStorage = () => ({
  attachments: { getMany: async () => [{ id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 8, blob: new Blob(['12345678'], { type: 'text/plain' }) }] },
  habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] },
});

test('E-1: export and import share raised limits', () => {
  assert.deepEqual({ ...Backup.LIMITS }, { maxZipEntries: 2000, maxAttachments: 1000, maxAttachmentBytes: 250 * 1024 * 1024, maxDecompressedBytes: 300 * 1024 * 1024 });
});

test('E-1: the export stops before it builds a backup the import would refuse', async () => {
  await assert.rejects(Backup.exportBackupV3(exportState(), exportStorage(), NOW, { limits: { maxAttachments: 0 } }), /attachment count/i);
  await assert.rejects(Backup.exportBackupV3(exportState(), exportStorage(), NOW, { limits: { maxAttachmentBytes: 4 } }), /attachment bytes/i);
  await assert.rejects(Backup.exportBackupV3(exportState(), exportStorage(), NOW, { limits: { maxDecompressedBytes: 64 } }), /decompressed/i);
  await assert.rejects(Backup.exportBackupV3(exportState(), exportStorage(), NOW, { limits: { maxZipEntries: 1 } }), /entry/i);
  const blob = await Backup.exportBackupV3(exportState(), exportStorage(), NOW);
  const inspected = await Backup.inspectBackupV3(blob);
  assert.deepEqual(inspected.state.tasks.map(task => task.id), ['task'], 'what the export accepts, the import accepts');
});

// --- R-3 ---------------------------------------------------------------------------------------------

const base = (extra = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {}, ...extra });
const firedTask = (extra = {}) => ({ id: 't1', title: 'Call', reminderAt: '2026-10-10T09:00:00', reminderFiredAt: '2026-10-10T07:05:00.000Z', attachmentIds: [], updatedAt: NOW, ...extra });

test('R-3: fired markers never leave the device', () => {
  const records = Sync.collectRecords(base({
    tasks: [firedTask()],
    goals: [{ id: 'g1', title: 'G', reminderFiredMoments: ['2026-10-09T09:00:00'], updatedAt: NOW }],
    habits: [{ id: 'h1', name: 'H', reminderFiredMoments: ['2026-10-10T07:30:00'], updatedAt: NOW }],
  }));
  assert.equal('reminderFiredAt' in records.get('tasks/t1').data, false);
  assert.equal('reminderFiredMoments' in records.get('goals/g1').data, false);
  assert.equal('reminderFiredMoments' in records.get('habits/h1').data, false);
});

test('R-3: a pull keeps this device’s fired markers and ignores those of older clients', () => {
  const local = base({ tasks: [firedTask()] });
  const remote = { type: 'tasks', id: 't1', deleted: false, updated_at: NOW, data: { ...firedTask(), reminderFiredAt: null } };
  delete remote.data.attachmentIds;
  const same = Sync.applyRemote(local, [], [remote]);
  assert.equal(same.changed, false, 'only a device field differs');
  const edited = Sync.applyRemote(local, [], [{ ...remote, data: { ...remote.data, title: 'Call Ana' } }]);
  assert.equal(edited.state.tasks[0].title, 'Call Ana');
  assert.equal(edited.state.tasks[0].reminderFiredAt, firedTask().reminderFiredAt, 'this device keeps its marker');
  const fresh = Sync.applyRemote(base(), [], [{ type: 'goals', id: 'g1', deleted: false, updated_at: NOW, data: { id: 'g1', title: 'G', reminderFiredMoments: ['x'] } }]);
  assert.deepEqual(fresh.state.goals[0].reminderFiredMoments, [], 'a new record starts with this device’s own (empty) markers');
});

function fakeServer() {
  const rows = new Map();
  let clock = 1;
  const pushes = [];
  const stamp = () => new Date(Date.UTC(2026, 9, 10, 0, 0, clock++)).toISOString();
  return {
    rows, pushes,
    client: {
      ensureSession: async session => session,
      push: async (_session, records) => { pushes.push(records.map(record => `${record.type}/${record.id}`)); for (const r of records) rows.set(`${r.type}/${r.id}`, { type: r.type, id: r.id, data: r.deleted ? null : r.data, deleted: Boolean(r.deleted), updated_at: stamp() }); },
      pull: async (_session, since) => [...rows.values()].filter(r => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)),
    },
  };
}

test('R-3: a reminder firing is not pushed', async () => {
  const server = fakeServer();
  let state = base({ tasks: [firedTask({ reminderFiredAt: null })] });
  const local = { readLocal: async () => ({ state, habitLogs: [] }), writeLocal: async result => { state = result.state; } };
  const meta = { session: { accessToken: 'x' } };
  await Sync.syncOnce({ client: server.client, meta, ...local });
  assert.equal(meta.shadowFormat, 2);
  const pushesBefore = server.pushes.length;
  state = { ...state, tasks: [{ ...state.tasks[0], reminderFiredAt: NOW }] };
  assert.equal((await Sync.syncOnce({ client: server.client, meta, ...local })).status, 'ok');
  assert.equal(server.pushes.length, pushesBefore, 'nothing to push');
});

test('R-3: an older shadow is upgraded without pushing unchanged records', async () => {
  const server = fakeServer();
  const task = firedTask();
  const legacyData = { ...task }; delete legacyData.attachmentIds;
  server.rows.set('tasks/t1', { type: 'tasks', id: 't1', data: legacyData, deleted: false, updated_at: '2026-10-10T00:00:00.000Z' });
  let state = base({ tasks: [task] });
  const local = { readLocal: async () => ({ state, habitLogs: [] }), writeLocal: async result => { state = result.state; } };
  const settingsHash = Sync.hashRecord(Sync.collectRecords(state).get('settings/settings').data);
  const meta = { session: { accessToken: 'x' }, shadow: { 'tasks/t1': Sync.hashRecord(legacyData), 'settings/settings': settingsHash }, cursor: '2026-10-10T00:00:00.000Z' };
  assert.equal((await Sync.syncOnce({ client: server.client, meta, ...local })).status, 'ok');
  assert.deepEqual(server.pushes, [], 'unchanged since the last sync: no push');
  assert.equal(meta.shadowFormat, 2);
  assert.equal(meta.shadow['tasks/t1'], Sync.hashRecord(Sync.collectRecords(state).get('tasks/t1').data));
});

test('R-3: a task reminder counts as fired only up to its own moment', () => {
  assert.equal(Core.taskReminderFired(firedTask({ reminderAt: '2026-10-10T09:00:00', reminderFiredAt: new Date(2026, 9, 10, 9, 0, 5).toISOString() })), true);
  assert.equal(Core.taskReminderFired(firedTask({ reminderAt: '2026-10-10T18:00:00', reminderFiredAt: new Date(2026, 9, 10, 9, 0, 5).toISOString() })), false, 'moved later on another device');
  assert.equal(Core.taskReminderFired(firedTask({ reminderFiredAt: null })), false);
  const due = firedTask({ reminderAt: '2026-10-10T18:00:00', reminderFiredAt: new Date(2026, 9, 10, 9, 0, 5).toISOString() });
  assert.equal(Core.isReminderDue(due, new Date(2026, 9, 10, 18, 1).toISOString()), true);
  assert.equal(Core.notificationPlan(base({ tasks: [due] }), new Date(2026, 9, 10, 10, 0).toISOString()).length, 1);
});

test('R-3: records that first arrive through sync do not replay past reminders', () => {
  const now = new Date(2026, 9, 10, 10, 0).toISOString();
  const previous = base({ tasks: [{ id: 'old', reminderAt: '2026-10-10T08:00:00', reminderFiredAt: null }] });
  const next = base({
    tasks: [{ id: 'old', reminderAt: '2026-10-10T08:00:00', reminderFiredAt: null }, { id: 'past', reminderAt: '2026-10-10T08:00:00', reminderFiredAt: null }, { id: 'future', reminderAt: '2026-10-10T18:00:00', reminderFiredAt: null }],
    goals: [{ id: 'g', status: 'active', targetDate: '2026-10-12', reminders: { threeDaysBefore: true, onTargetDate: true, time: '09:00' }, reminderFiredMoments: [] }],
    habits: [{ id: 'h', status: 'active', frequencyType: 'daily', startDate: '2026-10-01', reminders: [{ time: '07:30', enabled: true }, { time: '20:00', enabled: true }], reminderFiredMoments: [] }],
  });
  const settled = Core.settleArrivedReminders(previous, next, now);
  const byId = Object.fromEntries(settled.tasks.map(task => [task.id, task.reminderFiredAt]));
  assert.deepEqual(byId, { old: null, past: now, future: null }, 'only records new to this device');
  assert.deepEqual(settled.goals[0].reminderFiredMoments, ['2026-10-09T09:00:00']);
  assert.deepEqual(settled.habits[0].reminderFiredMoments, ['2026-10-10T07:30:00']);
  assert.match(fn(app, 'applySyncResult'), /Core\.settleArrivedReminders\(previous, Core\.pruneDanglingReferences\(result\.state\), nowIso\(\)\)/);
});

test('R-3: the reminder checker does not bump updatedAt for a firing', () => {
  const checker = fn(app, 'checkReminders');
  assert.doesNotMatch(checker, /task\.updatedAt = now/);
  assert.doesNotMatch(checker, /goal\.updatedAt = now/);
  assert.match(checker, /if \(snooze\) \{ habit\.pendingSnoozeAt = null; habit\.snoozedUntil = null; habit\.updatedAt = now; \}/);
  assert.doesNotMatch(checker, /\n\s+habit\.updatedAt = now;\n/);
});

// --- A-2 ---------------------------------------------------------------------------------------------

test('A-2: the focused control is found again by id or data attributes', () => {
  const ctx = { CSS: { escape: value => String(value) }, HTMLElement: class {}, document: { body: {} } };
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/  const FOCUS_KEYS = [^\n]+\n/)[0]}${fn(app, 'focusDescriptor')}`, ctx);
  const element = (fields) => Object.assign(Object.create(ctx.HTMLElement.prototype), { id: '', dataset: {}, tagName: 'BUTTON', closest: () => ({ id: 'main' }) }, fields);
  assert.equal(ctx.focusDescriptor(element({ id: 'quick-title' })), '#quick-title');
  assert.equal(ctx.focusDescriptor(element({ dataset: { action: 'toggle-task', taskId: 't1' } })), '#main button[data-action="toggle-task"][data-task-id="t1"]', 'searched within its own region');
  assert.equal(ctx.focusDescriptor(element({ dataset: {} })), null, 'nothing stable to find it by');
  assert.equal(ctx.focusDescriptor(element({ id: 'x', closest: () => null })), null, 'only the re-rendered regions');
  assert.equal(ctx.focusDescriptor(ctx.document.body), null);
});

test('A-2: render restores lost focus, names the page and moves focus to the heading on a route change', () => {
  const render = fn(app, 'render');
  assert.match(render, /const focused = focusDescriptor\(document\.activeElement\);/);
  assert.match(render, /renderView\(\);/);
  assert.match(render, /announceRoute\(/);
  const announce = fn(app, 'announceRoute');
  assert.match(announce, /document\.title = /);
  assert.match(announce, /heading\.setAttribute\('tabindex', '-1'\)/);
  assert.match(announce, /if \(moveFocus && !modalState/);
});

test('M12 shipped as 2.0.0-alpha.4 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.([4-9]|\d{2,})$|^2\.\d+\.\d+/);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
