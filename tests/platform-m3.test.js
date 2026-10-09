// Modernization M3: the platform boundary (js/platform.js) and its use in app.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { withI18n } = require('./support/i18n.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Platform = require('../js/platform.js');
const app = read('js/app.js');
const region = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));

// A fake Capacitor runtime: every registered plugin records its calls; listeners can be fired by name.
function fakeNative(kind = 'android', overrides = {}) {
  const calls = [];
  const listeners = {};
  const files = new Map();
  const plugins = {
    App: {
      addListener: (event, fn) => { (listeners[event] ||= []).push(fn); return Promise.resolve({ remove() {} }); },
      minimizeApp: () => { calls.push(['App.minimizeApp']); return Promise.resolve(); },
    },
    Filesystem: {
      writeFile: async options => { calls.push(['writeFile', options.path, options.directory, options.recursive]); files.set(options.path, Buffer.from(options.data, 'base64')); return { uri: `file:///cache/${options.path}` }; },
      appendFile: async options => { calls.push(['appendFile', options.path]); files.set(options.path, Buffer.concat([files.get(options.path), Buffer.from(options.data, 'base64')])); },
      getUri: async options => ({ uri: `file:///cache/${options.path}` }),
      deleteFile: async options => { calls.push(['deleteFile', options.path]); files.delete(options.path); },
      rmdir: async options => { calls.push(['rmdir', options.path, options.recursive]); },
    },
    Share: { share: async options => { calls.push(['share', options.files]); if (overrides.shareError) throw new Error(overrides.shareError); return {}; } },
    Browser: { open: async options => { calls.push(['Browser.open', options.url]); } },
  };
  const docListeners = {};
  const env = {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => kind, registerPlugin: name => plugins[name] },
    document: { visibilityState: 'visible', addEventListener: (event, fn, capture) => { (docListeners[event] ||= []).push(fn); } },
    addEventListener() {},
    history: { back: () => calls.push(['history.back']) },
    location: { href: 'capacitor://localhost/#today' },
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    console,
  };
  return { platform: Platform.create(env), calls, listeners, files, docListeners, env };
}

test('on the web the boundary keeps browser behavior', () => {
  assert.equal(Platform.kind, 'web');
  assert.equal(Platform.isNative, false);
  assert.equal(Platform.allowsServiceWorker, true);
  assert.equal(Platform.storage.status(), null, 'the browser persistence check stays in charge');
  assert.equal(Platform.backButton.setHandler(() => true), false, 'no Back handling in a browser');
  assert.equal(Platform.links.interceptExternalLinks({ addEventListener() { throw new Error('must not attach'); } }), false);
  const opened = [];
  Platform.create({ open: (...args) => opened.push(args) }).links.openExternal('https://example.com');
  assert.deepEqual(opened, [['https://example.com', '_blank', 'noopener']]);
});

test('native identity: no service worker, app storage, plugins registered once', () => {
  const { platform } = fakeNative('ios');
  assert.equal(platform.kind, 'ios');
  assert.equal(platform.isNative, true);
  assert.equal(platform.allowsServiceWorker, false);
  assert.deepEqual(platform.storage.status(), { state: 'app' });
  assert.equal(platform.plugin('App'), platform.plugin('App'));
});

test('pause and resume come from the App plugin and visibility, merged into one call', () => {
  const { platform, listeners, docListeners, env } = fakeNative();
  const seen = [];
  platform.lifecycle.onPause(reason => seen.push(`pause:${reason}`));
  platform.lifecycle.onResume(reason => seen.push(`resume:${reason}`));
  listeners.pause[0]();
  env.document.visibilityState = 'hidden'; docListeners.visibilitychange.forEach(fn => fn());
  assert.deepEqual(seen, ['pause:pause'], 'the second signal of the same transition is merged');
  listeners.resume[0]();
  assert.deepEqual(seen, ['pause:pause', 'resume:resume']);
});

test('Android Back: the app handler first, then the previous screen, then minimize', () => {
  const { platform, listeners, calls } = fakeNative('android');
  let handled = true;
  assert.equal(platform.backButton.setHandler(() => handled), true);
  listeners.backButton[0]({ canGoBack: true });
  assert.deepEqual(calls, [], 'a closed overlay consumes Back');
  handled = false;
  listeners.backButton[0]({ canGoBack: true });
  listeners.backButton[0]({ canGoBack: false });
  assert.deepEqual(calls, [['history.back'], ['App.minimizeApp']]);
  assert.equal(fakeNative('ios').platform.backButton.setHandler(() => true), false, 'iOS has no Back button');
});

