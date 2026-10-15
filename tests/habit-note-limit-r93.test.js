// R93: Navike II. A checked-in day can carry a short note ("prehlada", "na putu"): habitLog.note, at most 200
// characters, written from the habit's menu for that day and listed in the habit details. A numeric habit can have
// an upper limit instead of a target ("najviše 2 kafe"): habit.targetMode = 'atMost'. A logged day is done while its
// value stays within the limit (0 included) and missed once it goes over: a ✗ like a yes/no "not done", with no
// partial credit and no more reminders that day. A day without a check-in stays empty, as for every habit.
// Data-model spec: docs/superpowers/specs/2026-10-15-r93-habit-note-limit.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const json = value => JSON.parse(JSON.stringify(value));
const habitsFn = name => functionSource(name, ['js/habits-ui.js']).source;
const stamp = '2026-10-01T08:00:00.000Z';
const coffee = (fields = {}) => ({ id: 'h', name: 'Kafa', status: 'active', frequencyType: 'daily', trackingType: 'numeric', targetValue: 2, unit: 'kafe', targetMode: 'atMost', startDate: '2026-10-01', goalIds: [], reminders: [], createdAt: stamp, updatedAt: stamp, ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });
const log = (fields = {}) => ({ id: 'h:2026-10-14', habitId: 'h', date: '2026-10-14', status: 'done', value: 1, createdAt: stamp, updatedAt: stamp, ...fields });

test('an upper limit: within it the day is done, over it the day is missed', () => {
  assert.deepEqual(json(Core.numericHabitState(coffee(), 1)), { status: 'done', value: 1, percent: 100 });
  assert.deepEqual(json(Core.numericHabitState(coffee(), 0)), { status: 'done', value: 0, percent: 100 }, 'no coffee is a good day');
  assert.deepEqual(json(Core.numericHabitState(coffee(), 3)), { status: 'missed', value: 3, percent: 0 }, 'over the limit is missed, not partly done');
  assert.deepEqual(json(Core.numericHabitState(coffee({ targetMode: undefined }), 1)), { status: 'missed', value: 1, percent: 50 }, 'a target counts up as before');
  assert.equal(Core.habitStatusForDate(coffee(), [log({ value: 2 })], '2026-10-14', '2026-10-15').status, 'done');
  const over = Core.habitDayState(coffee(), [log({ value: 3 })], '2026-10-14', '2026-10-14');
  assert.deepEqual([over.state, over.marked, over.value], ['missed', true, 3], 'over the limit the day is lost, even today');
  assert.equal(Core.habitDayClosed(coffee(), [log({ value: 3 })], '2026-10-14'), true, 'so its reminders stop');
  assert.equal(Core.habitDayClosed(coffee({ targetMode: undefined }), [log({ value: 1 })], '2026-10-14'), false, 'a target below reach still reminds');
  assert.equal(Core.habitDayState(coffee(), [], '2026-10-13', '2026-10-15').state, 'missed', 'a day without a check-in is not a good day by itself');
  assert.equal(Core.habitYear(coffee(), [log({ value: 3 })], '2026-10-15').weeks.flat().find(day => day.date === '2026-10-14').state, 'missed', 'not "partly"');
  const limit = Core.getHabitTargetStatus(coffee(), 3);
  assert.deepEqual([limit.atMost, limit.minimumMet, limit.status], [true, false, 'over']);
  assert.equal(Core.getHabitTargetStatus(coffee(), 2).status, 'within');
  assert.equal(Core.getHabitTargetStatus(coffee({ frequencyType: 'timesPerWeek', timesPerWeek: 3 }), 2).status, 'below-minimum', 'a weekly habit counts its good days against the week');
});

test('the fields: targetMode only "atMost" on a numeric habit; a note is short text', () => {
  const state = Core.normalizeState(emptyState({ habits: [coffee(), coffee({ id: 'b', trackingType: 'checkbox', targetValue: null }), coffee({ id: 'c', targetMode: 'atLeast' }), coffee({ id: 'd', targetMode: undefined })] }));
  assert.equal(state.habits[0].targetMode, 'atMost');
  assert.equal(Object.hasOwn(state.habits[1], 'targetMode'), false, 'a yes/no habit has no limit');
  assert.equal(Object.hasOwn(state.habits[2], 'targetMode'), false, 'anything but "atMost" is the usual target');
  assert.equal(Object.hasOwn(state.habits[3], 'targetMode'), false);
  assert.equal(Core.habitLogNote('  Bio sam   bolestan \n'), 'Bio sam bolestan');
  assert.equal(Core.habitLogNote('x'.repeat(250)).length, 200);
  assert.equal(Core.habitLogNote(null), '');
  assert.equal(Core.habitLogNote(`${'x'.repeat(199)}😀`), 'x'.repeat(199), 'no half of an emoji at the cut');
});

test('backups check both fields; sync carries them', () => {
  Backup.validateDomain(emptyState({ habits: [coffee()] }), [log({ note: 'Posle ručka' })], []);
  assert.throws(() => Backup.validateDomain(emptyState({ habits: [coffee({ trackingType: 'checkbox' })] }), [], []), /Invalid backup: targetMode/);
  assert.throws(() => Backup.validateDomain(emptyState({ habits: [coffee({ targetMode: 'sometimes' })] }), [], []), /Invalid backup: targetMode/);
  for (const note of [42, 'x'.repeat(201)]) assert.throws(() => Backup.validateDomain(emptyState({ habits: [coffee()] }), [log({ note })], []), /Invalid backup: Habit log note/);
  const records = Sync.collectRecords(emptyState({ habits: [coffee()] }), [log({ note: 'Posle ručka' })]);
  assert.equal(records.get('habits/h').data.targetMode, 'atMost');
  assert.equal(records.get('habitLogs/h:2026-10-14').data.note, 'Posle ručka');
});

