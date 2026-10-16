// R112: part 3a of the module plan ("account"). The welcome screen and sign-in (R40, R60) move into js/account-ui.js:
// when the first screen is due, its steps and fields, e-mail and password with codes, Google and Apple (PKCE) and the
// way back from them, and an e-mail link's message. The module reads the live state through the domain context
// (app.state, app.modalState, the start-up flags, app.syncMeta and app.modalReturnFocus, with their setters); app.js
// asks it by name (accountAction) at start, after "Odjavi se", when the form is sent, when a provider returns to the
// app and when a shortcut puts the screen away. completeSignIn stays in app.js with the sync record it writes, since
// the e-mail change uses it too. The rest of the account and the sync follow in later parts. Nothing changes for the user.
// Spec: docs/superpowers/specs/2026-10-16-r112-account-welcome.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { APP_FILES, functionSource, contextKeys } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const MOVED = ['welcomeDue', 'rememberWelcome', 'openWelcome', 'consumeAuthLanding', 'startWelcome', 'closeWelcome', 'skipWelcome', 'dismissWelcome', 'setWelcome', 'welcomeFields', 'welcomeMode', 'toggleWelcomePassword', 'welcomeProblem', 'welcomeErrorText', 'welcomeSubmit', 'welcomeResend', 'finishWelcome', 'startProviderSignIn', 'finishProviderSignIn', 'consumeAuthRedirect'];

