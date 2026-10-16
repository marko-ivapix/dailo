// R92: Navike for a beginner. Next to the streak, the success of the last 30 days, which a single missed day lowers
// a little instead of resetting. One line on Navike says what ✓, ✗ and an empty circle mean and what grows a streak.
// The habit window keeps the name, tracking, frequency and reminder in view; area and routine join the other
// settings under "Više opcija". The habit details fold the advanced settings the same way.
// Spec: docs/superpowers/specs/2026-10-15-r92-habits-beginner.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name, ['js/habits-ui.js']).source;
const habits = read('js/habits-ui.js');
const TODAY = '2026-10-15';
const habit = (fields = {}) => ({ id: 'h', name: 'Walk', status: 'active', frequencyType: 'daily', trackingType: 'checkbox', startDate: '2026-09-01', createdAt: '2026-09-01T08:00:00.000Z', ...fields });
const log = (date, status = 'done') => ({ habitId: 'h', date, status, value: status === 'done' ? 1 : null });
const days = (from, count) => Array.from({ length: count }, (_, index) => Core.addDays(from, index));

test('the last 30 days: done of planned, skipped days left out, today only once done', () => {
  const all = days('2026-09-16', 29).map(date => log(date)); // 16 Sep … 14 Oct
  assert.equal(Core.habitRecentSuccess(habit(), all, TODAY), 100, 'today is still open, so it does not count yet');
  assert.equal(Core.habitRecentSuccess(habit(), [...all.filter(item => item.date !== '2026-10-14')], TODAY), 97, 'one missed day: 28 of 29');
  assert.equal(Core.habitRecentSuccess(habit(), [...all.filter(item => item.date !== '2026-10-14'), log('2026-10-14', 'skipped')], TODAY), 100, 'a skipped day is left out');
  assert.equal(Core.habitRecentSuccess(habit(), [...all, log(TODAY)], TODAY), 100);
  assert.equal(Core.habitRecentSuccess(habit({ startDate: '2026-10-11' }), [log('2026-10-11'), log('2026-10-13')], TODAY), 50, 'only the days since the start: 2 of 4');
  assert.equal(Core.habitRecentSuccess(habit({ startDate: TODAY }), [], TODAY), null, 'nothing planned yet');
});

test('the habit row and the details show the 30 days next to the streak', () => {
  assert.match(fn('dayMeta'), /const success = ctx\.Core\.habitRecentSuccess\(habit, ctx\.state\.habitLogCache\?\.\[habit\.id\] \|\| \[\], today, ctx\.Core\.habitWeekRule\(ctx\.state\.settings\)\);/);
  assert.match(fn('dayMeta'), /const recent = success == null \? '' : ` · \$\{tr\('\{percent\}% in 30 days', \{ percent: success \}\)\}`;/);
  assert.match(fn('dayMeta'), /return `\$\{frequency\} · \$\{trn\(metrics\.currentStreak \|\| 0, 'streak \{count\} day', 'streak \{count\} days'\)\}\$\{recent\}`;/);
  const details = fn('renderHabitDetails');
  assert.match(details, /tile\(success == null \? '—' : `\$\{success\}%`, tr\('Last 30 days'\)\)/);
  assert.doesNotMatch(details, /tr\('Done this week'\)/, 'the week is in Uvid already');
});

test('Navike says what ✓, ✗ and an empty circle mean and what grows a streak', () => {
  assert.match(fn('renderHabitsDay'), /return shown \? `\$\{html\}<p class="habits-legend">\$\{tr\('✓ done · ✗ marked “not done” \(no more reminders that day\) · empty: nothing marked yet\. Only ✓ grows a streak; a skipped day does not break it\.'\)\}<\/p>` :/);
  assert.ok(read('css/styles.css').includes('.habits-legend {'));
});

test('the habit window keeps the essentials in view; area and routine are under "Više opcija"', () => {
  const window = fn('renderHabitModal');
  const card = window.slice(window.indexOf('const card = '), window.indexOf('return modalFrame('));
  assert.doesNotMatch(card, /habit-draft-area|habit-draft-routine/);
  assert.match(card, /\$\{tracking\}[\s\S]*habit-draft-frequency[\s\S]*habit-draft-reminders/, 'tracking, frequency and reminder stay in view');
  const more = window.slice(window.indexOf('const more = '), window.indexOf('const tracking = '));
  assert.match(more, /habitWindowRow\(ctx, 'habit-draft-area', 'ph-squares-four', tr\('Area'\), area, tr\('No area \(optional\)'\)\)/);
  assert.match(more, /habitSegment\('habit-draft-routine', tr\('Routine'\)/);
  assert.match(window, /\$\{open \? tr\('Hide'\) : tr\('Area, routine, start, end, goals'\)\}/);
});

test('the habit details fold the advanced settings too', () => {
  const details = fn('renderHabitDetails');
  assert.match(details, /const open = ctx\.modalState\.moreOpen === true;/);
  assert.match(details, /<button class="habit-window-more" type="button" data-action="toggle-habit-details-more" aria-expanded="\$\{open\}"><strong>\$\{tr\('More settings'\)\}<\/strong><span>\$\{open \? tr\('Hide'\) : tr\('Grace days, continuation, start, end, goals'\)\}/);
  const basic = details.slice(details.indexOf('const rows = ['), details.indexOf('const advanced = ['));
  for (const action of ['habit-details-name', 'habit-draft-area', 'habit-details-routine', 'habit-details-tracking', 'habit-draft-frequency', 'habit-draft-reminders']) assert.ok(basic.includes(`'${action}'`), action);
  const advanced = details.slice(details.indexOf('const advanced = ['), details.indexOf('].join(\'\');', details.indexOf('const advanced = [')));
  for (const action of ['habit-draft-quick', 'habit-draft-targets', 'habit-details-grace', 'habit-details-continuation', 'habit-draft-start', 'habit-draft-end', 'habit-draft-goals']) assert.ok(advanced.includes(`'${action}'`), action);
  assert.match(habits, /if \(action === 'toggle-habit-details-more'\) \{ ctx\.modalState\.moreOpen = ctx\.modalState\.moreOpen !== true; ctx\.renderModal\(\); return true; \}/);
});

test('the new lines are Serbian; the guide explains the circle and the 30 days', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['{percent}% in 30 days', '{percent}% za 30 dana'], ['Last 30 days', 'Poslednjih 30 dana'],
    ['✓ done · ✗ marked “not done” (no more reminders that day) · empty: nothing marked yet. Only ✓ grows a streak; a skipped day does not break it.', '✓ urađeno · ✗ upisano „nije urađeno“ (tog dana nema više podsetnika) · prazno: još ništa nije upisano. Niz raste samo sa ✓, a preskočen dan ga ne prekida.'],
    ['Area, routine, start, end, goals', 'Oblast, rutina, početak, kraj, ciljevi'], ['Grace days, continuation, start, end, goals', 'Dani tolerancije, nastavak, početak, kraj, ciljevi'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  for (const gone of ['"Done this week"', '"Start, end, goals"']) assert.ok(!sr.includes(`${gone}:`), `${gone} is no longer used`);
  assert.ok(read('uputstvo.html').includes('Pored niza vidiš i <strong>uspešnost za poslednjih 30 dana</strong>: jedan propušten dan je malo spusti, a ne vraća na nulu.'));
});

test('R92 shipped as 2.0.0-alpha.119 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 119) >= 119);
});
