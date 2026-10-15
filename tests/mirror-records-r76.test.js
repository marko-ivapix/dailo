// R76: on the phone the durable mirror (M5) also keeps habit logs and goal history as files in the app's Library
// directory. They live in IndexedDB, which the system can clear together with the WebView store. A file is written
// only when its records changed, and the records come back only with a restored metadata text, into empty stores, in
// one transaction (all or nothing).
// Spec: docs/superpowers/specs/2026-10-15-r76-mirror-records.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Platform = require('../js/platform.js');
global.__TODO_TEST_MEMORY_DB__ = true;
global.TodoCore = require('../js/core.js');
const Storage = require('../js/storage.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const region = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));
const plain = value => JSON.parse(JSON.stringify(value));

function nativeFs({ failRename = false } = {}) {
  const files = new Map();
  const calls = [];
  const fsPlugin = {
    writeFile: async ({ path: file, data, directory, encoding }) => { calls.push(['write', file, directory, encoding]); files.set(file, data); },
    deleteFile: async ({ path: file }) => { calls.push(['delete', file]); if (!files.delete(file)) throw new Error('missing'); },
    rename: async ({ from, to, directory, toDirectory }) => { calls.push(['rename', from, to, directory, toDirectory]); if (failRename) throw new Error('rename failed'); files.set(to, files.get(from)); files.delete(from); },
    readFile: async ({ path: file }) => { if (!files.has(file)) throw new Error('missing'); return { data: files.get(file) }; },
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: () => fsPlugin }, console });
  return { platform, files, calls };
}

const log = (id, date, status = 'done') => ({ id, habitId: 'h1', date, status, createdAt: '2026-10-14T08:00:00.000Z', updatedAt: '2026-10-14T08:00:00.000Z' });
const event = id => ({ id, goalId: 'g1', type: 'progress', data: { value: 3 }, createdAt: '2026-10-14T08:00:00.000Z' });

test('habit logs and goal history get their own files, written through a temporary file', async () => {
  const { platform, files, calls } = nativeFs();
  assert.equal(await platform.durable.writeRecords('habitLogs', JSON.stringify([log('l1', '2026-10-14')])), true);
  assert.deepEqual(calls, [
    ['write', 'dailo/habit-logs.json.tmp', 'LIBRARY', 'utf8'],
    ['delete', 'dailo/habit-logs.json'],
    ['rename', 'dailo/habit-logs.json.tmp', 'dailo/habit-logs.json', 'LIBRARY', 'LIBRARY'],
  ]);
  assert.equal(await platform.durable.writeRecords('goalHistory', JSON.stringify([event('e1')])), true);
  assert.ok(files.has('dailo/goal-history.json'));
  assert.deepEqual(plain(await platform.durable.readRecords('habitLogs')), [log('l1', '2026-10-14')]);
  assert.deepEqual(plain(await platform.durable.readRecords('goalHistory')), [event('e1')]);
  assert.equal(await platform.durable.readRecords('attachments'), null, 'files are not mirrored');
  assert.equal(await platform.durable.writeRecords('attachments', '[]'), false);
});

test('only an array of records is written; reading falls back to the temporary file', async () => {
  const { platform } = nativeFs();
  for (const text of ['{"a":1}', '[1,2]', 'not json', '[null]']) assert.equal(await platform.durable.writeRecords('habitLogs', text), false, text);
  assert.equal(await platform.durable.readRecords('habitLogs'), null);
  const broken = nativeFs({ failRename: true });
  await assert.rejects(broken.platform.durable.writeRecords('habitLogs', JSON.stringify([log('l2', '2026-10-13')])), /rename failed/);
  assert.deepEqual(plain(await broken.platform.durable.readRecords('habitLogs')), [log('l2', '2026-10-13')]);
  assert.equal(await Platform.durable.writeRecords('habitLogs', '[]'), false, 'the web has no mirror');
  assert.equal(await Platform.durable.readRecords('habitLogs'), null);
});

