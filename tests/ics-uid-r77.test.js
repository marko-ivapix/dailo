// R77: an imported calendar event is recognized again by its UID. A task made from an event keeps the event's UID
// in `task.icsUid` (with the RECURRENCE-ID for one changed occurrence of a series), and Dailo's own export is
// recognized by the task id in its UIDs (`<task id>-plan@dailo`, `<task id>-due@dailo`). So a calendar can be imported
// again after its events were renamed, moved or completed here, without duplicates.
// Data-model spec: docs/superpowers/specs/2026-10-15-r77-ics-uid.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const stamp = '2026-10-15T08:00:00.000Z';
const task = (id, fields = {}) => ({ id, title: 'Task', notes: '', projectId: null, areaId: null, goalIds: [], plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, createdAt: stamp, updatedAt: stamp, ...fields });
const event = (uid, fields = {}) => ({ uid, summary: 'Lekar', description: '', date: '2026-10-20', time: '10:00', durationMinutes: 60, allDay: false, recurring: false, ...fields });
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} });

test('the parser keeps RECURRENCE-ID only when an event has one', () => {
  const text = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:series-1@google.com', 'RECURRENCE-ID;TZID=Europe/Belgrade:20261021T090000', 'DTSTART:20261021T080000Z', 'SUMMARY:Sastanak', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:single-2', 'DTSTART;VALUE=DATE:20261022', 'SUMMARY:Rođendan', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const [changed, single] = Core.parseIcsEvents(text);
  assert.equal(changed.recurrenceId, '20261021T090000');
  assert.equal(Object.hasOwn(single, 'recurrenceId'), false);
});

test('a draft keeps the event UID; a changed occurrence keeps its RECURRENCE-ID too', () => {
  const plan = plain(Core.icsImportTasks([event('a@cal'), event('s@cal', { recurrenceId: '20261021T090000', date: '2026-10-21' }), event('s@cal', { recurrenceId: '20261028T090000', date: '2026-10-28' }), event('', { summary: 'Bez UID', date: '2026-10-23' })], [], '2026-10-15'));
  assert.deepEqual(plan.drafts.map(draft => draft.icsUid ?? null), ['a@cal', 's@cal#20261021T090000', 's@cal#20261028T090000', null], 'two occurrences of one series are two tasks');
  assert.equal(plan.duplicates, 0);
});

test('an event already imported is recognized by its UID, even renamed, moved or completed here', () => {
  const tasks = [
    task('t1', { title: 'Lekar (pomereno)', plannedDate: '2026-10-25', icsUid: 'a@cal' }),
    task('t2', { title: 'Sastanak', plannedDate: '2026-10-21', isCompleted: true, completedAt: stamp, icsUid: 's@cal#20261021T090000' }),
  ];
  const plan = plain(Core.icsImportTasks([event('a@cal'), event('s@cal', { recurrenceId: '20261021T090000', date: '2026-10-21' }), event('new@cal', { summary: 'Novo' })], tasks, '2026-10-15'));
  assert.deepEqual(plan.drafts.map(draft => draft.title), ['Novo']);
  assert.equal(plan.duplicates, 2);
});

test('Dailo\'s own export is recognized by the task id in its UIDs', () => {
  const tasks = [task('task_abc', { title: 'Nešto drugo', plannedDate: '2026-11-01' })];
  const plan = plain(Core.icsImportTasks([event('task_abc-plan@dailo'), event('task_abc-due@dailo', { summary: 'Rok: Nešto' }), event('task_gone-plan@dailo', { summary: 'Sa drugog uređaja' })], tasks, '2026-10-15'));
  assert.deepEqual(plan.drafts.map(draft => [draft.title, draft.icsUid]), [['Sa drugog uređaja', 'task_gone-plan@dailo']]);
  assert.equal(plan.duplicates, 2);
});

test('the same UID twice in one file is imported once; without a UID the title, day and time still count', () => {
  const plan = plain(Core.icsImportTasks([event('a@cal'), event('a@cal', { date: '2026-10-22' }), event('', { summary: 'Teretana' })], [task('t9', { title: 'teretana', plannedDate: '2026-10-20', plannedTime: '10:00' })], '2026-10-15'));
  assert.deepEqual(plan.drafts.map(draft => draft.icsUid), ['a@cal']);
  assert.equal(plan.duplicates, 2);
});

test('the field: a string of 1–500 characters without control characters; a bad one is cleared, older tasks stay as they are', () => {
  assert.ok(Core.validIcsUid('a@cal') && Core.validIcsUid('s@cal#20261021T090000'));
  for (const bad of ['', ' ', 'x'.repeat(501), 'a\nb', 42, {}]) assert.equal(Core.validIcsUid(bad), false, JSON.stringify(bad));
  const state = Core.normalizeState({ ...emptyState(), tasks: [task('t1', { icsUid: 'a@cal' }), task('t2', { icsUid: 'x'.repeat(600) }), task('t3')] });
  assert.equal(state.tasks[0].icsUid, 'a@cal');
  assert.equal(state.tasks[1].icsUid, null);
  assert.equal(Object.hasOwn(state.tasks[2], 'icsUid'), false, 'an older task is not rewritten, so sync sends nothing new');
});

test('backups refuse a bad UID; sync carries it in the task record', () => {
  Backup.validateDomain({ ...emptyState(), tasks: [task('t1', { icsUid: 'a@cal' }), task('t2', { icsUid: null })] }, [], []);
  assert.throws(() => Backup.validateDomain({ ...emptyState(), tasks: [task('t1', { icsUid: 'a\u0000b' })] }, [], []), /Invalid backup: icsUid/);
  assert.equal(Sync.collectRecords({ ...emptyState(), tasks: [task('t1', { icsUid: 'a@cal' })] }).get('tasks/t1').data.icsUid, 'a@cal');
});

test('the next occurrence of a repeating task does not claim the event', () => {
  const source = task('t1', { plannedDate: '2026-10-20', icsUid: 'a@cal', recurrence: { frequency: 'weekly', interval: 1, endType: 'never' } });
  const next = Core.buildNextRecurringTask(source, stamp, 't2');
  assert.equal(next.icsUid, null);
  const plainNext = Core.buildNextRecurringTask(task('t3', { plannedDate: '2026-10-20', recurrence: { frequency: 'weekly', interval: 1, endType: 'never' } }), stamp, 't4');
  assert.equal(Object.hasOwn(plainNext, 'icsUid'), false);
});

test('R77 is released as 2.0.0-alpha.104', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.104');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.104';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.104');
});
