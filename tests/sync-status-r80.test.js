// R80: the sync state is visible on the phone too. One line (syncStatus) names it: data only on this device, not
// signed in, syncing, waiting for a connection, failed, or the time of the last sync. Još → Nalog shows it, the
// "Još" tab gets a red dot while the last sync failed, and the computer's sidebar uses the same line.
// Spec: docs/superpowers/specs/2026-10-15-r80-sync-status.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const beforeMarker = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));

function status(sync, online = true) {
  const ctx = withI18n({ syncView: () => sync, globalThis: { navigator: { onLine: online } }, Date, I18n: { locale: () => 'sr-Latn' } });
  vm.createContext(ctx);
  vm.runInContext(`${functionSource('syncStatus').source}\nthis.syncStatus = syncStatus;`, ctx);
  return JSON.parse(JSON.stringify(ctx.syncStatus()));
}

test('one line names the sync state', () => {
  assert.deepEqual(status({ configured: false }), { state: 'off', text: 'Data is on this device only' });
  assert.deepEqual(status({ configured: true, signedIn: false }), { state: 'signed-out', text: 'Not signed in' });
  assert.deepEqual(status({ configured: true, signedIn: true, running: true, lastError: 'x' }), { state: 'running', text: 'Syncing…' });
  assert.deepEqual(status({ configured: true, signedIn: true, lastError: 'Failed to fetch' }, false), { state: 'offline', text: 'Waiting for a connection' });
  assert.deepEqual(status({ configured: true, signedIn: true, lastError: 'Server error', lastSyncAt: '2026-10-15T08:00:00.000Z' }), { state: 'error', text: 'Sync failed — see Account.' });
  const ok = status({ configured: true, signedIn: true, lastSyncAt: '2026-10-15T08:00:00.000Z', email: 'a@b.c' });
  assert.equal(ok.state, 'ok');
  assert.match(ok.text, /^Synced \d{1,2}:\d{2}/);
  assert.deepEqual(status({ configured: true, signedIn: true, email: 'a@b.c' }), { state: 'ok', text: 'a@b.c' });
});

test('Još → Nalog shows the line; signed out it still invites to sign in', () => {
  const more = functionSource('renderMoreScreen').source;
  assert.match(more, /const status = syncStatus\(\);/);
  assert.match(more, /const accountText = status\.state === 'signed-out' \? tr\('Sign in'\) : status\.text;/);
});

test('the Još tab gets a red dot while the last sync failed', () => {
  assert.match(read('index.html'), /<button class="mobile-bottom-nav-item" type="button" data-route="more"><i class="ph ph-dots-three-outline" aria-hidden="true"><\/i><span>Još<\/span><b id="mobile-sync-alert" class="mobile-bottom-nav-alert" role="img" aria-label="Sinhronizacija nije uspela" hidden><\/b><\/button>/);
  assert.match(functionSource('renderMobileBottomNav').source, /const syncAlert = \$\('#mobile-sync-alert'\);\n\s+if \(syncAlert\) syncAlert\.hidden = syncStatus\(\)\.state !== 'error';/);
  assert.ok(beforeMarker.includes('.mobile-bottom-nav-alert { position: absolute; top: 4px; right: calc(50% - 16px); width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }'));
  assert.ok(beforeMarker.includes('.mobile-bottom-nav-alert[hidden] { display: none; }'));
});

test('a change of state refreshes Još, the tab and the sidebar; the sidebar uses the same line', () => {
  assert.match(functionSource('refreshSyncCard').source, /if \(\['settings', 'account', 'more'\]\.includes\(currentRoute\(\)\.type\) && !editingText\(\)\) render\(\);\n\s+else \{ renderMobileBottomNav\(\); renderSidebar\(\); \}/);
  assert.match(read('js/app.js'), /\n\s+syncStatus,\n/);
  assert.match(read('js/sidebar-ui.js'), /const syncLine = ctx\.syncStatus\(\)\.text;/);
  assert.match(read('js/app.js'), /window\.addEventListener\('online', \(\) => \{ scheduleSync\(500\); refreshSyncCard\(\); \}\);\n\s+\/\/ R80[^\n]*\n\s+window\.addEventListener\('offline', \(\) => refreshSyncCard\(\)\);/);
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Waiting for a connection', 'Čeka se veza'], ['Sync failed — see Account.', 'Sinhronizacija nije uspela — pogledaj Nalog.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R80 is released as 2.0.0-alpha.107', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.107');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.107';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.107');
});
