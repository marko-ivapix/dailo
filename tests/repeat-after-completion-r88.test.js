// R88: a repeat can count from the day the task is completed ("3 dana posle završetka"), not only by the calendar.
// The rule gets recurrence.afterCompletion: true, kept only with a plain interval (no chosen weekdays or month day).
// Completing the task makes the next one an interval after that day; the deadline and the reminder keep their
// distance to the plan. The calendar shows no future dates for such a rule, because they are not known yet. The repeat
// editor offers "Po rasporedu" or "Od dana završetka".
// Data-model spec: docs/superpowers/specs/2026-10-15-r88-repeat-after-completion.md
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
const fn = name => functionSource(name).source;
const stamp = '2026-10-01T08:00:00.000Z';
const task = (fields = {}) => ({ id: 't1', title: 'Water the plants', notes: '', projectId: null, areaId: null, goalIds: [], tagIds: [], subtasks: [], attachmentIds: [], priority: 'none', isInbox: false, isCompleted: false, completedAt: null, plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrenceBaseline: null, recurrenceSuccessorId: null, createdAt: stamp, updatedAt: stamp, ...fields });
const rule = (fields = {}) => ({ frequency: 'daily', interval: 3, afterCompletion: true, status: 'active', endType: 'never', endDate: null, endAfterOccurrences: null, occurrencesCreated: 0, skipNext: false, seriesId: 't1', ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });
const completedAt = new Date(2026, 9, 20, 18, 30).toISOString(); // 20 October, evening, local time

test('the rule keeps afterCompletion only when true and only with a plain interval', () => {
  assert.deepEqual(json(Core.normalizeRecurrence({ frequency: 'daily', interval: 3, afterCompletion: true })), { frequency: 'daily', interval: 3, afterCompletion: true });
  assert.deepEqual(json(Core.normalizeRecurrence({ frequency: 'weekly', interval: 2, weekdays: [1, 4], afterCompletion: true })), { frequency: 'weekly', interval: 2, afterCompletion: true }, 'counting from completion has no chosen days');
  assert.deepEqual(json(Core.normalizeRecurrence({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 5, afterCompletion: true })), { frequency: 'monthly', interval: 1, afterCompletion: true });
  assert.deepEqual(json(Core.normalizeRecurrence({ frequency: 'weekly', interval: 1, weekdays: [1], afterCompletion: false })), { frequency: 'weekly', interval: 1, weekdays: [1] }, 'false is not stored');
  assert.equal(Object.hasOwn(Core.normalizeRecurrenceV3({ frequency: 'daily', interval: 1 }), 'afterCompletion'), false, 'older rules stay as they are');
  assert.equal(Core.normalizeRecurrenceV3(rule()).afterCompletion, true);
});

test('completing makes the next one an interval after the day it was completed; the deadline and reminder keep their distance', () => {
  const late = task({ plannedDate: '2026-10-15', dueDate: '2026-10-17', reminderAt: new Date(2026, 9, 15, 9, 0).toISOString(), recurrence: rule() });
  const next = Core.buildNextRecurringTask(late, completedAt, 'n1');
  assert.equal(next.plannedDate, '2026-10-23', '3 days after the 20th, not after the 15th');
  assert.equal(next.dueDate, '2026-10-25', 'two days after the plan, as before');
  assert.equal(new Date(next.reminderAt).getHours(), 9);
  assert.equal(Core.dateOnly(new Date(next.reminderAt)), '2026-10-23');
  assert.equal(next.recurrence.afterCompletion, true);
  const early = Core.buildNextRecurringTask(task({ plannedDate: '2026-10-25', recurrence: rule() }), completedAt, 'n2');
  assert.equal(early.plannedDate, '2026-10-23', 'done early, the next one comes earlier too');
  assert.equal(Core.buildNextRecurringTask(task({ dueDate: '2026-10-15', recurrence: rule({ frequency: 'weekly', interval: 2 }) }), completedAt, 'n3').dueDate, '2026-11-03', 'only a deadline: it moves');
  const plain = Core.buildNextRecurringTask(task({ recurrence: rule({ frequency: 'monthly', interval: 1 }) }), completedAt, 'n4');
  assert.deepEqual([plain.plannedDate, plain.dueDate], ['2026-11-20', null], 'no dates: planned a month after');
  assert.equal(Core.buildNextRecurringTask(task({ plannedDate: '2026-10-15', recurrence: rule({ skipNext: true }) }), completedAt, 'n5').plannedDate, '2026-10-26', 'a skip counts two intervals');
  const schedule = Core.buildNextRecurringTask(task({ plannedDate: '2026-10-15', recurrence: rule({ afterCompletion: undefined }) }), completedAt, 'n6');
  assert.equal(schedule.plannedDate, '2026-10-18', 'by the calendar as before');
});

test('the calendar shows no future dates for a rule that counts from completion', () => {
  const tasks = [task({ id: 'a', plannedDate: '2026-10-15', recurrence: rule() }), task({ id: 'b', plannedDate: '2026-10-15', recurrence: rule({ afterCompletion: undefined, seriesId: 'b' }) })];
  const repeats = Core.calendarRepeats(tasks, '2026-10-15', '2026-10-31');
  assert.ok(Object.values(repeats).flat().every(item => item.task.id === 'b'));
  assert.ok(Object.keys(repeats).length > 0);
});

