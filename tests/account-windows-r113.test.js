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
// R114 (3c) took completeSignIn, signing out, deleting the account and the first-sync choice into the module as well;
// tests/account-sync-choice-r114.test.js checks them. The journal key helpers and the server check stay with the sync.
const STAY = ['journalCipherStored', 'journalCipherStatus', 'deviceJournalKey', 'storeJournalKey', 'forgetJournalKey', 'journalSyncOptions', 'afterJournalSync', 'runServerCheck'];

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

// The R113 review: journalCipherSubmit is the one moved function that writes the state and the sync record, so it runs
// here (encryption on, then off) against a stubbed Sync, not only matched as text.
test('in the module: the journal password window turns encryption on and off through the live state', async () => {
  const calls = [];
  const fakeSync = {
    passwordProblem: () => '',
    createJournalCipher: async password => ({ cipher: { salt: `salt-${password.length}` }, key: 'key' }),
    forgetJournalShadow: meta => { meta.journalShadowGone = true; },
  };
  let adapter;
  const sandbox = withI18n({ window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoSync: fakeSync }, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInNewContext(read('js/account-ui.js'), sandbox);
  const live = { state: { settings: {} }, modalState: { type: 'journal-cipher', mode: 'enable', password: '', confirm: '', busy: false, error: '' }, syncMeta: null };
  const fields = { '#journal-password': 'dnevnik-123', '#journal-password-confirm': 'dnevnik-123' };
  const ctx = {
    get state() { return live.state; }, get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; },
    get syncMeta() { return live.syncMeta; }, setSyncMeta(value) { live.syncMeta = value; }, get modalReturnFocus() { return null; }, setModalReturnFocus() {}, get syncRunning() { return false; },
    syncClient: {}, loadSyncMeta: () => ({ session: { accessToken: 'a' } }), saveSyncMeta: () => calls.push(['save meta', JSON.parse(JSON.stringify(live.syncMeta))]),
    $: selector => (selector in fields ? { value: fields[selector] } : null), renderModal() {}, render() {}, restoreModalReturnFocus() {}, closePopover() {}, captureModalReturnFocus() {},
    saveState: () => { calls.push(['save state', JSON.parse(JSON.stringify(live.state.settings))]); return true; },
    storeJournalKey: async (salt, key) => calls.push(['store key', salt, key]), forgetJournalKey: () => calls.push(['forget key']),
    setToastMessage: message => calls.push(['toast', message]), scheduleSync: delay => calls.push(['schedule', delay]), journalCipherStatus: () => 'off',
  };
  const settle = async () => { for (let i = 0; i < 50 && !calls.some(call => call[0] === 'schedule'); i += 1) await new Promise(resolve => setImmediate(resolve)); };
  assert.equal(adapter.handleAction('account-submit', null, ctx), true);
  await settle();
  assert.deepEqual(calls, [
    ['save state', { journalCipher: { salt: 'salt-11' } }], ['store key', 'salt-11', 'key'],
    ['save meta', { session: { accessToken: 'a' }, journalShadowGone: true, purgeJournalHistory: true }],
    ['toast', 'The journal is encrypted. The server sees only ciphertext.'], ['schedule', 300],
  ]);
  assert.deepEqual(live.state.settings, { journalCipher: { salt: 'salt-11' } }, 'the live settings changed');
  assert.equal(live.modalState, null, 'the window closed');
  calls.length = 0;
  live.modalState = { type: 'journal-cipher', mode: 'disable', password: '', confirm: '', busy: false, error: '' };
  adapter.handleAction('account-submit', null, ctx);
  await settle();
  assert.deepEqual(calls.map(call => call[0]), ['save state', 'forget key', 'save meta', 'toast', 'schedule']);
  assert.deepEqual(live.state.settings, {}, 'encryption is off');
  assert.equal(live.syncMeta.purgeJournalHistory, undefined);
});

test('the plan records 3b and leaves the sync with its sign-out, account deletion, first-sync choice and server check', () => {
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R113 \| [^\n]+ \| `js\/account-ui\.js` \| `2\.0\.0-alpha\.143` \|/);
  assert.ok(plan.includes('3b. done in R113'));
  // R114: 3c is done, and the plan says why the sync itself stays (tests/account-sync-choice-r114.test.js).
  assert.ok(plan.includes('3c.') && !plan.includes('3d.'));
});

test('R113 shipped as 2.0.0-alpha.143 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 143) >= 143);
});
