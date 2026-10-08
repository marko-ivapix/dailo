const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const Release = require('../js/release.js');

function renderSettings() {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
    release: Release, environmentInfo: () => ({ userAgent: 'TestAgent/1.0', standalone: true }),
  });
}

test('V1.9.1 ships the beta report address and a new version so installed apps see the update', () => {
  assert.equal(Release.APP_VERSION, '1.9.1');
  assert.equal(Release.REPORT_EMAIL, 'marko.radicevic@ivapix.cloud');
  assert.match(read('sw.js'), /const VERSION = '1\.9\.1';/);
});

test('Settings → About links the beta guide in a separate view and shows the report link', () => {
  const html = renderSettings();
  assert.match(html, /<a class="btn btn-secondary" href="uputstvo\.html" target="_blank" rel="noopener" data-beta-guide>/);
  assert.match(html, /href="mailto:marko\.radicevic@ivapix\.cloud\?subject=/);
});

test('the beta guide is a self-contained Serbian page with install, data, backup, limits and report sections', () => {
  const html = read('uputstvo.html');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="sr-Latn">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.doesNotMatch(html, /[Ѐ-ӿ]/, 'Latin script only');
  for (const heading of ['Instalacija na iPhone', 'Tvoji podaci', 'Rezervne kopije', 'Bez interneta i nove verzije', 'Šta još ne radi', 'Prijava problema']) {
    assert.match(html, new RegExp(`<h2[^>]*>${heading}</h2>`), heading);
  }
  for (const label of ['Dodaj na početni ekran', 'Podešavanja', 'Izvezi rezervnu kopiju', 'Osveži', 'Prijavi problem']) assert.ok(html.includes(label), label);
  assert.match(html, /href="mailto:marko\.radicevic@ivapix\.cloud"/);
  assert.match(html, /href="\.\/"/, 'links back to the app');
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  for (const reference of references) {
    if (/^(?:mailto:|\.\/$|#)/.test(reference)) continue;
    assert.doesNotMatch(reference, /^[a-z]+:/i, `${reference} must be a local file`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', reference)), `${reference} exists`);
  }
});
