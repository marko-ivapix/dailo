// R95: Redovne obaveze. A chore shows a bar that slowly fills until it is time (like Tody) instead of a strict deadline:
// the row of a chore whose day has passed reads "Vreme je · <date>" in amber, not a red "Kasni", and the header counts
// what is due now. One sentence says how a chore differs from a repeating task. New chores (the window and the
// apartment and house examples) get only a planned day, so a missed one is suggested again instead of turning red on
// Danas. The examples gain seasonal chores that start on their next day of the year.
// Spec: docs/superpowers/specs/2026-10-15-r95-chores.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15';
const weekly = { frequency: 'weekly', interval: 1, status: 'active' };

test('the bar: 0 right after the last time, full on its day, "late" once half an interval has passed', () => {
  assert.deepEqual([{ frequency: 'daily', interval: 3 }, weekly, { frequency: 'weekly', interval: 2 }, { frequency: 'weekly', interval: 1, weekdays: [1, 4] }, { frequency: 'monthly', interval: 6 }, { frequency: 'yearly', interval: 1 }, null].map(Core.recurrenceSpanDays), [3, 7, 14, 4, 180, 365, null]);
  const at = date => Core.choreProgress({ plannedDate: date, dueDate: null }, weekly, TODAY);
  assert.deepEqual(at('2026-10-22'), { span: 7, left: 7, fill: 0, state: 'calm' }, 'just done');
  assert.deepEqual(at('2026-10-20'), { span: 7, left: 5, fill: 2 / 7, state: 'calm' });
  assert.deepEqual(at(TODAY), { span: 7, left: 0, fill: 1, state: 'due' });
  assert.deepEqual(at('2026-10-12'), { span: 7, left: -3, fill: 1, state: 'due' }, 'three days past a weekly chore is still just due');
  assert.deepEqual(at('2026-10-11'), { span: 7, left: -4, fill: 1, state: 'late' });
  assert.equal(Core.choreProgress({ plannedDate: null, dueDate: null }, weekly, TODAY), null, 'no date, no bar');
  assert.equal(Core.choreProgress({ plannedDate: TODAY }, null, TODAY), null, 'no repeat, no bar');
  assert.equal(Core.choreProgress({ plannedDate: '2026-10-20', dueDate: '2026-10-17' }, weekly, TODAY).left, 2, 'a deadline counts first, as on the screen');
});

