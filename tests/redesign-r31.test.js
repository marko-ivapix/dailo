// Redesign R31: the third design pass, bugs on the planning side (findings 4, 9–15).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r31-planning-bugs.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const habitsUi = read('js/habits-ui.js');
const goalsUi = read('js/goals-ui.js');
const calendarUi = read('js/calendar-ui.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];
const plain = value => JSON.parse(JSON.stringify(value));

test('4: dates outside the current year show the year', () => {
  const ctx = withI18n({ I18n, parseLocalDate: value => new Date(`${value}T12:00:00`), Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-12T08:00:00'])); } } });
  vm.createContext(ctx);
  vm.runInContext(['DATE_FMT', 'SHORT_DATE_FMT', 'DATE_YEAR_FMT', 'SHORT_DATE_YEAR_FMT'].map(constLine).join('') + '\n' + fn('formatDate'), ctx);
  assert.doesNotMatch(ctx.formatDate('2026-10-12'), /2026/);
  assert.match(ctx.formatDate('2027-10-12'), /2027/);
  assert.match(ctx.formatDate('2027-10-12', 'full'), /2027/);
  assert.doesNotMatch(ctx.formatDate('2026-12-31', 'full'), /2026/);
});

test('9: a numeric habit can be skipped; a skipped day is not missed', () => {
  const habit = { id: 'h', trackingType: 'numeric', targetValue: 10000, frequencyType: 'daily', startDate: '2026-10-01', status: 'active' };
  const logs = [{ habitId: 'h', date: '2026-10-10', status: 'skipped', value: null }, { habitId: 'h', date: '2026-10-11', status: 'done', value: 12000 }];
  assert.equal(Core.habitStatusForDate(habit, logs, '2026-10-10', '2026-10-12').status, 'skipped');
  assert.equal(Core.habitStatusForDate(habit, logs, '2026-10-11', '2026-10-12').status, 'done');
  assert.equal(Core.habitDayState(habit, logs, '2026-10-10', '2026-10-12').state, 'skipped');
  // R61: a clearing call (null) skips the numeric rule.
  assert.match(fn('setHabitLog'), /if \(!clearing && habit\.trackingType === 'numeric' && requestedStatus !== 'skipped'\) \{/);
  assert.match(habitsUi, /const skip = `<button class="popover-option" type="button" data-pop-action="habit-today-skip"/, 'the menu offers "Preskoči" for every habit');
  assert.match(habitsUi, /const skip = !\['done', 'unscheduled'\]\.includes\(today\.state\) \? `<button class="btn btn-ghost" type="button" data-action="habit-today-skip"/);
});

test('9: the value sheet opens without the keyboard and a quick value saves at once', () => {
  assert.match(fn('openHabitValue'), /requestAnimationFrame\(\(\) => \$\('#modal-root \.habit-value-window \.quick-chip, #modal-root \.habit-value-window \[data-action="close-modal"\]'\)\?\.focus\(\)\);/);
  assert.doesNotMatch(fn('openHabitValue'), /#habit-value-total'\)\?\.focus/);
  assert.match(habitsUi, /if \(action === 'habit-value-add'\) \{\n\s+const total = [^\n]+\n\s+ctx\.modalState\.total = Math\.round\(total \* 1000\) \/ 1000;\n\s+const \{ habitId, date \} = ctx\.modalState;\n\s+setHabitLog\(habitId, date, 'done', ctx\.modalState\.total\)/);
});

test('9: "+" on Navike opens a new habit, which does not land in Inbox', () => {
  assert.match(app, /'#habits': \[msg\('New habit'\), \(\) => openHabitModal\(\)\]/);
});

test('10: the schedule fits its hours to the blocks and lays overlapping blocks side by side', () => {
  const DAY = '2026-10-12';
  const task = (id, time, minutes) => ({ id, title: id, plannedDate: DAY, plannedTime: time, durationMinutes: minutes, isCompleted: false });
  const schedule = Core.daySchedule([task('a', '10:00', 60), task('b', '10:00', 30), task('c', '10:30', 60), task('d', '13:00', 30)], DAY);
  assert.deepEqual(schedule.blocks.map(block => [block.task.id, block.lane, block.lanes]), [['a', 0, 2], ['b', 1, 2], ['c', 1, 2], ['d', 0, 1]]);
  assert.deepEqual(plain(schedule.range), { startHour: 8, endHour: 21 });
  assert.deepEqual(plain(Core.daySchedule([task('late', '22:30', 60)], DAY).range), { startHour: 8, endHour: 24 });
  assert.deepEqual(plain(Core.daySchedule([task('early', '06:15', 30)], DAY).range), { startHour: 6, endHour: 21 });
  assert.match(calendarUi, /--lane:\$\{block\.lane\};--lanes:\$\{block\.lanes\}/);
  assert.match(read('css/styles.css'), /\.day-grid-block \{[^}]*left: calc\(100% \* var\(--lane, 0\) \/ var\(--lanes, 1\)\); width: calc\(100% \/ var\(--lanes, 1\) - 4px\);/);
});

test('10: Raspored lists the day\'s deadlines that Lista shows, and marks the current time today', () => {
  assert.match(calendarUi, /const items = Core\.calendarDayItems\(listed\(ctx\), date\);/);
  assert.match(calendarUi, /<section class="section day-deadlines"><div class="section-header"><h2 class="section-label">\$\{tr\('Due this day'\)\}<\/h2>/);
  assert.match(calendarUi, /class="day-grid-now"/);
  assert.match(read('css/styles.css'), /\.day-grid-now \{/);
});

test('11: task counts use plurals, habit contributions read naturally, and "None" is "Nema"', () => {
  const sr = read('js/i18n-sr.js');
  assert.match(goalsUi, /trn\(progress\.target, '\{current\} of \{target\} task', '\{current\} of \{target\} tasks', \{ current: progress\.current, target: progress\.target \}\)/);
  assert.match(app, /trn\(progress\.target, '\{current\} \/ \{target\} task', '\{current\} \/ \{target\} tasks', \{ current: progress\.current, target: progress\.target \}\)/);
  assert.ok(sr.includes('"{current} of {target} tasks": { one: "{current} od {target} zadatka", few: "{current} od {target} zadatka", other: "{current} od {target} zadataka" }'));
  assert.ok(sr.includes('"{current} / {target} tasks": { one: "{current} / {target} zadatak", few: "{current} / {target} zadatka", other: "{current} / {target} zadataka" }'));
  assert.match(goalsUi, /tr\('\{actual\} of \{target\} · \{metric\}', \{ actual: plainNumber\(actual\), target: plainNumber\(target\), metric: \(HABIT_METRICS\[link\.metric\] \? tr\(HABIT_METRICS\[link\.metric\]\) : link\.metric\)\.toLocaleLowerCase\(\) \}\)/);
  assert.ok(sr.includes('"None": "Nema"'));
});

test('14: milestones sort by date, say when they fall after the target, and the window hides empty counts', () => {
  assert.match(goalsUi, /const milestones = \[\.\.\.\(goal\.milestones \|\| \[\]\)\]\.sort\(\(a, b\) => \(a\.date \|\| '9999'\)\.localeCompare\(b\.date \|\| '9999'\) \|\| Number\(a\.order \|\| 0\) - Number\(b\.order \|\| 0\)\);/);
  assert.match(goalsUi, /goal\.targetDate && item\.date && item\.date > goal\.targetDate && !item\.isCompleted \? ` · \$\{tr\('After the target date'\)\}` : ''/);
  assert.match(goalsUi, /\$\{tr\('Milestones'\)\}\$\{milestones\.length \? ` · \$\{done\}\/\$\{milestones\.length\}` : ''\}/);
  assert.match(goalsUi, /\$\{shown\.length \? '' : `<p class="today-empty">\$\{tr\('No open tasks\.'\)\}<\/p>`\}/);
  assert.match(goalsUi, /tone === 'ok' && !goal\.targetDate \? tr\('Progress is on track\.'\)/);
  assert.match(goalsUi, /id="milestone-date" class="input" type="date" value="\$\{esc\(d\.date\)\}"\$\{goal\?\.targetDate \? ` max="\$\{esc\(goal\.targetDate\)\}"` : ''\} \/>/);
});

test('15: a past calendar day shows what was completed, and "+" there plans for today', () => {
  assert.match(calendarUi, /if \(date < ctx\.Core\.dateOnly\(\)\) body \+= pastDayDone\(ctx, date\);/);
  assert.match(calendarUi, /ctx\.foldButton\('toggle-calendar-done', tr\('Completed this day'\), done\.length, open\)/);
  assert.match(fn('routeQuickAddContext'), /return \{ day: calendarDate\(\) < Core\.dateOnly\(\) \? Core\.dateOnly\(\) : calendarDate\(\) \};/);
});

test('13: the example texts read naturally, and the first set loses "No-nut", the second "Beard balm" and the todoist guide name', () => {
  const sr = read('js/i18n-sr.js');
  // R67 replaced the example set with the user's own; the texts that remain keep their wording, the rest left the catalog.
  for (const [en, value] of [
    ['112 from a mobile phone also reaches the police', 'Sa mobilnog telefona radi i 112'], ['Ride in a hot-air balloon', 'Leti balonom na topli vazduh'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  const starter = read('js/starter-examples.js');
  for (const source of [habitsUi, starter]) assert.doesNotMatch(source, /No-nut|'night', 'beard-balm'|todoist/);
});

test('R31 shipped as 2.0.0-alpha.57 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 57);
});
