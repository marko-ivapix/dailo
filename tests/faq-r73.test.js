// R73: "Česta pitanja" (pitanja.html), a public Serbian page of short answers that match the app as it is now:
// accounts and data, backups, the encrypted journal, the gestures, habits, reminders and help. Podešavanja → Pomoć
// opens it like the guide, the phone app opens it online, the link check covers it and the 404 page links it.
// Spec: docs/superpowers/specs/2026-10-14-r73-faq.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const SITE = 'https://marko-ivapix.github.io/dailo/';
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"\\s*/?>`))?.[1];

test('pitanja.html: a Serbian public page with a description and the sharing preview', () => {
  const html = read('pitanja.html');
  assert.match(html, /^<!doctype html>\n<html lang="sr-Latn">/);
  assert.match(html, /<title>Dailo — Česta pitanja<\/title>/);
  const description = meta(html, 'name', 'description');
  assert.ok(description && description.length >= 50 && description.length <= 160, 'a description of 50–160 characters');
  assert.equal(meta(html, 'property', 'og:description'), description);
  assert.equal(meta(html, 'property', 'og:title'), 'Dailo — Česta pitanja');
  assert.equal(meta(html, 'property', 'og:url'), `${SITE}pitanja.html`);
  assert.equal(meta(html, 'property', 'og:image'), `${SITE}icons/og-image.png`);
  assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.doesNotMatch(html, /<script/, 'no script: the questions open with <details>');
  assert.match(html, /<a class="back" href="\.\/">Otvori Dailo<\/a>/);
});

test('the questions fold open, and the answers name what the app really shows', () => {
  const html = read('pitanja.html');
  const questions = [...html.matchAll(/<details class="qa"><summary>([^<]+)<\/summary>/g)].map(match => match[1]);
  assert.ok(questions.length >= 18, `${questions.length} questions`);
  assert.equal(new Set(questions).size, questions.length, 'no question twice');
  for (const fact of [
    'Izvezi ZIP', 'Uvezi ZIP', 'VRATI', 'OBRIŠI', 'Zaboravljena lozinka?', 'Šifrovan dnevnik', 'Još → Nalog',
    'Podešavanja → Pomoć', 'Prijavi problem', 'Kad stignem', 'Redovne obaveze', 'Nedeljni pregled',
    'udesno', 'ulevo', 'gore ili dole', 'Nije urađeno', 'dok je Dailo otvoren', 'Frankfurt',
  ]) assert.ok(html.includes(fact), fact);
  assert.ok(html.includes(`href="mailto:${Release.REPORT_EMAIL}"`), 'the report address');
  assert.ok(html.includes('href="privatnost.html"') && html.includes('href="uputstvo.html"'));
  assert.doesNotMatch(html, /RESTORE|bez naloga i bez servera|Zaboravio|Zaboravila/, 'nothing from the old guide, no gendered forms');
});

test('Podešavanja → Pomoć opens the questions; the phone app opens them online', () => {
  const settings = read('js/settings-ui.js');
  assert.match(settings, /<div class="settings-row"><div class="settings-label"><strong>\$\{tr\('FAQ'\)\}<\/strong><span>\$\{tr\('Short answers about the account, your data, backups, reminders and gestures\.'\)\}<\/span><\/div><a class="btn btn-secondary" href="pitanja\.html" target="_blank" rel="noopener" data-faq>\$\{tr\('Open FAQ'\)\}<\/a><\/div>/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['FAQ', 'Česta pitanja'], ['Short answers about the account, your data, backups, reminders and gestures.', 'Kratki odgovori o nalogu, podacima, rezervnim kopijama, podsetnicima i pokretima.'], ['Open FAQ', 'Otvori pitanja']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.equal(Release.FAQ_URL, `${SITE}pitanja.html`);
  assert.match(read('js/app.js'), /'pitanja\.html': Release\.FAQ_URL/);
});

test('the link check covers the page and the 404 page links it', async () => {
  const { PAGES, findInternalProblems } = await import('../tools/check-links.mjs');
  assert.ok(PAGES.includes('pitanja.html'));
  assert.deepEqual(findInternalProblems(path.join(__dirname, '..')), []);
  assert.ok(read('404.html').includes('href="pitanja.html"'));
});

test('R73 shipped as 2.0.0-alpha.100 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 100) >= 100);
});