test('the screen shows the bar and a soft label; the header counts what is due now', () => {
  const cleaning = read('js/cleaning-ui.js');
  assert.match(cleaning, /if \(date < today\) return `<span class="task-due is-due-now">\$\{esc\(tr\('Time to do it · \{date\}', \{ date: formatDate\(date\) \}\)\)\}<\/span>`;/);
  assert.match(cleaning, /const due = open\.filter\(task => taskDate\(task\) && taskDate\(task\) <= today\)\.length;/);
  assert.match(cleaning, /\$\{due \? ` · \$\{trn\(due, '\{count\} due now', '\{count\} due now'\)\}` : ''\}/);
  assert.match(cleaning, /return ctx\.renderChoreRow\(task, \{ metaText, metaLead: task\.isCompleted \? '' : when\(task\), bar: task\.isCompleted \? null : Core\.choreProgress\(task, ctx\.taskRecurrence\(task\), today\) \}\);/);
  assert.match(read('js/app.js'), /renderChoreRow\(task, options = \{\}\) \{ return taskRow\(task, 'cleaning', \{ today: true, metaText: options\.metaText, metaLead: options\.metaLead, bar: options\.bar \}\); \}/);
  const row = read('js/tasks-ui.js');
  assert.match(row, /const bar = options\.bar \? `<span class="chore-bar\$\{options\.bar\.state === 'calm' \? '' : ` is-\$\{options\.bar\.state\}`\}" aria-hidden="true"><i style="width:\$\{Math\.round\(options\.bar\.fill \* 100\)\}%"><\/i><\/span>` : '';/);
  assert.match(row, /<\/div>` : ''\}\$\{bar\}<\/div>\$\{addToday\}<\/div>/, 'under the meta line');
  const css = read('css/styles.css');
  for (const rule of ['.chore-bar {', '.chore-bar i {', '.chore-bar.is-due i {', '.chore-bar.is-late i {', '.task-due.is-due-now {']) assert.ok(css.includes(rule), rule);
});

test('one sentence says how a chore differs from a repeating task', () => {
  const cleaning = read('js/cleaning-ui.js');
  const sentence = "tr('Unlike a repeating task, a chore has no strict deadline: its bar fills slowly until it is time, and doing it starts the bar again.')";
  assert.ok(cleaning.includes(`<p class="tasks-note cleaning-intro">\${${sentence}}</p>`), 'on the screen');
  assert.ok(cleaning.includes(`<p>\${${sentence}}</p>`), 'and in the empty state');
  assert.ok(read('css/styles.css').includes('.cleaning-intro {'));
});

function cleaning(today = TODAY) {
  let adapter;
  let counter = 0;
  runInNewContextWithI18n(read('js/cleaning-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const state = { version: 3, tasks: [], projects: [], areas: [], goals: [], ui: {} };
  const ctx = { state, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : today) }, uid: prefix => `${prefix}_${++counter}`, nowIso: () => `${today}T08:00:00.000Z`, saveState: () => true, navigate() {}, saveAndRender() {} };
  return { state, add: preset => adapter.handleAction('add-cleaning-examples', { target: { closest: () => ({ dataset: { action: 'add-cleaning-examples', cleaningPreset: preset } }) } }, ctx) };
}
const find = (state, title) => { const task = state.tasks.find(item => item.title === title); assert.ok(task, title); return task; };

test('the examples get no deadline and gain seasonal chores on their next day of the year', () => {
  const flat = cleaning();
  flat.add('apartment');
  assert.ok(flat.state.tasks.every(task => task.plannedDate && task.dueDate === null), 'only a planned day');
  for (const [title, rule, first] of [
    ['Swap the winter and summer clothes', ['monthly', 6], '2027-04-01'], ['Have the air conditioner serviced before summer', ['yearly', 1], '2027-05-01'],
    ['Clean the balcony for summer', ['yearly', 1], '2027-04-15'],
  ]) {
    const task = find(flat.state, title);
    assert.deepEqual([task.recurrence.frequency, task.recurrence.interval, task.plannedDate], [...rule, first], title);
  }
  const house = cleaning();
  house.add('house');
  for (const [title, first] of [['Check the roof after winter', '2027-03-20'], ['Turn on the outdoor tap', '2027-04-01'], ['Prepare the garden for winter', '2026-10-25'], ['Turn off the outdoor tap before the frost', '2026-11-01'], ['Clean the gutters', '2026-11-05']]) {
    const task = find(house.state, title);
    assert.deepEqual([task.recurrence.frequency, task.recurrence.interval, task.plannedDate], ['yearly', 1, first], title);
  }
  assert.equal(house.state.tasks.filter(task => ['Swap the winter and summer clothes', 'Clean the gutters'].includes(task.title)).length, 2, 'the house has the apartment chores too');
  const spring = cleaning('2026-04-01');
  spring.add('apartment');
  assert.equal(find(spring.state, 'Swap the winter and summer clothes').plannedDate, '2026-10-01', 'twice a year: the next of the two days, never the day they are added');
});

test('a chore from the window gets only a planned day', () => {
  assert.match(functionSource('saveChore', ['js/cleaning-ui.js']).source, /plannedDate: first, plannedTime: null, dueDate: null, dueTime: null,/);
});

test('the new lines are Serbian; the guide explains the bar', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Time to do it · {date}', 'Vreme je · {date}'],
    ['Unlike a repeating task, a chore has no strict deadline: its bar fills slowly until it is time, and doing it starts the bar again.', 'Za razliku od ponavljajućeg zadatka, obaveza nema strog rok: traka se polako puni dok ne dođe vreme, a kad je uradiš, kreće ispočetka.'],
    ['Swap the winter and summer clothes', 'Zameni zimsku i letnju garderobu'], ['Have the air conditioner serviced before summer', 'Servisiraj klimu pre leta'],
    ['Clean the balcony for summer', 'Očisti terasu za leto'], ['Clean the gutters', 'Očisti oluke'], ['Prepare the garden for winter', 'Pripremi baštu za zimu'],
    ['Check the roof after winter', 'Pregledaj krov posle zime'], ['Turn off the outdoor tap before the frost', 'Zatvori spoljnu česmu pre mraza'], ['Turn on the outdoor tap', 'Otvori spoljnu česmu'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(sr.includes('"{count} due now": { one: "{count} na redu", few: "{count} na redu", other: "{count} na redu" }'));
  assert.ok(!sr.includes('"{count} late":'), 'the old count is gone');
  assert.ok(read('uputstvo.html').includes('U <strong>Redovnim obavezama</strong> svaka obaveza ima traku koja se polako puni dok ne dođe vreme. Kad prođe njen dan, piše „Vreme je“, bez crvenog „Kasni“, a kad je uradiš, traka kreće ispočetka.'));
});

test('R95 shipped as 2.0.0-alpha.122 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 122) >= 122);
});
