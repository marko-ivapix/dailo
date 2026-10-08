const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const Release = require('../js/release.js');
global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

function renderSettings(release, environment = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    release, environmentInfo: () => ({ userAgent: 'TestAgent/1.0', standalone: false, ...environment }),
  });
}

test('release metadata has one semantic version and is loaded before the app modules', () => {
  assert.match(Release.APP_VERSION, /^\d+\.\d+\.\d+$/);
  // The newest release test pins the exact version; this one only requires a V1.9 or later release.
  assert.ok(Number(Release.APP_VERSION.split('.')[0]) > 1 || Number(Release.APP_VERSION.split('.')[1]) >= 9, Release.APP_VERSION);
  const html = read('index.html');
  const releaseScript = html.indexOf('src="js/release.js"');
  assert.ok(releaseScript > 0, 'index.html loads js/release.js');
  assert.ok(releaseScript < html.indexOf('src="js/core.js"'), 'release metadata loads before core');
  assert.match(html, /<title>Dailo<\/title>/);
  for (const file of ['index.html', 'js/app.js']) assert.doesNotMatch(read(file), /v1\.8 prototype|Prototype v1\.8/, `${file} has no hard-coded old version`);
  assert.match(read('js/app.js'), /title="Dailo \$\{esc\(Release\.APP_VERSION\)\}"/);
});

test('backup manifest records the release version and keeps the historical appVersion', async () => {
  const state = global.TodoCore.migrateStateV3({ version: 2, tasks: [], projects: [], tags: [], settings: {}, ui: {} }).state;
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };
  const blob = await Backup.exportBackupV3(state, storage, '2026-10-07T12:00:00.000Z');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('data.json').async('string'));
  assert.equal(manifest.releaseVersion, Release.APP_VERSION);
  assert.equal(manifest.appVersion, '1.3');
  assert.equal(manifest.backupVersion, 2);
  const inspected = await Backup.inspectBackupV3(blob);
  assert.equal(inspected.state.version, 3);
});

test('problem report mailto carries version and environment but no app data', () => {
  assert.equal(Release.problemReportMailto({ email: '' }), null);
  assert.equal(Release.problemReportMailto({ email: 'not an address' }), null);
  const href = Release.problemReportMailto({ email: 'beta@example.com', version: '1.9.0', userAgent: 'TestAgent/1.0', standalone: true, persistence: 'granted' });
  assert.match(href, /^mailto:beta@example\.com\?subject=/);
  const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  assert.match(params.get('subject'), /Dailo 1\.9\.0/);
  const body = params.get('body');
  for (const fragment of ['1.9.0', 'TestAgent/1.0', 'standalone', 'granted']) assert.ok(body.includes(fragment), `body includes ${fragment}`);
  assert.match(href, /%0D%0A/, 'line breaks are encoded as CRLF');
});

test('Settings shows an About card with version and privacy note; the report link needs an address', () => {
  const withoutAddress = renderSettings({ APP_VERSION: '1.9.0', REPORT_EMAIL: '', problemReportMailto: Release.problemReportMailto });
  assert.match(withoutAddress, /data-settings-about/);
  assert.match(withoutAddress, /1\.9\.0/);
  assert.match(withoutAddress, /data-privacy-note/);
  assert.doesNotMatch(withoutAddress, /mailto:/);
  const withAddress = renderSettings({ APP_VERSION: '1.9.0', REPORT_EMAIL: 'beta@example.com', problemReportMailto: Release.problemReportMailto }, { standalone: true });
  assert.match(withAddress, /<a class="btn btn-secondary" href="mailto:beta@example\.com\?subject=[^"]+" data-report-problem>/);
});

test('release gate: the beta problem-report address is configured', { todo: Release.REPORT_EMAIL ? false : 'waiting for the beta report address from the user' }, () => {
  assert.match(Release.REPORT_EMAIL, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});
