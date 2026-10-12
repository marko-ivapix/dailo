// R56: js/app.js starts to split into modules. The desktop sidebar (R47a) is the first part out: a domain module
// like the screens, which app.js only asks for its markup. Tests find functions wherever they live.
// Spec: docs/superpowers/specs/2026-10-12-r56-app-modules.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');
const { appSource, functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');

test('the helper finds a function in any file and reads the app across its split files', () => {
  assert.equal(functionSource('sidebarHtml').file, 'js/sidebar-ui.js');
  assert.equal(functionSource('renderSidebar').file, 'js/app.js');
  assert.match(functionSource('sidebarProjectGroups').source, /^\s*function sidebarProjectGroups\(ctx\) \{/);
  assert.throws(() => functionSource('noSuchFunction'), /not found/);
  assert.ok(appSource().includes('function sidebarHtml(ctx)') && appSource().includes('function renderView('));
});

test('the sidebar is a domain module; app.js keeps only the glue', () => {
  const module = read('js/sidebar-ui.js');
  assert.match(module, /window\.TodoDomainModules\?\.register\(\{\n    name: 'sidebar',/);
  assert.match(module, /if \(route\.type === 'sidebar'\) return sidebarHtml\(ctx\);/);
  assert.match(module, /if \(action === 'toggle-sidebar'\) \{ toggleSidebar\(ctx\); return true; \}/);
  assert.match(module, /if \(action === 'sidebar-fold'\) \{ toggleSidebarFold\(ctx, event\?\.target\?\.closest\?\.\('\[data-group\]'\)\?\.dataset\.group\); return true; \}/);
  for (const name of ['sidebarProjectGroups', 'readSidebarFolds', 'toggleSidebarFold', 'toggleSidebar']) {
    assert.doesNotMatch(app, new RegExp(`\\n  function ${name}\\(`), `${name} left app.js`);
  }
  assert.match(functionSource('renderSidebar').source, /aside\.innerHTML = callDomainHook\('renderRoute', \{ type: 'sidebar' \}\) \|\| '';/);
  assert.match(app, /if \(event\.key === '\[' && !event\.ctrlKey && !event\.metaKey && !event\.altKey && wideScreen\(\)\) \{ event\.preventDefault\(\); callDomainHook\('handleAction', 'toggle-sidebar', null\); return; \}/);
  assert.match(app, /\n      bottomNavRoute, activeInboxRecords, renderSidebar,\n/, 'what the module needs from the app');
});

test('the module loads before app.js, is precached and copied into the native shell', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="js/sidebar-ui.js"') > html.indexOf('src="js/journal-ui.js"') && html.indexOf('src="js/sidebar-ui.js"') < html.indexOf('src="js/app.js"'));
  assert.match(read('sw.js'), /'js\/journal-ui\.js',\n  'js\/sidebar-ui\.js',/);
});

test('a plan names the next parts and how they move', () => {
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  for (const part of ['sidebar-ui.js', 'tests/support/source.js', 'domainContext', 'quick-add', 'drag', 'account']) assert.ok(plan.includes(part), part);
});

test('R56 shipped as 2.0.0-alpha.83 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 83);
});
