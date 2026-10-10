// Redesign R15: Još as two-column tiles and the Nalog screen (M4, M5 amended 2026-10-10).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r15-more-tiles-account.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const layerStart = css.indexOf('/* Redesign R15');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};

function moreScreen(sync) {
  const state = { goals: [{ id: 'g', status: 'active' }], areas: [], tasks: [], projects: [], notes: [], journal: [], resources: [], tags: [], templates: [], savedViews: [] };
  const ctx = withI18n({ state, esc, sortedAreas: () => [], syncView: () => sync, pageHeader: title => `<header>${title}</header>`, isOpenRepeating: () => false, formatReminder: value => value });
  vm.createContext(ctx);
  vm.runInContext(`${fn('moreRow')}${fn('renderMoreScreen')}`, ctx);
  return ctx.renderMoreScreen();
}

test('M4: a Još tile has the icon on top, the count at the top right and the name below, without an arrow', () => {
  const ctx = withI18n({ esc });
  vm.createContext(ctx);
  vm.runInContext(fn('moreRow'), ctx);
  assert.equal(ctx.moreRow('goals', 'ph-target', 'Goals', 3), '<button class="mobile-more-route more-row" type="button" data-route="goals"><i class="ph ph-target more-row-icon" aria-hidden="true"></i><span class="more-row-value">3</span><span class="more-row-label">Goals</span></button>');
  assert.equal(ctx.moreRow('area/a', 'ph-house', 'Home', '', 'Area'), '<button class="mobile-more-route more-row" type="button" data-route="area/a"><i class="ph ph-house more-row-icon" aria-hidden="true"></i><span class="more-row-label">Home<small>Area</small></span></button>');
  assert.doesNotMatch(fn('moreRow'), /more-row-caret|ph-caret-right/);
});

test('M4: the groups are two-column tile grids; the area screen keeps its list', () => {
  const html = moreScreen({ configured: false });
  assert.equal((html.match(/<div class="more-card more-tiles">/g) || []).length, 4, 'Planiranje, Biblioteka, Arhiva and the last group');
  assert.match(rule('.more-tiles'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 10px; padding: 0; border: 0; background: none;/);
  const tile = rule('.more-tiles > .more-row');
  for (const part of ['display: grid', 'grid-template-areas: "icon value" "label label"', 'min-height: 96px', 'border: 1px solid var(--line-1)', 'background: var(--graphite-850)']) assert.ok(tile.includes(part), part);
  assert.match(rule('.more-tiles .more-row-icon'), /grid-area: icon;[\s\S]*width: 36px; height: 36px;[\s\S]*background: var\(--accent-tint\); color: var\(--blue-300\);/);
  assert.match(rule('.more-tiles .more-row-value'), /grid-area: value;/);
  assert.match(rule('.more-tiles .more-row-label'), /grid-area: label;/);
  assert.match(read('js/areas-ui.js'), /class="more-card"/, 'the area screen keeps the plain card');
});

test('M5: the last group is Podešavanja and Nalog; the Nalog line follows the sync state', () => {
  const last = html => html.slice(html.lastIndexOf('<section class="more-group">'));
  const local = last(moreScreen({ configured: false }));
  assert.match(local, /data-route="settings"><i class="ph ph-gear more-row-icon" aria-hidden="true"><\/i><span class="more-row-label">Settings<\/span><\/button>/, 'no sync line on Podešavanja');
  assert.match(local, /data-route="account"><i class="ph ph-user-circle more-row-icon" aria-hidden="true"><\/i><span class="more-row-label">Account<small>Data is on this device only<\/small><\/span><\/button>/);
  assert.match(last(moreScreen({ configured: true, signedIn: false })), /data-route="account">[\s\S]*<small>Sign in<\/small>/);
  assert.match(last(moreScreen({ configured: true, signedIn: true, email: 'ana@example.com' })), /data-route="account">[\s\S]*<small>ana@example\.com<\/small>/);
});

function settingsModule() {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter;
}
const baseCtx = sync => ({
  state: { settings: { shortcuts: {}, backupStatus: {}, weekStartsOn: 'monday' } }, esc,
  pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
  shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', release: Release, environmentInfo: () => ({}),
  syncView: () => sync,
});

test('M5: #account shows the account card, or explains that the data stays on this device', () => {
  assert.match(fn('currentRoute'), /'settings', 'journal', 'account'\]\.includes\(hash\)/);
  const adapter = settingsModule();
  const local = adapter.renderRoute({ type: 'account' }, baseCtx({ configured: false }));
  assert.match(local, /^<header title="Account" subtitle="Data is on this device only"><\/header>/);
  assert.match(local, /<section class="settings-card" data-account-local>\s*<h2>This device<\/h2>/);
  assert.match(local, /Sync is not set up yet, so there is no account to sign in to\./);
  assert.match(local, /<button class="btn btn-secondary" type="button" data-route="settings">Settings<\/button>/);
  assert.doesNotMatch(local, /data-settings-sync/);
  const email = adapter.renderRoute({ type: 'account' }, baseCtx({ configured: true, signedIn: false, step: 'email', email: '', busy: false, error: '' }));
  assert.match(email, /<section class="settings-card" data-settings-sync>\s*<h2>Account<\/h2>[\s\S]*id="sync-email"/);
  const signedIn = adapter.renderRoute({ type: 'account' }, baseCtx({ configured: true, signedIn: true, email: 'ana@example.com', lastSyncAt: null }));
  assert.match(signedIn, /^<header title="Account" subtitle="ana@example\.com"><\/header>/);
  assert.match(signedIn, /data-action="sync-now"[\s\S]*data-action="sync-sign-out"[\s\S]*data-action="sync-delete-account"/);
});

test('M5: Podešavanja no longer has the Nalog group, and sync events re-render the Nalog screen', () => {
  const adapter = settingsModule();
  const settings = adapter.renderRoute({ type: 'settings' }, baseCtx({ configured: true, signedIn: true, email: 'ana@example.com' }));
  assert.doesNotMatch(settings, /data-settings-sync|sync-sign-out/);
  assert.match(settings, /data-privacy-note/, 'the privacy line stays in Pomoć');
  assert.match(fn('refreshSyncCard'), /if \(\['settings', 'account'\]\.includes\(currentRoute\(\)\.type\) && !editingText\(\)\) render\(\);/);
});

test('the Serbian text', () => {
  for (const [en, value] of [['This device', 'Ovaj uređaj'], ['Sync is not set up yet, so there is no account to sign in to.', 'Sinhronizacija još nije podešena, pa nema naloga za prijavu.'], ['Everything stays only on this device. Backups are in Settings → Data.', 'Sve ostaje samo na ovom uređaju. Rezervne kopije su u Podešavanja → Podaci.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R15 is released as 2.0.0-alpha.38', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.38');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.38';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.38');
});
