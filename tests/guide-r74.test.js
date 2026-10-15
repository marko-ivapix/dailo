// R74: the guide (uputstvo.html) follows the app as it is now. It names the optional account and sync, the
// labels the app really shows (Izvezi ZIP / Uvezi ZIP, VRATI, Podešavanja → Pomoć, Još → Biblioteka for Nedeljni
// pregled, Kalendar → Raspored), the "+" per screen, the gestures and habit states, the automatic copy on the phone,
// the reminder limits, and links the FAQ. Nothing from the time before accounts stays.
// Spec: docs/superpowers/specs/2026-10-15-r74-guide-update.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('uputstvo.html');
const meta = name => html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"\\s*/?>`))?.[1];
const headings = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]);
const section = heading => html.match(new RegExp(`<h2>${heading}</h2>([\\s\\S]*?)</section>`))?.[1] || '';

test('nothing from the time before accounts and sync stays in the guide', () => {
  for (const old of ['RESTORE', 'bez naloga i bez servera', 'O aplikaciji', 'Izvezi rezervnu kopiju', 'Uvezi rezervnu kopiju', 'Ne postoji nalog', 'stiže sa mobilnom aplikacijom', 'na ekranu <strong>Danas</strong> predloži']) {
    assert.ok(!html.includes(old), old);
  }
  assert.doesNotMatch(html, /Zaboravio|Zaboravila|dobio\/la|\/la\b/, 'no gendered forms');
});

test('the title and preview describe the guide for everyone, not only beta testers', () => {
  assert.match(html, /<title>Dailo — uputstvo<\/title>/);
  assert.equal(meta('og:title'), 'Dailo — uputstvo');
  assert.match(html, /<h1>Dailo — uputstvo<\/h1>/);
  const description = meta('description');
  assert.ok(description.length >= 50 && description.length <= 160, description);
  assert.equal(meta('og:description'), description);
  assert.match(description, /nalog/);
});

test('the sections follow the app: account and sync, gestures and reminders are new', () => {
  // R94: "Projekti" (status and next step) follows the gestures and habits; R95: then "Redovne obaveze" (the bar).
  assert.deepEqual(headings, [
    'Instalacija', 'Nalog i sinhronizacija', 'Tvoji podaci', 'Rezervne kopije', 'Brzo dodavanje', 'Pokreti i navike', 'Projekti',
    'Redovne obaveze', 'Raspored dana', 'Nedeljni pregled', 'Podsetnici', 'Bez interneta i nove verzije', 'Šta još ne radi', 'Prijava problema',
  ]);
});

test('account and sync name the welcome choices and the Nalog screen', () => {
  const account = section('Nalog i sinhronizacija');
  for (const label of ['Registruj se', 'Prijavi se', 'Nastavi bez naloga', 'Zaboravljena lozinka?', 'Još → Nalog', 'Sinhronizuj sada', 'Šifrovan dnevnik', 'Odjavi se', 'Obriši nalog', '<code>OBRIŠI</code>']) {
    assert.ok(account.includes(label), label);
  }
  assert.ok(section('Tvoji podaci').includes('Frankfurt') && section('Tvoji podaci').includes('href="privatnost.html"'));
});

test('backups use the labels of Podešavanja → Podaci and the restore word VRATI', () => {
  const backups = section('Rezervne kopije');
  for (const label of ['Podešavanja → Podaci', 'Izvezi ZIP', 'Uvezi ZIP', '<code>VRATI</code>', 'Podsetnik za rezervnu kopiju', 'Automatska rezervna kopija', 'Dokumenti/Dailo', 'četiri']) {
    assert.ok(backups.includes(label), label);
  }
});

test('adding, gestures, the day schedule and the weekly review are where the app has them', () => {
  assert.ok(section('Brzo dodavanje').includes('<strong>+</strong>'));
  assert.ok(section('Brzo dodavanje').includes('Drži'));
  const gestures = section('Pokreti i navike');
  for (const word of ['udesno', 'ulevo', 'gore ili dole', 'Nije urađeno', 'na svom mestu']) assert.ok(gestures.includes(word), word);
  const day = section('Raspored dana');
  for (const label of ['Kalendar', 'Raspored', 'Bez vremena', 'Dnevni kapacitet', 'Podešavanja → Opšte']) assert.ok(day.includes(label), label);
  const review = section('Nedeljni pregled');
  for (const label of ['Još → Biblioteka', 'Vreme je za pregled ove nedelje', 'Završi nedeljni pregled']) assert.ok(review.includes(label), label);
});

test('reminders say where they arrive; the limits are the ones still true', () => {
  const reminders = section('Podsetnici');
  for (const text of ['Podešavanja → Podsetnici', 'Probni podsetnik', 'dok je Dailo otvoren', 'i kad je zatvorena']) assert.ok(reminders.includes(text), text);
  const limits = section('Šta još ne radi');
  assert.ok(limits.includes('Google') && limits.includes('Apple'), 'sign-in with Google and Apple is not on yet');
  assert.doesNotMatch(limits, /samo na jednom uređaju|Sinhronizacija/, 'sync works now');
});

test('reporting a problem goes through Podešavanja → Pomoć and the FAQ is linked', () => {
  const report = section('Prijava problema');
  assert.ok(report.includes('Podešavanja → Pomoć') && report.includes('Prijavi problem'));
  assert.ok(report.includes(`href="mailto:${Release.REPORT_EMAIL}"`));
  assert.ok(report.includes('href="pitanja.html"'));
});

test('R74 shipped as 2.0.0-alpha.101 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 101) >= 101);
});
