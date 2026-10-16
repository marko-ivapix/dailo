// R98: Dnevnik. The entry offers a question about the day (not a task): one per day from a short list, "Drugo pitanje"
// for the next one, and "Upiši" puts it into the text so the answer follows it. The entry lists the tasks completed
// that day. The Journal screen shows an insight about mood and habits ("Dani sa „Šetnja“: 4,1 · ostali dani: 3,2").
// The lock was checked: in the phone app it already opens with a fingerprint, face or the phone's PIN; the guide says so.
// Spec: docs/superpowers/specs/2026-10-15-r98-journal.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const at = (date, time = '18:00') => new Date(`${date}T${time}:00`).toISOString();
const days = (from, count) => Array.from({ length: count }, (_, index) => Core.addDays(from, index));

test('one question about the day, the same all day, and the next one on request', () => {
  assert.equal(Core.JOURNAL_QUESTIONS.length, 10);
  assert.equal(Core.journalQuestion('2026-10-15'), Core.journalQuestion('2026-10-15'));
  assert.notEqual(Core.journalQuestion('2026-10-15'), Core.journalQuestion('2026-10-16'), 'another day, another question');
  assert.notEqual(Core.journalQuestion('2026-10-15', 1), Core.journalQuestion('2026-10-15'));
  assert.equal(Core.journalQuestion('2026-10-15', 10), Core.journalQuestion('2026-10-15'), 'the list goes round');
  assert.ok(Core.JOURNAL_QUESTIONS.every(question => question.endsWith('?')));
});

test('the tasks completed on a day, in the order they were done', () => {
  const state = { tasks: [
    { id: 'b', title: 'B', isCompleted: true, completedAt: at('2026-10-15', '16:00') }, { id: 'a', title: 'A', isCompleted: true, completedAt: at('2026-10-15', '09:00') },
    { id: 'old', title: 'Old', isCompleted: true, completedAt: at('2026-10-14') }, { id: 'open', title: 'Open', isCompleted: false },
  ] };
  assert.deepEqual(Core.completedOn(state, '2026-10-15').map(task => task.id), ['a', 'b']);
});

test('mood and habits: days with a habit done against the other days with a mood', () => {
  const habit = { id: 'h', name: 'Šetnja', status: 'active', frequencyType: 'daily', trackingType: 'checkbox', startDate: '2026-07-01' };
  const quiet = { id: 'q', name: 'Čitanje', status: 'active', frequencyType: 'daily', trackingType: 'checkbox', startDate: '2026-07-01' };
  const walked = days('2026-10-01', 5), rest = days('2026-10-06', 4);
  const journal = [...walked.map(date => ({ date, mood: date === '2026-10-01' ? 4 : 4 + (date === '2026-10-02' ? 1 : 0) })), ...rest.map(date => ({ date, mood: 3 }))];
  const logs = walked.map(date => ({ habitId: 'h', date, status: 'done', value: null }));
  const insights = Core.moodInsights({ habits: [habit, quiet], journal }, logs, '2026-10-15');
  assert.equal(insights.length, 1, 'a habit never done tells nothing');
  assert.deepEqual(JSON.parse(JSON.stringify(insights[0])), { habitId: 'h', name: 'Šetnja', with: 4.2, without: 3, withDays: 5, withoutDays: 4 });
  assert.deepEqual(Core.moodInsights({ habits: [habit], journal: journal.slice(0, 6) }, logs, '2026-10-15'), [], 'fewer than three days on a side is not enough');
  const flat = journal.map(item => ({ ...item, mood: 3 }));
  assert.deepEqual(Core.moodInsights({ habits: [habit], journal: flat }, logs, '2026-10-15'), [], 'no difference worth saying');
});

test('the entry window: the question, "Upiši", "Drugo pitanje" and the completed tasks', () => {
  const entry = functionSource('renderEntry', ['js/journal-ui.js']).source;
  assert.match(entry, /const question = tr\(ctx\.Core\.journalQuestion\(date, ctx\.modalState\.questionOffset \|\| 0\)\);/);
  assert.match(entry, /<div class="journal-question"><p class="journal-question-text">\$\{esc\(question\)\}<\/p><div class="journal-question-actions"><button class="quick-chip" type="button" data-action="journal-question-insert">\$\{tr\('Write it in'\)\}<\/button><button class="quick-chip" type="button" data-action="journal-question-next">\$\{tr\('Another question'\)\}<\/button><\/div><\/div>/);
  assert.match(entry, /const done = ctx\.Core\.completedOn\(ctx\.state, date\);/);
  assert.match(entry, /<ul class="journal-done">/);
  const ui = read('js/journal-ui.js');
  assert.match(ui, /if \(action === 'journal-question-next'\) \{ ctx\.modalState\.questionOffset = \(ctx\.modalState\.questionOffset \|\| 0\) \+ 1; ctx\.renderModal\(\); return true; \}/);
  assert.match(functionSource('insertQuestion', ['js/journal-ui.js']).source, /field\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);/);
});

test('the Journal screen shows the insight; the guide covers the questions, the insight and the lock', () => {
  const list = functionSource('renderList', ['js/journal-ui.js']).source;
  assert.match(list, /\+ \(month === current && !query\.trim\(\) \? moodInsight\(ctx, today\) : ''\)/);
  const insight = functionSource('moodInsight', ['js/journal-ui.js']).source;
  assert.match(insight, /tr\('Days with “\{habit\}”: \{with\} · other days: \{without\}', \{ habit: item\.name, with: one\(item\.with\), without: one\(item\.without\) \}\)/);
  const css = read('css/styles.css');
  for (const rule of ['.journal-question {', '.journal-question-text {', '.journal-question-actions {', '.journal-done {', '.journal-insight {']) assert.ok(css.includes(rule), rule);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['What was good today?', 'Šta je danas bilo dobro?'], ['What are you grateful for today?', 'Za šta danas osećaš zahvalnost?'], ['Write it in', 'Upiši'], ['Another question', 'Drugo pitanje'],
    ['Days with “{habit}”: {with} · other days: {without}', 'Dani sa „{habit}“: {with} · ostali dani: {without}'], ['Mood and habits', 'Raspoloženje i navike'],
    ['The average mood (1–5) over the last 90 days.', 'Prosečna ocena raspoloženja (1–5) u poslednjih 90 dana.'], ['Completed that day', 'Završeno tog dana'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('U unosu dnevnika te čeka jedno pitanje o danu (<strong>Upiši</strong> ga stavlja u tekst, <strong>Drugo pitanje</strong> nudi sledeće) i spisak zadataka završenih tog dana. Na ekranu Dnevnik je i uvid: kakvo je raspoloženje danima kad uradiš neku naviku, a kakvo ostalim danima. U aplikaciji za telefon dnevnik možeš da zaključaš (⋯ na ekranu Dnevnik), pa se otvara otiskom prsta, licem ili PIN-om telefona.'));
});

test('R98 shipped as 2.0.0-alpha.125 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 125) >= 125);
});