test('the stores take mirrored records back only when empty, all or nothing', async () => {
  await Storage.clearAllForTests();
  assert.equal(await Storage.habitLogs.fillEmpty([log('l1', '2026-10-13'), log('l2', '2026-10-14')]), 2);
  assert.deepEqual((await Storage.habitLogs.listAll()).map(record => record.id).sort(), ['l1', 'l2']);
  assert.equal(await Storage.habitLogs.fillEmpty([log('l3', '2026-10-12')]), 0, 'a store with records is left alone');
  assert.equal((await Storage.habitLogs.listAll()).length, 2);
  assert.equal(await Storage.goalHistory.fillEmpty([event('e1')]), 1);
  await Storage.clearAllForTests();
  await assert.rejects(Storage.habitLogs.fillEmpty([log('l1', '2026-10-13'), { id: 'bad' }]), /Invalid stored record/);
  assert.equal((await Storage.habitLogs.listAll()).length, 0, 'nothing is written when one record is invalid');
});

function appHarness({ stored = null, mirror = null, records = {}, logs = [], history = [] } = {}) {
  const storage = new Map(stored === null ? [] : [['todoAppData', stored]]);
  const writes = [];
  const fills = [];
  const ctx = {
    STORAGE_KEY: 'todoAppData', console, JSON,
    localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout: () => 0, clearTimeout() {},
    TodoStorage: {
      habitLogs: { listAll: async () => logs, fillEmpty: async list => { fills.push(['habitLogs', list.length]); return list.length; } },
      goalHistory: { listAll: async () => history, fillEmpty: async list => { fills.push(['goalHistory', list.length]); return list.length; } },
    },
  };
  vm.createContext(ctx);
  ctx.globalThis = ctx;
  ctx.DailoPlatform = { isNative: true, durable: {
    write: async text => { writes.push(['state', text]); return true; }, read: async () => mirror,
    writeRecords: async (kind, text) => { writes.push([kind, text]); return true; }, readRecords: async kind => records[kind] ?? null,
  } };
  vm.runInContext(region('  // Native durable mirror', '\n  // Typing and drafts'), ctx);
  return { ctx, storage, writes, fills };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test('the app mirrors the records with the state, and writes a file again only when its records changed', async () => {
  const h = appHarness({ stored: '{"version":3}', logs: [log('l1', '2026-10-14')], history: [event('e1')] });
  h.ctx.writeDurableMirror(); await settle();
  assert.deepEqual(h.writes.map(([kind]) => kind), ['state', 'habitLogs', 'goalHistory']);
  h.ctx.writeDurableMirror(); await settle();
  assert.deepEqual(h.writes.map(([kind]) => kind), ['state', 'habitLogs', 'goalHistory', 'state'], 'unchanged records are not written again');
  h.ctx.TodoStorage.habitLogs.listAll = async () => [log('l1', '2026-10-14'), log('l2', '2026-10-15')];
  h.ctx.writeDurableMirror(); await settle();
  assert.deepEqual(h.writes.slice(4).map(([kind]) => kind), ['state', 'habitLogs']);
  assert.equal(JSON.parse(h.writes.at(-1)[1]).length, 2);
});

test('the records come back only together with a restored state', async () => {
  const records = { habitLogs: [log('l1', '2026-10-14')], goalHistory: [event('e1'), event('e2')] };
  const missing = appHarness({ stored: null, mirror: '{"version":3}', records });
  assert.equal(await missing.ctx.restoreDurableMirror(), true);
  assert.deepEqual(missing.fills, [['habitLogs', 1], ['goalHistory', 2]]);
  const present = appHarness({ stored: '{"version":3}', mirror: '{"version":3}', records });
  assert.equal(await present.ctx.restoreDurableMirror(), false);
  assert.deepEqual(present.fills, [], 'a device with its data keeps its stores as they are');
});

test('R76 shipped as 2.0.0-alpha.103 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 103) >= 103);
});