test('backups take a boolean afterCompletion only with a plain interval; sync carries it', () => {
  Backup.validateDomain(emptyState({ tasks: [task({ recurrence: rule() })] }), [], []);
  for (const bad of [{ afterCompletion: 'yes' }, { frequency: 'weekly', weekdays: [1], afterCompletion: true }, { frequency: 'monthly', monthMode: 'day', monthDay: 3, afterCompletion: true }]) {
    assert.throws(() => Backup.validateDomain(emptyState({ tasks: [task({ recurrence: rule(bad) })] }), [], []), /Invalid backup: afterCompletion/, JSON.stringify(bad));
  }
  assert.equal(Sync.collectRecords(emptyState({ tasks: [task({ recurrence: rule() })] })).get('tasks/t1').data.recurrence.afterCompletion, true);
});

test('the repeat editor offers "Po rasporedu" or "Od dana završetka"; counting from completion has no days to choose', () => {
  assert.match(fn('repeatEditorState'), /afterCompletion: rule\?\.afterCompletion === true,/);
  const toRule = fn('repeatRuleFromSheet');
  assert.match(toRule, /const rule = \{ frequency: sheet\.frequency, interval: sheet\.interval, afterCompletion: Boolean\(sheet\.afterCompletion\) \};/);
  assert.match(toRule, /if \(sheet\.afterCompletion\) \{ \/\* a plain interval \*\/ \} else if \(sheet\.frequency === 'weekly'\) rule\.weekdays = \[\.\.\.sheet\.weekdays\];/);
  const editor = fn('repeatEditorHtml');
  assert.match(editor, /<div class="sheet-card" role="radiogroup" aria-label="\$\{tr\('Next time'\)\}">\$\{radio\('repeat-anchor', 'schedule', `\$\{tr\('On schedule'\)\}<small>\$\{tr\('The days are set in advance, even when you are late\.'\)\}<\/small>`, !s\.afterCompletion\)\}\$\{radio\('repeat-anchor', 'completion', `\$\{tr\('From the day it is done'\)\}<small>\$\{tr\('The next one comes only after you complete this one\.'\)\}<\/small>`, s\.afterCompletion\)\}<\/div>/);
  assert.match(editor, /if \(s\.afterCompletion\) extra = '';/, 'no weekdays, month day or yearly note');
  assert.match(editor, /const next = s\.afterCompletion \? tr\('The next one is made when you complete this one\.'\) :/);
  assert.match(fn('repeatEditorUpdate'), /else if \(action === 'repeat-anchor'\) s\.afterCompletion = data\.value === 'completion';/);
  assert.match(fn('repeatPresetOn'), /if \(sheet\.afterCompletion\) return true;/);
});

test('the sentence for the rule says "N … posle završetka"', () => {
  const label = fn('recurrenceLabel');
  assert.match(label, /if \(recurrence\.afterCompletion\) text = \{ daily: trn\(interval, '\{count\} day after it is done', '\{count\} days after it is done'\), weekly: trn\(interval, '\{count\} week after it is done', '\{count\} weeks after it is done'\), monthly: trn\(interval, '\{count\} month after it is done', '\{count\} months after it is done'\), yearly: trn\(interval, '\{count\} year after it is done', '\{count\} years after it is done'\) \}\[recurrence\.frequency\];/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['{count} days after it is done', '{ one: "{count} dan posle završetka", few: "{count} dana posle završetka", other: "{count} dana posle završetka" }'],
    ['{count} weeks after it is done', '{ one: "{count} nedelju posle završetka", few: "{count} nedelje posle završetka", other: "{count} nedelja posle završetka" }'],
    ['{count} months after it is done', '{ one: "{count} mesec posle završetka", few: "{count} meseca posle završetka", other: "{count} meseci posle završetka" }'],
    ['{count} years after it is done', '{ one: "{count} godinu posle završetka", few: "{count} godine posle završetka", other: "{count} godina posle završetka" }'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${value}`), en);
  for (const [en, value] of [
    ['Next time', 'Sledeći put'], ['On schedule', 'Po rasporedu'], ['The days are set in advance, even when you are late.', 'Dani su unapred određeni, i kad zakasniš.'],
    ['From the day it is done', 'Od dana završetka'], ['The next one comes only after you complete this one.', 'Sledeći dolazi tek kad završiš ovaj.'],
    ['The next one is made when you complete this one.', 'Sledeći se pravi kad završiš ovaj.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('the guide explains it', () => {
  assert.ok(read('uputstvo.html').includes('Ponavljanje ide <strong>po rasporedu</strong> (na primer svakog ponedeljka) ili <strong>od dana završetka</strong>: tada sledeći dolazi tek kad završiš ovaj, na primer zalivanje cveća 3 dana posle poslednjeg.'));
});

test('R88 is released as 2.0.0-alpha.115', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.115');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.115';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.115');
});
