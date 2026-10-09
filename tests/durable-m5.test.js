// Modernization M5: the native durable mirror of the canonical metadata (DailoPlatform.durable + app.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Platform = require('../js/platform.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const region = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));

function nativeFs({ failRename = false } = {}) {
  const files = new Map();
  const calls = [];
  const fsPlugin = {
    writeFile: async ({ path: file, data, directory, encoding }) => { calls.push(['write', file, directory, encoding]); files.set(file, data); },
    deleteFile: async ({ path: file }) => { calls.push(['delete', file]); if (!files.delete(file)) throw new Error('missing'); },
    rename: async ({ from, to, directory, toDirectory }) => { calls.push(['rename', from, to, directory, toDirectory]); if (failRename) throw new Error('rename failed'); files.set(to, files.get(from)); files.delete(from); },
    readFile: async ({ path: file, encoding }) => { if (!files.has(file)) throw new Error('missing'); return { data: files.get(file) }; },
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', registerPlugin: () => fsPlugin }, console });
  return { platform, files, calls };
}

test('the mirror is written through a temporary file into the Library directory', async () => {
  const { platform, files, calls } = nativeFs();
  assert.equal(await platform.durable.write('{"version":3,"tasks":[]}'), true);
  assert.deepEqual(calls, [
    ['write', 'dailo/state.json.tmp', 'LIBRARY', 'utf8'],
    ['delete', 'dailo/state.json'],
    ['rename', 'dailo/state.json.tmp', 'dailo/state.json', 'LIBRARY', 'LIBRARY'],
  ]);
  assert.deepEqual([...files.keys()], ['dailo/state.json']);
  assert.equal(await platform.durable.read(), '{"version":3,"tasks":[]}');
});

test('an interrupted replace still leaves a readable copy', async () => {
  const { platform, files } = nativeFs({ failRename: true });
  files.set('dailo/state.json', '{"version":3,"old":true}');
  await assert.rejects(platform.durable.write('{"version":3,"new":true}'), /rename failed/);
  assert.equal(await platform.durable.read(), '{"version":3,"new":true}', 'the temporary file is used when the main one is gone');
});

test('writes are queued and invalid text is never written; a corrupt mirror is ignored', async () => {
  const { platform, files, calls } = nativeFs();
  await Promise.all([platform.durable.write('{"n":1}'), platform.durable.write('{"n":2}')]);
  assert.equal(files.get('dailo/state.json'), '{"n":2}', 'the later write wins');
  assert.deepEqual(calls.map(([name]) => name), ['write', 'delete', 'rename', 'write', 'delete', 'rename'], 'no interleaving');
  assert.equal(await platform.durable.write('not json'), false);
  assert.equal(await platform.durable.write('[1,2]'), false);
  files.set('dailo/state.json', '{broken');
  files.delete('dailo/state.json.tmp');
  assert.equal(await platform.durable.read(), null);
});

test('the web has no mirror', async () => {
  assert.equal(await Platform.durable.write('{"a":1}'), false);
  assert.equal(await Platform.durable.read(), null);
});

function appHarness({ native = true, stored = null, mirror = null } = {}) {
  const storage = new Map(stored === null ? [] : [['todoAppData', stored]]);
  const writes = [];
  const timers = [];
  const ctx = {
    STORAGE_KEY: 'todoAppData', console,
    localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
  };
  vm.createContext(ctx);
  ctx.DailoPlatform = { isNative: native, durable: { write: async text => { writes.push(text); return true; }, read: async () => mirror } };
  vm.runInContext(region('  // Native durable mirror', '\n  // Typing and drafts'), ctx);
  return { ctx, storage, writes, timers };
}

test('the app mirrors the canonical text after saves (debounced) and restores it only when it is missing', async () => {
  const saved = appHarness({ stored: '{"version":3,"tasks":[1]}' });
  saved.ctx.scheduleDurableMirror();
  saved.ctx.scheduleDurableMirror();
  assert.equal(saved.timers.length, 2);
  assert.equal(saved.timers[1].delay, 1000);
  saved.timers[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved.writes, ['{"version":3,"tasks":[1]}']);
  saved.ctx.writeDurableMirror();
  assert.equal(saved.writes.length, 2, 'a pause writes at once');

  const missing = appHarness({ stored: null, mirror: '{"version":3,"tasks":[2]}' });
  assert.equal(await missing.ctx.restoreDurableMirror(), true);
  assert.equal(missing.storage.get('todoAppData'), '{"version":3,"tasks":[2]}', 'the normal load then validates and migrates it');

  const present = appHarness({ stored: '{"version":3,"tasks":[3]}', mirror: '{"version":3,"tasks":[2]}' });
  assert.equal(await present.ctx.restoreDurableMirror(), false, 'existing data is never replaced by the mirror');
  assert.equal(present.storage.get('todoAppData'), '{"version":3,"tasks":[3]}');

  const web = appHarness({ native: false, stored: null, mirror: '{"x":1}' });
  web.ctx.scheduleDurableMirror();
  assert.equal(web.timers.length, 0);
  assert.equal(await web.ctx.restoreDurableMirror(), false);
});

test('the mirror is refreshed after saves, start-up loads, restores and on pause; restore runs before loading', () => {
  const native = 'if \\(globalThis\\.DailoPlatform\\?\\.isNative\\) ';
  assert.match(region('  function saveState(', '\n  }\n'), new RegExp(`storageError = false;\\n\\s+${native}scheduleDurableMirror\\(\\);`));
  assert.match(app, new RegExp(`canonicalRaw = committedSource;\\n\\s+${native}scheduleDurableMirror\\(\\);`));
  assert.match(app, new RegExp(`if \\(!op\\.selective\\) forgetSyncShadow\\(\\);\\n\\s+${native}scheduleDurableMirror\\(\\);`));
  assert.match(region('  function flushPendingWork(', '\n  }\n'), /writeDurableMirror\(\)/);
  assert.match(region('  async function init(', '\n  window.TodoApp'), /await restoreDurableMirror\(\)[\s\S]*await startReady\(\);/);
});
