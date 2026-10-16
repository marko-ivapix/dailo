// R108: on a phone with on-screen system buttons (Android's three buttons or its gesture bar), a long sheet's sticky
// footer ("Završi zadatak", Sačuvaj, Primeni) stays above them while the sheet scrolls. The footer's own padding takes
// the bottom inset and its negative margin gives it back at the end, so a scrolled-to-the-end sheet looks as before.
// The inset is the one Capacitor's SystemBars injects (--safe-area-inset-bottom, 0 when the keyboard is open) or the
// browser's env(safe-area-inset-bottom). No data-model change.
// Spec: docs/superpowers/specs/2026-10-16-r108-sheet-footer-inset.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');

test('a token holds the bottom inset: the injected value first, the browser value otherwise', () => {
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  assert.match(root, /--safe-bottom: var\(--safe-area-inset-bottom, env\(safe-area-inset-bottom, 0px\)\);/);
});

test('every sticky sheet footer keeps its button above the system buttons and gives the space back at the end', () => {
  const rule = ':is(.task-window-footer, .sheet-footer, .quick-sheet-footer) { margin-bottom: calc(-1 * var(--safe-bottom)); padding-bottom: calc(4px + var(--safe-bottom)); }';
  const at = css.indexOf(rule);
  assert.ok(at > 0, 'the rule exists');
  assert.ok(at > css.indexOf('.task-window-footer { position: sticky; bottom: 0;') && at > css.indexOf(':is(.sheet-footer, .quick-sheet-footer) { position: sticky; bottom: 0;'), 'after the sticky rules it adjusts');
  assert.ok(at < css.indexOf('/* Keep primary compact actions touchable after all density rules. */'), 'before the touch-target marker');
  // The sheets that hold these footers already end with the inset, so the negative margin only takes back that space.
  for (const container of [
    '.popover.popover--sheet { left: 50%; right: auto; top: auto; bottom: 0; width: min(560px, 100vw); max-height: min(calc(var(--viewport-height) * 0.86), 720px); overflow: auto; transform: translateX(-50%); padding: 0 16px calc(16px + env(safe-area-inset-bottom));',
    '.quick-sheet { padding-bottom: max(14px, env(safe-area-inset-bottom)); }',
    '.modal-inner { padding: 11px 12px max(12px, env(safe-area-inset-bottom)); }',
  ]) assert.ok(css.includes(container), container.slice(0, 40));
});

test('the Android app hands the inset to the page', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.deepEqual([config.plugins.SystemBars.insetsHandling, config.plugins.SystemBars.initialViewportFitValueHint], ['css', 'cover']);
  assert.match(read('index.html'), /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  assert.ok(read('novo.html').includes('Dugme na dnu prozora više nije ispod sistemskih dugmadi'));
});

test('R108 is released as 2.0.0-alpha.137', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.137');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.137';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.137');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['2.0.0-alpha.137', '2.0.0-alpha.137']);
});