test('a check-in keeps its note; the note is written from the day\'s menu and listed in the details', () => {
  const app = read('js/app.js');
  assert.match(functionSource('setHabitLog').source, /value: value \?\? null, \.\.\.\(existing\?\.note \? \{ note: existing\.note \} : \{\}\), createdAt:/);
  const note = functionSource('setHabitLogNote').source;
  assert.match(note, /const text = Core\.habitLogNote\(rawNote\);/);
  assert.match(note, /if \(!habit \|\| !existing\) return false;/, 'a note needs a check-in that day');
  assert.match(note, /const record = \{ \.\.\.existing, updatedAt: nowIso\(\) \};\n\s+if \(text\) record\.note = text; else delete record\.note;/);
  assert.match(app, /setHabitLogNote,/, 'the habits module gets it');
  const menu = habitsFn('openTodayHabitMenu');
  assert.match(menu, /const entry = state\.habitLogCache\?\.\[habitId\]\?\.find\(log => log\.date === date\);/);
  assert.match(menu, /<input id="habit-log-note" class="input" type="text" maxlength="200" value="\$\{esc\(entry\.note \|\| ''\)\}" placeholder="\$\{tr\('Why, how it went…'\)\}">/);
  assert.match(menu, /data-pop-action="habit-note-save" data-habit-id="\$\{esc\(habitId\)\}" data-date="\$\{esc\(date\)\}">\$\{tr\('Save note'\)\}<\/button>/);
  assert.match(read('js/habits-ui.js'), /if \(next === null && previous\?\.note\) saving\.then\(saved => \{ if \(saved === true\) ctx\.setUndo\(msg\('Note removed'\), \(\) => setHabitLog\(habit\.id, date, current\)\.then\(\(\) => ctx\.setHabitLogNote\(habit\.id, date, previous\.note\)\)\); \}\)/, 'emptying a day with a note can be undone');
  const details = habitsFn('renderHabitDetails');
  assert.match(details, /const notes = logs\.filter\(item => item\.note\)\.sort\(\(a, b\) => b\.date\.localeCompare\(a\.date\)\)\.slice\(0, 5\);/);
  assert.match(details, /<h3 class="habit-details-label">\$\{tr\('Notes'\)\}<\/h3><ul class="habit-notes">/);
});

test('the window offers "Najmanje / Najviše" for a numeric habit; the row and the details read the limit', () => {
  const window = habitsFn('renderHabitModal');
  assert.match(window, /habitSegment\('habit-draft-target-mode', tr\('At least or at most'\), \[\['atLeast', tr\('At least'\)\], \['atMost', tr\('At most'\)\]\], d\.targetMode === 'atMost' \? 'atMost' : 'atLeast'\)/);
  assert.match(window, /numeric && d\.targetMode !== 'atMost' \|\| weekly \? habitWindowRow\(ctx, 'habit-draft-targets'/, 'no minimum and ideal for a limit');
  const row = habitsFn('renderHabitTodayRow');
  assert.match(row, /right = atMost \? tr\('\{value\} \/ at most \{target\}', \{ value: number\(todayStatus\?\.value\), target: number\(target\) \}\)/);
  const details = habitsFn('renderHabitDetails');
  assert.match(details, /target\.atMost \? `<p>\$\{esc\(tr\('\{current\} \/ at most \{limit\}', \{ current: plainNumber\(target\.current\), limit: plainNumber\(target\.minimumTarget\) \}\)\)\} · \$\{esc\(target\.minimumMet \? tr\('Within the limit'\) : tr\('Over the limit'\)\)\}<\/p>`/);
  // R99: a habit template also keeps the routine, picked after the goals.
  assert.match(read('js/core.js'), /data = pick\(\['name','areaId','goalIds','routine','trackingType','targetValue','targetMode',/, 'templates keep the limit');
  const widget = Core.habitsWidgetSnapshot([coffee()], { h: [log({ date: '2026-10-15', id: 'h:2026-10-15', value: 3 })] }, '2026-10-15');
  assert.deepEqual([widget.items[0].atMost, widget.items[0].missed, widget.items[0].done], [true, true, false], 'the phone widget shows the ✗');
  assert.match(functionSource('habitsWidgetPart').source, /item\.atMost \? tr\('\{value\} \/ at most \{target\}', \{ value: number\(item\.value\), target: number\(item\.target\) \}\)/);
});

test('the new lines are Serbian; the guide mentions both', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['At least or at most', 'Najmanje ili najviše'], ['At least', 'Najmanje'], ['At most', 'Najviše'], ['Limit', 'Granica'], ['at most {target}', 'najviše {target}'], ['{value} / at most {target}', '{value} / najviše {target}'],
    ['{current} / at most {limit}', '{current} / najviše {limit}'], ['Within the limit', 'U granici'], ['Over the limit', 'Preko granice'],
    ['Why, how it went…', 'Zašto, kako je prošlo…'], ['Save note', 'Sačuvaj belešku'], ['Note saved', 'Beleška je sačuvana'], ['Note removed', 'Beleška je uklonjena'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('Uz upisan dan možeš dodati kratku belešku (meni navike, na primer „prehlada“ ili „na putu“). Brojčana navika može imati i gornju granicu: <strong>Najviše</strong> 2 kafe dnevno. Dan je uspešan dok si u granici, a dan bez ijedne upiši kao 0.'));
});

test('R93 shipped as 2.0.0-alpha.120 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 120) >= 120);
});
