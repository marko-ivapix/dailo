// R89: Quick Add understands more of how people write and speak Serbian. Times: "pola deset" 9:30, "četvrt do
// osam" 7:45, "u osam i četvrt" / "četvrt posle osam" 8:15, "u osam i po" 8:30, "u osam" 8:00, with "ujutru" or
// "uveče" / "popodne"; "pola jedan" is half past noon. A repeat at the end of the title: "utorkom", "ponedeljkom i
// četvrtkom", "radnim danima", "svaki dan", "svakog meseca", "svake godine", "svake nedelje", "svakog utorka",
// "svakog drugog utorka", "svaka 3 dana", "svakih 6 meseci", and a few English forms; a repeating task without a day
// is planned for its first day. Cyrillic typing is recognized too ("сутра у 9:30"), and the title keeps its script.
// Spec: docs/superpowers/specs/2026-10-15-r89-quick-add-words.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15'; // a Thursday
const parse = (title, options = {}) => JSON.parse(JSON.stringify(Core.parseQuickAdd(title, { today: TODAY, ...options })));

test('spoken times: pola, četvrt do, i četvrt, četvrt posle, i po, u osam, ujutru and uveče', () => {
  for (const [title, time, rest] of [
    ['Sastanak pola deset', '09:30', 'Sastanak'], ['Sastanak u pola deset', '09:30', 'Sastanak'], ['Sastanak pola 10', '09:30', 'Sastanak'],
    ['Trening četvrt do osam', '07:45', 'Trening'], ['Trening cetvrt do osam', '07:45', 'Trening'], ['Trening u četvrt do osam', '07:45', 'Trening'],
    ['Pozovi mamu u osam i četvrt', '08:15', 'Pozovi mamu'], ['Pozovi mamu četvrt posle osam', '08:15', 'Pozovi mamu'],
    ['Trčanje u šest i po', '06:30', 'Trčanje'], ['Trčanje u šest ujutru', '06:00', 'Trčanje'], ['Bioskop u 8 uveče', '20:00', 'Bioskop'],
    ['Večera u pola devet uveče', '20:30', 'Večera'], ['Kafa u tri popodne', '15:00', 'Kafa'], ['Ručak u pola jedan', '12:30', 'Ručak'],
    ['Lekar u jedanaest', '11:00', 'Lekar'], ['Lekar u dvanaest i po', '12:30', 'Lekar'],
  ]) {
    const parsed = parse(title);
    assert.equal(parsed.plannedTime, time, title);
    assert.equal(parsed.title, rest, title);
  }
  const both = parse('Zubar sutra u pola deset');
  assert.deepEqual([both.plannedDate, both.plannedTime, both.title], ['2026-10-16', '09:30', 'Zubar']);
});

test('quantities stay in the title: a time needs "u" unless it is "pola X" or "četvrt do / posle X"', () => {
  for (const title of ['Pretrči pet i po', 'Kupi dva i po', 'Pojedi pola jabuke', 'Kupi osam', 'Popij pola']) {
    const parsed = parse(title);
    assert.equal(parsed.plannedTime, null, title);
    assert.equal(parsed.title, title, title);
  }
});

test('a repeat at the end of the title becomes the task\'s repeat', () => {
  for (const [title, rule, rest] of [
    ['Iznesi smeće utorkom', { frequency: 'weekly', interval: 1, weekdays: [2] }, 'Iznesi smeće'],
    ['Teretana ponedeljkom i četvrtkom', { frequency: 'weekly', interval: 1, weekdays: [1, 4] }, 'Teretana'],
    ['Teretana ponedeljkom i cetvrtkom', { frequency: 'weekly', interval: 1, weekdays: [1, 4] }, 'Teretana'],
    ['Pijaca subotom', { frequency: 'weekly', interval: 1, weekdays: [6] }, 'Pijaca'],
    ['Šetnja vikendom', { frequency: 'weekly', interval: 1, weekdays: [0, 6] }, 'Šetnja'],
    ['Trening radnim danima', { frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }, 'Trening'],
    ['Zalij cveće svaki dan', { frequency: 'daily', interval: 1 }, 'Zalij cveće'],
    ['Zalij cveće svakog dana', { frequency: 'daily', interval: 1 }, 'Zalij cveće'],
    ['Plati račune svakog meseca', { frequency: 'monthly', interval: 1 }, 'Plati račune'],
    ['Čestitaj rođendan svake godine', { frequency: 'yearly', interval: 1 }, 'Čestitaj rođendan'],
    ['Pregled svake nedelje', { frequency: 'weekly', interval: 1 }, 'Pregled'],
    ['Pozovi baku svakog petka', { frequency: 'weekly', interval: 1, weekdays: [5] }, 'Pozovi baku'],
    ['Sastanak tima svakog drugog utorka', { frequency: 'weekly', interval: 2, weekdays: [2] }, 'Sastanak tima'],
    ['Pregled svake druge nedelje', { frequency: 'weekly', interval: 2 }, 'Pregled'],
    ['Usisaj svakog trećeg dana', { frequency: 'daily', interval: 3 }, 'Usisaj'],
    ['Promeni filter svaka 3 meseca', { frequency: 'monthly', interval: 3 }, 'Promeni filter'],
    ['Zalij cveće svakih 5 dana', { frequency: 'daily', interval: 5 }, 'Zalij cveće'],
    ['Servis auta svakih 6 meseci', { frequency: 'monthly', interval: 6 }, 'Servis auta'],
    ['Krečenje svake 2 godine', { frequency: 'yearly', interval: 2 }, 'Krečenje'],
    ['Call mom every monday', { frequency: 'weekly', interval: 1, weekdays: [1] }, 'Call mom'],
    ['Water plants every 3 days', { frequency: 'daily', interval: 3 }, 'Water plants'],
    ['Stretch every day', { frequency: 'daily', interval: 1 }, 'Stretch'],
  ]) {
    const parsed = parse(title);
    assert.deepEqual(parsed.recurrence, rule, title);
    assert.equal(parsed.title, rest, title);
  }
});