test('saving a file in the app writes chunks to the cache, shares it and deletes it', async () => {
  const { platform, calls, files } = fakeNative();
  const bytes = crypto.randomBytes(2 * 786432 + 1000);
  const result = await platform.files.saveFile(new Blob([bytes]), 'todo-backup-2026-10-09.zip', 'Backup');
  assert.equal(result, 'shared');
  const writes = calls.filter(([name]) => name === 'writeFile' || name === 'appendFile');
  assert.deepEqual(writes.map(([name]) => name), ['writeFile', 'appendFile', 'appendFile'], 'three chunks');
  const written = calls.find(([name]) => name === 'writeFile');
  assert.match(written[1], /^dailo-share\/\d+-todo-backup-2026-10-09\.zip$/);
  assert.equal(written[2], 'CACHE');
  const share = calls.find(([name]) => name === 'share');
  assert.deepEqual(share[1], [`file:///cache/${written[1]}`]);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(([name, file]) => name === 'deleteFile' && file === written[1]), 'the cached copy is removed');
  assert.equal(files.size, 0);
});

test('the shared file is byte-identical, and a cancelled share is reported, not thrown', async () => {
  const native = fakeNative('ios', { shareError: 'Share canceled' });
  const bytes = crypto.randomBytes(786432 + 17);
  let copy = null;
  const share = native.platform.plugin('Share').share;
  native.platform.plugin('Share').share = async options => { copy = Buffer.from(native.files.get([...native.files.keys()][0])); return share(options); };
  assert.equal(await native.platform.files.saveFile(new Blob([bytes]), 'x.zip'), 'cancelled');
  assert.ok(copy.equals(bytes), 'chunked base64 reassembles to the original bytes');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(native.calls.some(([name]) => name === 'deleteFile'), 'cancelled shares are cleaned up too');
  const failing = fakeNative('ios', { shareError: 'No activity' });
  await assert.rejects(failing.platform.files.saveFile(new Blob([Buffer.from('x')]), 'x.zip'), /No activity/);
});