function loadModule() {
  let adapter;
  const sandbox = withI18n({ window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoSync: null }, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInNewContext(read('js/account-ui.js'), sandbox);
  return adapter;
}

test('the welcome screen and sign-in left app.js for js/account-ui.js; completeSignIn stays with the sync record', () => {
  for (const name of MOVED) {
    assert.equal(functionSource(name).file, 'js/account-ui.js', name);
    assert.doesNotMatch(app, new RegExp(`\\n  (async )?function ${name}\\(`), `${name} left app.js`);
  }
  for (const name of ['const WELCOME_KEY', 'const WELCOME_MODES', 'const AUTH_REDIRECT_APP', 'const AUTH_LANDING_MESSAGES', 'const welcomeCode']) assert.ok(!app.includes(`  ${name} `), `${name} left app.js`);
  // R114: completeSignIn joined the module too, with signing out and the first-sync choice (3c).
  assert.equal(functionSource('completeSignIn').file, 'js/account-ui.js');
  for (const action of ['open-welcome', 'welcome-mode', 'welcome-skip', 'welcome-provider', 'welcome-resend', 'welcome-toggle-password']) assert.ok(!app.includes(`action === '${action}'`), `app.js no longer handles ${action}`);
});

test('app.js asks the module by name', () => {
  assert.match(app, /\n  const accountAction = \(action, payload = null\) => window\.TodoDomainModules\?\.getAdapters\(\)\.find\(adapter => adapter\.name === 'account'\)\?\.handleAction\(action, payload, domainContext\(\)\);\n/);
  assert.match(fn('init'), /\n    accountAction\('welcome-start'\);\n/);
  // R114: "Odjavi se" is the module's too and opens the sign-in screen itself; app.js no longer asks for 'welcome-open'.
  assert.match(fn('signOutToWelcome'), /navigate\('today'\);\n    openWelcome\('sign-in', \{ firstRun: true \}\);/);
  assert.ok(!read('js/app.js').includes("accountAction('welcome-open'"));
  assert.match(fn('attachEvents'), /if \(form\.matches\('\[data-welcome-form\]'\)\) accountAction\('welcome-submit'\);/);
  assert.match(fn('handleIncomingLink'), /if \(target === 'auth'\) \{ if \(!loadSyncMeta\(\)\.pkce\) return false; accountAction\('welcome-provider-return', \{ params: link\.searchParams \}\); return true; \}/);
  assert.match(fn('handleIncomingLink'), /if \(modalState\?\.type === 'welcome'\) accountAction\('welcome-dismiss'\);/);
  // R114: completeSignIn is the module's own now, so the context no longer gives it.
  assert.match(app, /\n      \/\/ R112: what js\/account-ui\.js needs[^\n]*\n      syncClient, loadSyncMeta, saveSyncMeta, restoreModalReturnFocus, runSync,\n      get syncMeta\(\) \{ return syncMeta; \}, setSyncMeta\(value\) \{ syncMeta = value; \},\n      get modalReturnFocus\(\) \{ return modalReturnFocus; \}, setModalReturnFocus\(value\) \{ modalReturnFocus = value; \},\n      get recovery\(\) \{ return recovery; \}, get storageError\(\) \{ return storageError; \}, get staleDataNotice\(\) \{ return staleDataNotice; \}, get globalOperation\(\) \{ return globalOperation; \},\n/);
});

test('the module registers as "account", takes only what the context gives and reads the live state through it', () => {
  const module = read('js/account-ui.js');
  // R114: the module also draws the first-sync choice (renderRoute).
  assert.match(module, /window\.TodoDomainModules\?\.register\(\{\n    name: 'account',\n    renderRoute,\n    handleAction,\n  \}\);/);
  // Several modules have a use(); the lookup names this one (the R112 review).
  const taken = functionSource('use', ['js/account-ui.js']).source.match(/\(\{ ([^}]+) \} = ctx\);/)[1].split(', ');
  // R114: completeSignIn is no longer taken from the context; it is the module's own function.
  assert.ok(!taken.includes('completeSignIn') && taken.includes('loadSyncMeta'), 'the account module\'s own helpers');
  const keys = contextKeys();
  for (const name of taken) assert.ok(keys.has(name), `domainContext gives ${name}`);
  // R114: the first-sync choice's English text says "recovery copy", so the translated strings are left out too.
  const code = module.replace(/\/\/[^\n]*/g, '').replace(/tr\('[^']*'/g, "tr(''");
  assert.doesNotMatch(code, /(?<![\w$'"])(?<![^.]\.)(state|modalState|recovery|storageError|staleDataNotice|globalOperation|syncMeta|modalReturnFocus)\b(?!:)/, 'only through app.');
  assert.doesNotMatch(code, /app\.(modalState|syncMeta|modalReturnFocus) = /, 'replaced only through the setters');
});

test('in the module: its buttons, the named calls, and nothing else', () => {
  const adapter = loadModule();
  assert.equal(adapter.name, 'account');
  const live = { modalState: null };
  const calls = [];
  const ctx = {
    get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; }, get modalReturnFocus() { return null; }, setModalReturnFocus() {},
    syncClient: {}, loadSyncMeta: () => ({}), saveSyncMeta() {}, captureModalReturnFocus() {}, closePopover() {}, renderModal: () => calls.push('renderModal'), restoreModalReturnFocus() {}, $: () => null,
  };
  const click = (action, dataset = {}) => adapter.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
  assert.equal(click('open-welcome', { mode: 'sign-up' }), true);
  assert.deepEqual([live.modalState.type, live.modalState.mode, live.modalState.firstRun], ['welcome', 'sign-up', false]);
  assert.equal(click('welcome-mode', { mode: 'reset' }), true);
  assert.equal(live.modalState.mode, 'reset');
  assert.equal(adapter.handleAction('welcome-dismiss', null, ctx), true);
  assert.equal(live.modalState, null);
  // R114: 'welcome-open' was app.js's call after "Odjavi se", which is the module's now; tests/sign-out-r64.test.js runs
  // it and sees the sign-in screen open as the first screen.
  assert.equal(adapter.handleAction('welcome-open', { mode: 'sign-in', firstRun: true }, ctx), undefined);
  assert.equal(adapter.handleAction('journal-closing', null, ctx), undefined, 'another module\'s action');
  assert.equal(click('create-task'), undefined);
});

test('the module loads after js/quick-add-ui.js, is precached, the tests read it as part of the app, and the plan says so', () => {
  assert.match(read('index.html'), /<script src="js\/quick-add-ui\.js"><\/script>\n  <script src="js\/account-ui\.js"><\/script>\n  <script src="js\/app\.js"><\/script>/);
  assert.match(read('sw.js'), /'js\/quick-add-ui\.js',\n  'js\/account-ui\.js',\n  'js\/app\.js',/);
  assert.deepEqual(APP_FILES, ['js/sidebar-ui.js', 'js/drag-ui.js', 'js/quick-add-ui.js', 'js/account-ui.js', 'js/app.js']);
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R112 \| [^\n]+ \| `js\/account-ui\.js` \| `2\.0\.0-alpha\.142` \|/);
  assert.ok(plan.includes('3a.') && plan.includes('the account windows') && plan.includes('the sync itself'), 'the rest of part 3, in its steps');
});

test('R112 shipped as 2.0.0-alpha.142 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 142) >= 142);
});