test('a repeating task without a day is planned for its first day; a written day and time still count', () => {
  assert.equal(parse('Iznesi smeće utorkom').plannedDate, '2026-10-20', 'the next Tuesday');
  assert.equal(parse('Teretana četvrtkom').plannedDate, TODAY, 'today is a Thursday');
  assert.equal(parse('Zalij cveće svaki dan').plannedDate, TODAY);
  const timed = parse('Iznesi smeće utorkom u 20h');
  assert.deepEqual([timed.recurrence.weekdays, timed.plannedDate, timed.plannedTime, timed.title], [[2], '2026-10-20', '20:00', 'Iznesi smeće']);
  const dated = parse('Plati kiriju svakog meseca 1.11.');
  assert.deepEqual([dated.recurrence.frequency, dated.plannedDate, dated.title], ['monthly', '2026-11-01', 'Plati kiriju']);
  assert.equal(parse('Iznesi smeće utorkom', { parsePlan: false }).plannedDate, null, 'a day picked in the sheet wins');
  assert.equal(parse('Do petka').dueDate, null, 'a title of two words stays a title');
  assert.equal(parse('Plati račun do petka').dueDate, '2026-10-16', '"do petka" is still a deadline');
});

test('Cyrillic typing is recognized; the title keeps its script; tags, projects and priority match too', () => {
  const milk = parse('Купи млеко сутра у 9:30');
  assert.deepEqual([milk.plannedDate, milk.plannedTime, milk.title], ['2026-10-16', '09:30', 'Купи млеко']);
  assert.equal(parse('Позови маму у пола девет').plannedTime, '08:30');
  const trash = parse('Изнеси смеће уторком');
  assert.deepEqual([trash.recurrence.weekdays, trash.title], [[2], 'Изнеси смеће']);
  const tagged = parse('Извештај #посао +клијенти !висок', { tags: [{ id: 'tg', name: 'Posao' }], projects: [{ id: 'pr', name: 'Klijenti' }] });
  assert.deepEqual([tagged.tagIds, tagged.projectId, tagged.priority, tagged.title], [['tg'], 'pr', 'high', 'Извештај']);
});

test('Quick Add shows the repeat it recognized and gives it to the task; a repeat picked in the sheet wins', () => {
  assert.match(functionSource('quickParsePreview').source, /if \(parsed\.recurrence\) items\.push\(item\('ph-arrows-clockwise', recurrenceLabel\(parsed\.recurrence\)\)\);/);
  assert.match(functionSource('createTask').source, /recurrence: d\.recurrence \|\| parsed\.recurrence \|\| null,/);
});

test('the guide lists the new words', () => {
  const guide = read('uputstvo.html');
  assert.ok(guide.includes('Vreme: <code>u 9:30</code>, <code>u 18h</code>, <code>pola deset</code>, <code>četvrt do osam</code>, <code>u osam i po</code>, <code>u osam uveče</code>.'));
  assert.ok(guide.includes('Ponavljanje: <code>utorkom</code>, <code>ponedeljkom i četvrtkom</code>, <code>radnim danima</code>, <code>svaki dan</code>, <code>svakog meseca</code>, <code>svakog drugog utorka</code>, <code>svaka 3 dana</code>.'));
  assert.ok(guide.includes('Reči za datum, vreme i ponavljanje prepoznaje i kad ih otkucaš ćirilicom.'), 'the public pages stay in Latin script');
});

test('R89 is released as 2.0.0-alpha.116', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.116');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.116';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.116');
});