test('links leave the app: http(s) in the browser sheet, mailto to the mail app, the guide online', () => {
  const { platform, calls, env, docListeners } = fakeNative();
  platform.links.openExternal('https://example.com/a');
  platform.links.openExternal('mailto:me@example.com');
  assert.deepEqual(calls, [['Browser.open', 'https://example.com/a']]);
  assert.equal(env.location.href, 'mailto:me@example.com');
  assert.equal(platform.links.interceptExternalLinks(env.document, { onlinePages: { 'uputstvo.html': 'https://example.com/guide' } }), true);
  const click = (attrs, href) => {
    const anchor = { getAttribute: name => attrs[name] ?? null, href };
    let prevented = false;
    docListeners.click[0]({ target: { closest: () => anchor }, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(click({ href: 'uputstvo.html', target: '_blank' }, 'capacitor://localhost/uputstvo.html'), true);
  assert.equal(click({ href: 'https://example.com/b', target: '_blank' }, 'https://example.com/b'), true);
  assert.equal(click({ href: '#today' }, 'capacitor://localhost/#today'), false, 'in-app routes stay in the app');
  assert.deepEqual(calls.filter(([name]) => name === 'Browser.open').map(([, url]) => url), ['https://example.com/a', 'https://example.com/guide', 'https://example.com/b']);
});

test('the app loads the vendored Capacitor runtime before release.js and the platform before app.js', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(order.indexOf('vendor/capacitor/capacitor.js') < order.indexOf('js/release.js'));
  assert.ok(order.indexOf('js/sync.js') < order.indexOf('js/platform.js') && order.indexOf('js/platform.js') < order.indexOf('js/app.js'));
  const sw = read('sw.js');
  assert.match(sw, /'vendor\/capacitor\/capacitor\.js'/);
  assert.match(sw, /'js\/platform\.js'/);
  const [hash] = read('vendor/capacitor/capacitor.js.sha256').split(/\s+/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/capacitor/capacitor.js'))).digest('hex'), hash, 'vendored file matches its checksum');
  assert.equal(read('vendor/capacitor/VERSION').trim(), '8.5.3');
  assert.ok(fs.existsSync(path.join(root, 'vendor/capacitor/LICENSE')));
});

test('the service worker is skipped (and removed) in the app', () => {
  const block = region('  function registerServiceWorker(', '\n  }\n');
  assert.match(block, /globalThis\.DailoPlatform && !globalThis\.DailoPlatform\.allowsServiceWorker/);
  assert.match(block, /unregister\(\)/);
  assert.ok(block.indexOf('allowsServiceWorker') < block.indexOf("serviceWorker.register('sw.js')"));
});

test('the app reports its own storage instead of the browser persistence state', async () => {
  const ctx = { navigator: { storage: { persisted: async () => false } } };
  vm.createContext(withI18n(ctx));
  ctx.DailoPlatform = { storage: { status: () => ({ state: 'app' }) } };
  vm.runInContext(region('  async function refreshStoragePersistence(', '\n  // Offline shell'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(await ctx.refreshStoragePersistence(true))), { state: 'app' });
  assert.match(read('js/settings-ui.js'), /app: tr\('Kept by the app on this device until the app is removed\. Keep regular backups\.'\)/);
});

test('downloadBackup returns the delivery result; exports and safety ZIPs count only when saved', () => {
  const run = platform => {
    const ctx = { Core: { dateOnly: () => '2026-10-09' }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, setTimeout() {},
      document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } } };
    vm.createContext(withI18n(ctx));
    ctx.DailoPlatform = platform;
    vm.runInContext(region('  function downloadBackup(', '\n  function compactState('), ctx);
    return ctx.downloadBackup(new Blob(['zip']));
  };
  assert.equal(run(undefined), 'downloaded');
  let saved = null;
  assert.equal(run({ isNative: true, files: { saveFile: (blob, name) => { saved = name; return 'cancelled'; } } }), 'cancelled');
  assert.equal(saved, 'todo-backup-2026-10-09.zip');
  const exportAction = region('  async function exportBackupAction(', '\n  function chooseImportBackup(');
  assert.match(exportAction, /if \(await downloadBackup\(blob\) === 'cancelled'\)[\s\S]*msg\('Export cancelled'\)[\s\S]*return;/);
  assert.ok(exportAction.indexOf("'cancelled'") < exportAction.indexOf('lastExport: nowIso()'), 'no lastExport before a confirmed save');
  assert.match(app, /if \(await downloadBackup\(blob\) === 'cancelled'\) throw new Error\(msg\('The safety ZIP was not saved\.'\)\);/);
});

test('attachments open through the share sheet in the app; pause flushes typing; resume and links are wired', () => {
  const open = region('  async function openAttachment(', '\n  }\n');
  assert.ok(open.indexOf('platform?.isNative') < open.indexOf('attachmentOpensInline'), 'native first, then the web rules');
  assert.match(open, /platform\.files\.openFile\(record\.blob, record\.fileName\)/);
  assert.match(app, /globalThis\.DailoPlatform\.lifecycle\.onPause\(flushPendingWork\);\n\s+else window\.addEventListener\('pagehide', flushPendingWork\);/);
  const calls = [];
  const ctx = { globalOperation: null, state: {}, modalState: null, getTask: id => ({ id, recurring: id === 'r' }), taskRecurrence: task => task.recurring,
    flushTaskDraft: () => calls.push('draft'), flushTextSave: () => calls.push('text'), saveState: () => calls.push('save') };
  vm.createContext(ctx);
  vm.runInContext(region('  function flushPendingWork(', '\n  }\n') + '\n  }', ctx);
  ctx.flushPendingWork('hidden');
  assert.deepEqual(calls.splice(0), ['draft', 'text', 'save'], 'hidden or paused: drafts and typing are saved');
  ctx.modalState = { type: 'task', taskId: 'r' };
  ctx.flushPendingWork('pause');
  assert.deepEqual(calls.splice(0), ['text', 'save'], 'a recurring draft does not open the scope question in the background');
  ctx.flushPendingWork('pagehide');
  assert.deepEqual(calls.splice(0), ['draft', 'text', 'save'], 'an unloading page still flushes it, as before');
  ctx.globalOperation = {}; ctx.flushPendingWork('hidden');
  assert.deepEqual(calls, [], 'nothing during a global operation');
  const start = region('  function startPlatform(', '\n  }\n');
  assert.match(start, /onResume\(resumeApp\)/);
  assert.match(start, /'uputstvo\.html': Release\.GUIDE_URL/);
  assert.match(start, /cleanupSharedFiles\(\)/);
  assert.match(region('  async function init(', '\n  window.TodoApp'), /registerServiceWorker\(\);\n\s+startPlatform\(\);/);
  assert.equal(require('../js/release.js').GUIDE_URL, 'https://marko-ivapix.github.io/dailo/uputstvo.html');
});

test('resume runs the day change, reminders and a sync without waiting for the 30-second timer', () => {
  const calls = [];
  const ctx = { Core: { dateOnly: () => '2026-10-10' }, lastToday: '2026-10-09', globalOperation: null, startupPromise: null, recovery: null, state: {},
    refreshHabitDateBoundary: async () => calls.push('boundary'), checkReminders: () => calls.push('reminders'), scheduleSync: delay => calls.push(`sync:${delay}`), console };
  vm.createContext(ctx);
  vm.runInContext(region('  function resumeApp(', '\n  // Native integration'), ctx);
  ctx.resumeApp();
  assert.deepEqual(calls, ['boundary', 'sync:500']);
  assert.equal(ctx.lastToday, '2026-10-10');
  ctx.resumeApp();
  assert.deepEqual(calls, ['boundary', 'sync:500', 'reminders', 'sync:500'], 'same day: only reminders');
  ctx.state = null; ctx.resumeApp();
  assert.equal(calls.length, 4, 'nothing runs before the data is loaded');
});
