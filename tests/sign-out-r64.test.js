// R64: "Odjavi se" signs out and returns to the first screen: Danas behind the sign-in screen, where the person can
// sign in again or go on without an account. Before, Nalog stayed open and only its button changed to "Prijavi se".
// The welcome screen fills the window, so it no longer moves or shrinks when it opens; on a wide screen the old
// entrance looked like the page jumping (its redraws stopped replaying it in R62).
// Spec: docs/superpowers/specs/2026-10-13-r64-sign-out-welcome.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function harness() {
  const calls = [];
  const storage = new Map([['dailoSync', '{"session":{"accessToken":"a"}}']]);
  const context = {
    calls, syncMeta: { session: { accessToken: 'a' } }, syncTimer: 1, console,
    loadSyncMeta: () => ({ session: { accessToken: 'a' } }), SYNC_META_KEY: 'dailoSync',
    clearTimeout: () => {}, liveSync: { disconnect: () => calls.push('disconnect') }, forgetJournalKey: () => calls.push('forget key'),
    localStorage: { removeItem: key => { storage.delete(key); calls.push(`remove ${key}`); } },
    render: () => calls.push('render'), navigate: route => calls.push(`navigate ${route}`),
    openWelcome: (mode, options) => calls.push(`welcome ${mode} ${JSON.stringify(options)}`),
    syncClient: { signOut: async () => { await null; calls.push('server sign-out'); } },
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('signOutSync').source}\n${functionSource('signOutToWelcome').source}\nthis.signOutSync = signOutSync; this.signOutToWelcome = signOutToWelcome;`, context);
  return { context, calls, storage };
}

test('"Odjavi se" ends the session, goes to Danas and opens the sign-in screen', async () => {
  const { context, calls, storage } = harness();
  await context.signOutToWelcome();
  assert.equal(storage.has('dailoSync'), false, 'the session is gone from this device');
  assert.deepEqual(calls, ['disconnect', 'forget key', 'remove dailoSync', 'render', 'navigate today', 'welcome sign-in {"firstRun":true}', 'server sign-out'],
    'the screen changes at once; the server is told meanwhile, so a slow network does not hold it');
  assert.match(read('js/app.js'), /else if \(action === 'sync-sign-out'\) signOutToWelcome\(\);/, 'the Nalog button');
});

test('cancelling the first-sync choice still only signs out, without the sign-in screen', async () => {
  const { context, calls } = harness();
  await context.signOutSync();
  assert.ok(!calls.some(call => call.startsWith('welcome') || call.startsWith('navigate')));
  assert.match(read('js/app.js'), /modalState = \{ type: 'sync-choice', onCancel: async \(\) => \{ modalState = null; renderModal\(\); await signOutSync\(\); \} \};/);
});

test('the sign-in screen opens and redraws in place: no movement, no shrinking', () => {
  const css = read('css/styles.css');
  const at = css.indexOf('.modal.welcome-screen { animation: none; }');
  assert.ok(at > 0 && at < css.indexOf('/* Keep primary compact actions touchable after all density rules. */'), 'the full-screen page does not slide in like a dialog');
  assert.match(css, /\.modal-backdrop\.is-steady, \.modal-backdrop\.is-steady \.modal \{ animation: none; \}/, 'R62: a step change (Prijava → Registracija, the eye, an error) redraws in place');
});

test('R64 shipped as 2.0.0-alpha.91 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 91);
});
