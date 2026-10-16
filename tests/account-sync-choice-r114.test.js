// R114: step 3c of the module plan, narrowed. What the account does around the sync joins js/account-ui.js: finishing
// a sign-in on the device's sync record (completeSignIn), "Odjavi se" (signOutSync, signOutToWelcome), deleting the
// account, and the first-sync choice (open, draw, choose). The sync itself stays in app.js: applySyncResult replaces
// the app's state and the archive, and scheduleSync runs on every save, so moving it would hand a module the state
// itself and route every save through it; js/sync.js already holds the sync's pure part. Nothing changes for the user.
// Spec: docs/superpowers/specs/2026-10-16-r114-account-sync-choice.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource, contextKeys } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const MOVED = ['completeSignIn', 'signOutSync', 'signOutToWelcome', 'deleteSyncAccount', 'openSyncChoice', 'renderSyncChoice', 'chooseSyncMode'];
const STAY = ['scheduleSync', 'runSync', 'applySyncResult', 'forgetSyncShadow', 'syncAttachmentList', 'syncView', 'syncStatus', 'connectLiveSync', 'startSync', 'runServerCheck', 'journalCipherStored', 'deviceJournalKey', 'storeJournalKey', 'forgetJournalKey', 'journalSyncOptions', 'afterJournalSync', 'loadArchive', 'archiveOldTasks'];

function loadModule(storage = {}) {
  let adapter;
  const sandbox = withI18n({ window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoSync: null, TodoStorage: storage }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, clearTimeout() {}, console });
  vm.runInNewContext(read('js/account-ui.js'), sandbox);
  return { adapter, sandbox };
}

test('the account side of the sync left app.js; the sync itself stays', () => {
  for (const name of MOVED) {
    assert.equal(functionSource(name).file, 'js/account-ui.js', name);
    assert.doesNotMatch(app, new RegExp(`\\n  (async )?function ${name}\\(`), `${name} left app.js`);
  }
  for (const name of STAY) assert.equal(functionSource(name).file, 'js/app.js', name);
  for (const action of ["action === 'sync-sign-out'", "action === 'sync-delete-account'", "action === 'sync-choose'"]) assert.ok(!app.includes(action), `app.js no longer handles ${action}`);
  assert.doesNotMatch(fn('renderModal'), /renderSyncChoice/);
  assert.match(fn('runSync'), /\n      accountAction\('sync-choice-open'\);\n/);
});

test('the module answers the window and takes only what the context gives', () => {
  const module = read('js/account-ui.js');
  assert.match(module, /window\.TodoDomainModules\?\.register\(\{\n    name: 'account',\n    renderRoute,\n    handleAction,\n  \}\);/);
  assert.match(app, /\n      \/\/ R114: what signing out, deleting the account and the first-sync choice need[^\n]*\n      liveSync, SYNC_META_KEY, plainWord, get syncTimer\(\) \{ return syncTimer; \},\n/);
  const taken = functionSource('use', ['js/account-ui.js']).source.match(/\(\{ ([^}]+) \} = ctx\);/)[1].split(', ');
  const keys = contextKeys();
  for (const name of taken) assert.ok(keys.has(name), `domainContext gives ${name}`);
  assert.ok(!taken.includes('completeSignIn') && !keys.has('completeSignIn'), 'completeSignIn is the module\'s own now');
  const code = module.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /(?<![\w$'"])(?<![^.]\.)(state|modalState|syncMeta|modalReturnFocus|syncRunning|syncTimer)\b(?!:)/, 'only through app.');
  assert.doesNotMatch(code, /app\.(modalState|syncMeta|modalReturnFocus|syncTimer) = /);
});

test('in the module: the first-sync choice opens, draws, cancels into a sign-out, and a choice runs the sync', async () => {
  const snapshots = [];
  const { adapter } = loadModule({ createAutomaticSnapshot: async (state, at, options) => { snapshots.push([state, options]); } });
  const calls = [];
  const live = { state: { tasks: [] }, modalState: null, syncMeta: { session: { accessToken: 'a' } } };
  const ctx = {
    get state() { return live.state; }, get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; },
    get syncMeta() { return live.syncMeta; }, setSyncMeta(value) { live.syncMeta = value; }, get syncTimer() { return 7; },
    syncClient: { signOut: async () => calls.push('server sign-out') }, loadSyncMeta: () => ({ session: { accessToken: 'a' } }), SYNC_META_KEY: 'dailoSync',
    liveSync: { disconnect: () => calls.push('disconnect') }, forgetJournalKey: () => calls.push('forget key'),
    captureModalReturnFocus() {}, closePopover() {}, renderModal: () => calls.push('renderModal'), render: () => calls.push('render'),
    modalFrame: html => `<frame>${html}</frame>`, runSync: async mode => calls.push(['sync', mode]), setToastMessage: message => calls.push(['toast', message]),
  };
  assert.equal(adapter.handleAction('sync-choice-open', null, ctx), true);
  assert.equal(live.modalState.type, 'sync-choice');
  const html = adapter.renderRoute({ type: 'modal', modalType: 'sync-choice' }, ctx);
  assert.match(html, /^<frame><div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Data on this device and in your account<\/h2>/);
  for (const mode of ['merge', 'server', 'device']) assert.ok(html.includes(`data-action="sync-choose" data-mode="${mode}"`), mode);
  assert.equal(adapter.renderRoute({ type: 'today' }, ctx), undefined);
  calls.length = 0;
  await live.modalState.onCancel();
  assert.equal(live.modalState, null);
  assert.deepEqual(calls, ['renderModal', 'disconnect', 'forget key', 'render', 'server sign-out'], 'cancel signs out');
  assert.deepEqual(JSON.parse(JSON.stringify(live.syncMeta)), {}, 'the sync record is emptied');
  adapter.handleAction('sync-choice-open', null, ctx);
  calls.length = 0;
  assert.equal(adapter.handleAction('sync-choose', { target: { closest: () => ({ dataset: { mode: 'merge' } }) } }, ctx), true);
  for (let i = 0; i < 20 && !calls.some(call => call[0] === 'sync'); i += 1) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots.map(([, options]) => options))), [{ force: true }], 'a recovery copy first');
  assert.deepEqual(calls, ['renderModal', ['sync', 'merge']]);
  assert.equal(adapter.handleAction('sync-now', null, ctx), undefined, 'the sync itself is app.js\'s');
});

test('the plan records 3c and says why the sync itself stays', () => {
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R114 \| [^\n]+ \| `js\/account-ui\.js` \| `2\.0\.0-alpha\.144` \|/);
  assert.ok(plan.includes('3c. done in R114'));
  assert.ok(plan.includes('The sync itself stays in `app.js`'));
});

test('R114 is released as 2.0.0-alpha.144', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.144');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.144';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.144');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['2.0.0-alpha.144', '2.0.0-alpha.144']);
  assert.ok(read('novo.html').includes('2.0.0-alpha.144'));
});
