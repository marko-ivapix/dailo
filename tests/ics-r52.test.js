// R52: the calendar as an .ics file — export the planned and due tasks for any calendar app, and import events as
// planned tasks (from today on, without repeats or duplicates), with Undo.
// Spec: docs/superpowers/specs/2026-10-12-r52-ics.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const task = (id, fields = {}) => ({ id, title: id, notes: '', isCompleted: false, plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, durationMinutes: null, ...fields });
const NOW = new Date('2026-10-12T08:30:00Z');

test('export: timed and all-day plans, deadlines on other days, escaped text and folded lines, CRLF', () => {
  const tasks = [
    task('t1', { title: 'Sastanak, tim; plan', plannedDate: '2026-10-15', plannedTime: '09:30', durationMinutes: 90, notes: 'Prvi red\nDrugi red' }),
    task('t2', { title: 'Kupovina', plannedDate: '2026-10-16', dueDate: '2026-10-20' }),
    task('t3', { title: 'Porez', dueDate: '2026-10-18', dueTime: '12:00' }),
    task('t4', { title: 'Isti dan', plannedDate: '2026-10-17', dueDate: '2026-10-17' }),
    task('t5', { title: 'Gotovo', plannedDate: '2026-10-15', isCompleted: true }),
    task('t6', { title: 'Bez datuma' }),
    task('t7', { title: 'D'.repeat(120), plannedDate: '2026-10-19' }),
  ];
  const ics = Core.calendarIcs(tasks, { now: NOW, dueLabel: 'Rok' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:-\/\/Dailo\/\/Dailo\/\/SR\r\nCALSCALE:GREGORIAN\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  const events = ics.split('BEGIN:VEVENT').slice(1);
  assert.equal(events.length, 6, 't1, t2 (plan and deadline), t3, t4 once and t7; not the completed or undated ones');
  const t1 = events.find(item => item.includes('UID:t1-plan@dailo'));
  assert.match(t1, /DTSTAMP:20261012T083000Z\r\n/);
  assert.match(t1, /DTSTART:20261015T073000Z\r\nDTEND:20261015T090000Z\r\n/, '09:30 in Belgrade is 07:30 UTC, for 90 minutes');
  assert.match(t1, /SUMMARY:Sastanak\\, tim\\; plan\r\n/);
  assert.match(t1, /DESCRIPTION:Prvi red\\nDrugi red\r\n/);
  assert.match(events.find(item => item.includes('UID:t2-plan@dailo')), /DTSTART;VALUE=DATE:20261016\r\nDTEND;VALUE=DATE:20261017\r\n/);
  assert.match(events.find(item => item.includes('UID:t2-due@dailo')), /SUMMARY:Rok: Kupovina\r\n/);
  assert.match(events.find(item => item.includes('UID:t3-due@dailo')), /DTSTART:20261018T100000Z\r\nDTEND:20261018T103000Z\r\n/);
  assert.ok(!ics.includes('t4-due@dailo'), 'a deadline on the planned day is not a second event');
  const folded = events.find(item => item.includes('UID:t7-plan@dailo'));
  assert.ok(folded.split('\r\n').every(line => Buffer.byteLength(line) <= 75), 'lines are folded at 75 octets');
  assert.match(folded, /SUMMARY:D{67}\r\n D{53}\r\n/, 'the first line holds 75 octets, a continuation a space and 74');
});

test('parse: unfolded lines, dates, UTC, zones, floating times, durations, repeats, cancelled and escapes', () => {
  const text = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Lekar\\, pregled', 'DESCRIPTION:Ponesi\\nknjižicu', 'DTSTART:20261020T080000Z', 'DTEND:20261020T090000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Rođendan', 'DTSTART;VALUE=DATE:20261021', 'DTEND;VALUE=DATE:20261022', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'SUMMARY:Njujork poziv', 'DTSTART;TZID=America/New_York:20261022T100000', 'DURATION:PT45M', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'SUMMARY:Lokalno', 'DTSTART:20261023T183000', 'DTEND:20261023T200000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e', 'SUMMARY:Teretana', 'DTSTART:20261024T170000Z', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:f', 'SUMMARY:Otkazano', 'DTSTART:20261025T170000Z', 'STATUS:CANCELLED', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g', 'SUMMARY:Dugačak naslov koji je pre', ' lomljen u dva reda', 'DTSTART;VALUE=DATE:20261026', 'END:VEVENT',
    'END:VCALENDAR', '',
  ].join('\r\n');
  const events = JSON.parse(JSON.stringify(Core.parseIcsEvents(text)));
  assert.deepEqual(events.map(item => item.uid), ['a', 'b', 'c', 'd', 'e', 'g'], 'the cancelled event is left out');
  assert.deepEqual(events[0], { uid: 'a', summary: 'Lekar, pregled', description: 'Ponesi\nknjižicu', date: '2026-10-20', time: '10:00', durationMinutes: 60, allDay: false, recurring: false });
  assert.deepEqual(events[1], { uid: 'b', summary: 'Rođendan', description: '', date: '2026-10-21', time: null, durationMinutes: null, allDay: true, recurring: false });
  assert.deepEqual([events[2].date, events[2].time, events[2].durationMinutes], ['2026-10-22', '16:00', 45], '10:00 in New York is 16:00 in Belgrade');
  assert.deepEqual([events[3].date, events[3].time, events[3].durationMinutes], ['2026-10-23', '18:30', 90]);
  assert.equal(events[4].recurring, true);
  assert.equal(events[5].summary, 'Dugačak naslov koji je prelomljen u dva reda');
  assert.deepEqual(Core.parseIcsEvents('not a calendar'), []);
});

test('the import plan: from today on, no repeats, no duplicates of open tasks, at most 500', () => {
  const events = [
    { uid: '1', summary: 'Lekar', description: 'Ponesi knjižicu', date: '2026-10-20', time: '10:00', durationMinutes: 60, allDay: false, recurring: false },
    { uid: '2', summary: 'Juče', description: '', date: '2026-10-11', time: null, durationMinutes: null, allDay: true, recurring: false },
    { uid: '3', summary: 'Teretana', description: '', date: '2026-10-24', time: '19:00', durationMinutes: 60, allDay: false, recurring: true },
    { uid: '4', summary: 'Kupovina', description: '', date: '2026-10-21', time: null, durationMinutes: null, allDay: true, recurring: false },
    { uid: '5', summary: '  ', description: '', date: '2026-10-22', time: '08:00', durationMinutes: 3000, allDay: false, recurring: false },
  ];
  const existing = [task('x', { title: 'kupovina', plannedDate: '2026-10-21' })];
  const plan = JSON.parse(JSON.stringify(Core.icsImportTasks(events, existing, '2026-10-12')));
  assert.deepEqual(plan.drafts, [
    { title: 'Lekar', notes: 'Ponesi knjižicu', plannedDate: '2026-10-20', plannedTime: '10:00', durationMinutes: 60 },
    { title: '', notes: '', plannedDate: '2026-10-22', plannedTime: '08:00', durationMinutes: null },
  ]);
  assert.deepEqual([plan.past, plan.recurring, plan.duplicates, plan.overLimit], [1, 1, 1, 0]);
  const many = Array.from({ length: 520 }, (_, index) => ({ ...events[0], uid: String(index), summary: `E${index}` }));
  const big = Core.icsImportTasks(many, [], '2026-10-12');
  assert.deepEqual([big.drafts.length, big.overLimit], [500, 20]);
});

test('Settings → Podaci: export and import rows; the import asks first and offers Undo', () => {
  const ui = read('js/settings-ui.js');
  assert.match(ui, /data-action="export-ics"/);
  assert.match(ui, /data-action="import-ics"/);
  assert.match(ui, /<input id="ics-import-input" type="file" accept="\.ics,text\/calendar" hidden \/>/);
  assert.match(fn('exportIcsAction'), /Core\.calendarIcs\(listTasks\(\), \{ now: new Date\(\), dueLabel: tr\('Due'\) \}\)/);
  assert.match(fn('exportIcsAction'), /globalThis\.DailoPlatform\.files\.saveFile\(new Blob\(\[text\], \{ type: 'text\/calendar;charset=utf-8' \}\), `dailo-kalendar-\$\{Core\.dateOnly\(\)\}\.ics`/);
  const importer = fn('importIcsFile');
  assert.match(importer, /const plan = Core\.icsImportTasks\(Core\.parseIcsEvents\(await file\.text\(\)\), listTasks\(\), Core\.dateOnly\(\)\);/);
  assert.match(importer, /openConfirm\(\{ title: msg\('Import calendar events\?'\), message: msg\('\{count\} events become planned tasks\. Skipped: \{past\} past, \{recurring\} repeating, \{duplicates\} already here\.'\), messageParams:/);
  assert.match(importer, /confirmKind: 'primary'/);
  assert.match(importer, /setUndo\(msg\('Calendar events imported'\), \(\) => \{ restoreTasks\(snapshot\); saveState\(\); render\(\); \}\);/);
  assert.match(app, /if \(event\.target\.id === 'ics-import-input'\) \{ const file = event\.target\.files\?\.\[0\]; event\.target\.value = ''; if \(file\) importIcsFile\(file\)\.catch\(\(\) => setToastMessage\(tr\('The calendar file could not be read\.'\)\)\); return; \}/);
  assert.match(fn('renderConfirmModal'), /tr\(modalState\.message, modalState\.messageParams\)/);
  assert.match(fn('renderConfirmModal'), /modalState\.confirmKind === 'primary' \? 'btn-primary' : 'btn-danger'/);
});

test('Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Calendar file (.ics)', 'Kalendar (.ics)'], ['Import calendar events?', 'Uvesti događaje iz kalendara?'], ['Calendar events imported', 'Događaji iz kalendara su uvezeni'], ['Due', 'Rok']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R52 is released as 2.0.0-alpha.79', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.79');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.79';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.79');
});
