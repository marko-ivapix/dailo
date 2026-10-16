// R113: part 3b of the module plan. The account windows join js/account-ui.js: Nalog's "Promeni lozinku" and
// "Promeni e-adresu" (R43) and the journal password window (R51: turn encryption on, unlock, turn it off), which share
// one form and one way to close. They read the live state through the domain context, as the welcome screen does
// (R112), and app.js asks the module for the sent form by name. The journal key helpers, completeSignIn and the sync
// stay in app.js for the last step, which also takes signing out, deleting the account, the first-sync choice and the
// server check. Nothing changes for the user.
// Spec: docs/superpowers/specs/2026-10-16-r113-account-windows.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
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
const MOVED = ['openAccountWindow', 'setAccountWindow', 'accountFields', 'currentSession', 'closeAccountWindow', 'accountSubmit', 'accountPasswordSubmit', 'accountEmailSubmit', 'openJournalCipherWindow', 'setJournalWindow', 'journalCipherSubmit'];
const STAY = ['completeSignIn', 'journalCipherStored', 'journalCipherStatus', 'deviceJournalKey', 'storeJournalKey', 'forgetJournalKey', 'journalSyncOptions', 'afterJournalSync', 'runServerCheck', 'signOutSync', 'signOutToWelcome', 'deleteSyncAccount', 'openSyncChoice', 'renderSyncChoice', 'chooseSyncMode'];

function loadModule() {
  let adapter;
  const sandbox = withI18n({ window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoSync: null }, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInNewContext(read('js/account-ui.js'), sandbox);
  return adapter;
}

test('the account windows left app.js for js/account-ui.js; the key helpers and the sync stay for the last step', () => {
  for (const name of MOVED) {
    assert.equal(functionSource(name).file, 'js/account-ui.js', name);
    assert.doesNotMatch(app, new RegExp(`\\n  (async )?function ${name}\\(`), `${name} left app.js`);
  }
  for (const name of STAY) assert.equal(functionSource(name).file, 'js/app.js', name);
  for (const action of ["action === 'account-change-password'", "action === 'account-change-email'", "'journal-cipher-enable', 'journal-cipher-unlock', 'journal-cipher-disable'"]) assert.ok(!app.includes(action), `app.js no longer handles ${action}`);
});

test('app.js asks for the sent form by name and gives the module what it needs', () => {
  assert.match(fn('attachEvents'), /if \(form\.matches\('\[data-welcome-form\]'\)\) accountAction\('welcome-submit'\);\n      else accountAction\('account-submit'\);/);
  assert.match(app, /\n      \/\/ R113: what the account windows need[^\n]*\n      storeJournalKey, forgetJournalKey, scheduleSync, get syncRunning\(\) \{ return syncRunning; \},\n/);
  const taken = functionSource('use', ['js/account-ui.js']).source.match(/\(\{ ([^}]+) \} = ctx\);/)[1].split(', ');
  const keys = contextKeys();
  for (const name of taken) assert.ok(keys.has(name), `domainContext gives ${name}`);
  for (const name of ['storeJournalKey', 'forgetJournalKey', 'scheduleSync', 'journalCipherStatus', 'saveState']) assert.ok(taken.includes(name), name);
  const code = read('js/account-ui.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /(?<![\w$'"])(?<![^.]\.)(state|modalState|syncMeta|modalReturnFocus|syncRunning)\b(?!:)/, 'only through app.');
  assert.doesNotMatch(code, /app\.(modalState|syncMeta|modalReturnFocus) = /);
});

test('in the module: the buttons open their windows, the sent form goes to its window, other actions pass', () => {
  const adapter = loadModule();
  const live = { modalState: null, state: { settings: {} } };
  const calls = [];
  const ctx = {
    get state() { return live.state; }, get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; }, get modalReturnFocus() { return null; }, setModalReturnFocus() {}, get syncRunning() { return false; },
    syncClient: {}, loadSyncMeta: () => ({ session: { accessToken: 'a', user: { email: 'ana@example.com' } } }), saveSyncMeta() {}, captureModalReturnFocus() {}, closePopover() {}, renderModal: () => calls.push('renderModal'), restoreModalReturnFocus() {}, $: () => null,
    journalCipherStatus: () => 'off',
  };
  const click = action => adapter.handleAction(action, { target: { closest: () => ({ dataset: {} }) } }, ctx);
  assert.equal(click('account-change-email'), true);
  assert.deepEqual([live.modalState.type, live.modalState.step, live.modalState.currentEmail], ['account-email', 'email', 'ana@example.com']);
  assert.equal(adapter.handleAction('account-submit', null, ctx), true);
  assert.equal(live.modalState.error, 'Enter a valid e-mail address.', 'the sent form reaches its window');
  live.modalState = null;
  assert.equal(click('journal-cipher-enable'), true);
  assert.deepEqual([live.modalState.type, live.modalState.mode], ['journal-cipher', 'enable']);
  live.modalState = null;
  assert.equal(click('journal-cipher-unlock'), true);
  assert.equal(live.modalState, null, 'unlocking needs a locked journal');
  assert.equal(click('account-change-password'), true);
  assert.deepEqual([live.modalState.type, live.modalState.step], ['account-password', 'new']);
  assert.equal(click('sync-now'), undefined, 'the sync is not the module\'s yet');
});

test('the plan records 3b and leaves the sync with its sign-out, account deletion, first-sync choice and server check', () => {
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R113 \| [^\n]+ \| `js\/account-ui\.js` \| `2\.0\.0-alpha\.143` \|/);
  assert.ok(plan.includes('3b. done in R113'));
  assert.ok(plan.includes('3c. the sync itself') && !plan.includes('3d.'));
});

test('R113 is released as 2.0.0-alpha.143', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.143');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.143';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.143');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['2.0.0-alpha.143', '2.0.0-alpha.143']);
  assert.ok(read('novo.html').includes('2.0.0-alpha.143'));
});
