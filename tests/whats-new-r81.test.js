// R81: "Šta je novo" (novo.html), a public Serbian page with the recent changes by day, newest first. Podešavanja →
// Pomoć opens it, and after an update a toast says so once, with a link to it. The device-local key dailoSeenVersion
// remembers the version this device last started; a first start only remembers it.
// Spec: docs/superpowers/specs/2026-10-15-r81-whats-new.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const SITE = 'https://marko-ivapix.github.io/dailo/';
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"\\s*/?>`))?.[1];
const css = read('css/styles.css');
const beforeMarker = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));

test('novo.html: a Serbian public page with a description and the sharing preview', () => {
  const html = read('novo.html');
  assert.match(html, /^<!doctype html>\n<html lang="sr-Latn">/);
  assert.match(html, /<title>Dailo — Šta je novo<\/title>/);
  const description = meta(html, 'name', 'description');
  assert.ok(description && description.length >= 50 && description.length <= 160, 'a description of 50–160 characters');
  assert.equal(meta(html, 'property', 'og:description'), description);
  assert.equal(meta(html, 'property', 'og:title'), 'Dailo — Šta je novo');
  assert.equal(meta(html, 'property', 'og:url'), `${SITE}novo.html`);
  assert.equal(meta(html, 'property', 'og:image'), `${SITE}icons/og-image.png`);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /<a class="back" href="\.\/">Otvori Dailo<\/a>/);
  assert.doesNotMatch(html, /[Ѐ-ӿ]/, 'Latin script only');
  assert.doesNotMatch(html, /Zaboravio|Zaboravila|\/la\b|preimenovao|pomerio/, 'no gendered forms');
});

test('the changes are grouped by day, newest first, and name what really changed', () => {
  const html = read('novo.html');
  const days = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]);
  assert.deepEqual(days.slice(0, 3), ['15. oktobar 2026.', '14. oktobar 2026.', '13. oktobar 2026.']);
  assert.ok(html.includes(Release.APP_VERSION), 'the newest version is named');
  for (const fact of ['Sutra', 'šifrovan', '.ics', 'Čeka se veza', 'Još → Nalog', 'Česta pitanja', 'Nedeljni pregled', 'Okvirno', 'Odjavi se', 'tri stanja']) assert.ok(html.includes(fact), fact);
  assert.ok(html.includes('href="uputstvo.html"') && html.includes('href="pitanja.html"'));
});

test('Podešavanja → Pomoć opens it; the phone app opens it online; the link check covers it', async () => {
  assert.match(read('js/settings-ui.js'), /<div class="settings-row"><div class="settings-label"><strong>\$\{tr\("What's new"\)\}<\/strong><span>\$\{tr\('The changes in recent versions, in short\.'\)\}<\/span><\/div><a class="btn btn-secondary" href="novo\.html" target="_blank" rel="noopener" data-whats-new>\$\{tr\("See what's new"\)\}<\/a><\/div>/);
  assert.equal(Release.WHATS_NEW_URL, `${SITE}novo.html`);
  assert.match(read('js/app.js'), /'novo\.html': Release\.WHATS_NEW_URL/);
  const { PAGES, findInternalProblems } = await import('../tools/check-links.mjs');
  assert.ok(PAGES.includes('novo.html'));
  assert.deepEqual(findInternalProblems(path.join(__dirname, '..')), []);
});

function announce(stored, { throws = false } = {}) {
  const storage = new Map(stored == null ? [] : [['dailoSeenVersion', stored]]);
  const toasts = [];
  const ctx = withI18n({
    Release: { APP_VERSION: '2.0.0-alpha.108' },
    localStorage: { getItem: key => { if (throws) throw new Error('blocked'); return storage.get(key) ?? null; }, setItem: (key, value) => storage.set(key, String(value)) },
    setToastMessage: (message, link) => toasts.push([message, link]),
  });
  vm.createContext(ctx);
  vm.runInContext(`${read('js/app.js').match(/  const SEEN_VERSION_KEY = [^\n]+/)[0]}\n${functionSource('announceUpdate').source}\nthis.announceUpdate = announceUpdate;`, ctx);
  ctx.announceUpdate();
  return { storage, toasts: JSON.parse(JSON.stringify(toasts)) };
}

test('after an update a toast says so once and links "Šta je novo"; a first start only remembers the version', () => {
  const first = announce(null);
  assert.deepEqual(first.toasts, []);
  assert.equal(first.storage.get('dailoSeenVersion'), '2.0.0-alpha.108');
  assert.deepEqual(announce('2.0.0-alpha.108').toasts, []);
  const updated = announce('2.0.0-alpha.107');
  assert.deepEqual(updated.toasts, [['Dailo is updated to {version}.'.replace('{version}', '2.0.0-alpha.108'), { href: 'novo.html', label: "What's new" }]]);
  assert.equal(updated.storage.get('dailoSeenVersion'), '2.0.0-alpha.108');
  assert.deepEqual(announce('x', { throws: true }).toasts, [], 'blocked storage stays quiet');
});

test('the toast\'s link opens the page; start-up announces after loading', () => {
  assert.match(read('js/app.js'), /toastLink\.href \? `<a class="toast-action" href="\$\{esc\(toastLink\.href\)\}" target="_blank" rel="noopener">\$\{esc\(tr\(toastLink\.label\)\)\}<\/a>`/);
  assert.ok(beforeMarker.includes('a.toast-action { display: inline-flex; align-items: center; text-decoration: none; }'));
  assert.match(functionSource('init').source, /if \(restored && state\) setToastMessage\(tr\('Your data was restored from the copy Dailo keeps on this device\.'\)\);\n\s+else if \(state\) announceUpdate\(\);/);
  assert.match(read('CLAUDE.md'), /`dailoSeenVersion`/, 'the device-local key is listed');
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ["What's new", 'Šta je novo'], ['The changes in recent versions, in short.', 'Ukratko, šta se promenilo u poslednjim verzijama.'],
    ["See what's new", 'Pogledaj novo'], ['Dailo is updated to {version}.', 'Dailo je ažuriran na {version}.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R81 shipped as 2.0.0-alpha.108 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 108) >= 108);
});
