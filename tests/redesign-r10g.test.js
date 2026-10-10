// Redesign R10g: Podešavanja (M5, M6) and the retired sidebar.
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10g-settings.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const settingsUi = read('js/settings-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function renderSettings({ installed = false, sync = { configured: false } } = {}) {
  let adapter;
  runInNewContextWithI18n(settingsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: { search: 'Ctrl/Cmd+K' }, backupStatus: {}, weekStartsOn: 'monday' } },
    Core, esc,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    shortcutLabels: { search: 'Search' }, shortcutError: () => '', notificationButtonLabel: () => 'Enable',
    storagePersistence: () => ({ state: 'granted' }),
    release: { APP_VERSION: '2.0.0-alpha.25', REPORT_EMAIL: 'beta@example.com', problemReportMailto: Release.problemReportMailto },
    environmentInfo: () => ({ standalone: installed }),
    syncView: () => sync,
    notificationSettings: () => null,
  });
}
const groups = html => [...html.matchAll(/<section class="settings-card[^"]*"[^>]*>\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/section>/g)].map(match => [match[1], [...match[2].matchAll(/<strong>([^<]+)<\/strong>/g)].map(row => row[1])]);

test('M5: Settings has Opšte, Podaci, Pomoć and Računar in that order (R15: Nalog has its own screen)', () => {
  const html = renderSettings();
  assert.match(html, /^<header title="Settings" subtitle=""><\/header>/);
  assert.deepEqual(groups(html), [
    // R12c (J6) adds "Podsetnik za dnevnik" at the end of Opšte.
    // R18 adds "Podrazumevano vreme podsetnika" and "Podsetnik u planirano vreme" after the reminders.
    ['General', ['Week starts on', 'Daily capacity', 'Browser reminders', 'Default reminder time', 'Reminder at the planned time', 'Journal reminder']],
    ['Data', ['Backup', 'Backup reminder', 'Restore from backup', 'Local snapshots', 'Persistent storage', 'Populate demo workspace', 'Reset app data']],
    ['Help', ['Guide', 'Report a problem', 'Install app', 'Privacy', 'About']],
    ['Computer', ['Search', 'Compact density']],
  ]);
  assert.match(html, /<section class="settings-card" data-settings-data>[\s\S]*?<strong>Backup<\/strong><span>Last export: Never<br>Last import: Never<br>Recovery snapshot: None pending<br>Validation: Not yet validated<\/span><\/div><button class="btn btn-secondary" type="button" data-action="export-backup">/);
  assert.match(html, /<div class="settings-row settings-sub"><label class="settings-label" for="backup-reminder-days"><strong>Backup reminder<\/strong>/);
  assert.match(html, /<strong>Restore from backup<\/strong><span>Validate a ZIP first, then replace current data only after you confirm\.<\/span><\/div><div><button class="btn btn-secondary" type="button" data-action="import-backup">/);
  assert.match(html, /<section class="settings-card" data-settings-about>\s*<h2>Help<\/h2>[\s\S]*data-beta-guide[\s\S]*data-report-problem[\s\S]*data-install-status="browser"[\s\S]*data-privacy-note[\s\S]*<strong>About<\/strong><span>Dailo 2\.0\.0-alpha\.25<\/span>/);
  assert.match(html, /<section class="settings-card settings-desktop" data-settings-desktop>\s*<h2>Computer<\/h2>/);
  // R15 (M5 amended): Nalog moved to its own screen in Još, so Settings has the same groups with sync set up.
  const synced = renderSettings({ sync: { configured: true, signedIn: false, step: 'email', email: '', busy: false, error: '' } });
  assert.deepEqual(groups(synced).map(group => group[0]), ['General', 'Data', 'Help', 'Computer']);
  assert.doesNotMatch(synced, /data-settings-sync/);
});

test('M5, M6: the install row only while not installed; no theme, personalization buttons or clear row', () => {
  const installed = renderSettings({ installed: true });
  assert.doesNotMatch(installed, /data-install-status|Install app/);
  const html = renderSettings();
  assert.doesNotMatch(html, /Theme|save-personalization|reset-personalization|clear-completed|<h2>Personalization<\/h2>|<h2>Notifications<\/h2>/);
  assert.match(css.slice(css.indexOf('/* Redesign R10g')), /@media \(max-width: 700px\), \(pointer: coarse\) \{\n  \.settings-desktop \{ display: none; \}\n\}/);
});

test('M5: week start and density apply on change; the week-start history stays (M11)', () => {
  assert.match(app, /if \(\['preference-week-start', 'preference-density'\]\.includes\(event\.target\.id\)\) \{ savePersonalization\(\); return; \}/);
  assert.match(fn('savePersonalization'), /weekStartHistory: Core\.recordWeekStartChange\(state\.settings, \$\('#preference-week-start'\)\?\.value, Core\.dateOnly\(\)\)/);
  assert.doesNotMatch(app, /function resetPersonalization\(|resetPersonalization,/);
  assert.doesNotMatch(settingsUi, /save-personalization|reset-personalization/);
});

test('the sidebar is retired: no markup, render function, actions or UI keys', () => {
  assert.doesNotMatch(read('index.html'), /id="sidebar"/);
  assert.doesNotMatch(app, /function renderSidebar\(|toggle-sidebar|sidebarCollapsed|sidebarSections|function openMoreMenu\(|'more-menu'|#sidebar/);
});

test('the R10g layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10g'));
  assert.ok(layer.length > 20, 'R10g layer');
  assert.ok(layer.includes('.settings-sub'), '.settings-sub');
  for (const [en, value] of [['Backup', 'Rezervna kopija'], ['Restore from backup', 'Vrati iz kopije'], ['Help', 'Pomoć'], ['Guide', 'Uputstvo'], ['Computer', 'Računar'], ['Account', 'Nalog']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R10g shipped as 2.0.0-alpha.25 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 25);
});
