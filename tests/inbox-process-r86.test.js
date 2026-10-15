// R86: Inbox is for emptying, not browsing. The type filters are gone (Inbox always lists everything), and Razvrstaj
// redom gets two more ways out for a task: "Završi" (done on the spot) and "U beleške" (it was really a note: the title,
// the notes and the subtasks as list lines go to a new note, the task leaves with Undo). A task with files stays a task.
// The guide says what lands in Inbox: a task without a day and without a project, also from the voice, the widget and
// "Podeli u Dailo".
// Spec: docs/superpowers/specs/2026-10-15-r86-inbox-process.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');

test('Inbox has no type filters; the list and the sorting take everything', () => {
  const inbox = fn('renderInbox');
  assert.doesNotMatch(inbox, /inbox-filter-chips|data-action="inbox-filter"/);
  assert.match(inbox, /const records = activeInboxRecords\('all'\);/);
  assert.match(fn('openInboxTriage'), /queue: activeInboxRecords\('all'\)\.map\(record => \[record\.type, record\.item\.id\]\)/);
  assert.doesNotMatch(app, /action === 'inbox-filter'/);
  assert.doesNotMatch(read('css/styles.css'), /\.inbox-filter-chips/);
  assert.ok(!read('js/i18n-sr.js').includes('"Filter Inbox"'), 'the unused line is gone');
});

test('Razvrstaj redom: a task can be completed on the spot or moved to the notes', () => {
  const triage = fn('renderInboxTriage');
  assert.match(triage, /button\('inbox-complete', tr\('Complete'\), `data-task-id="\$\{esc\(id\)\}"`\)/);
  assert.match(triage, /\(item\.attachmentIds \|\| \[\]\)\.length \? '' : button\('inbox-to-note', tr\('To notes'\), `data-task-id="\$\{esc\(id\)\}"`\)/);
  assert.match(app, /else if \(action === 'inbox-complete'\) \{ toggleComplete\(el\.dataset\.taskId\); if \(modalState\?\.type === 'inbox-triage'\) renderModal\(\); \}/);
  assert.match(app, /else if \(action === 'inbox-to-note'\) inboxTaskToNote\(el\.dataset\.taskId\);/);
});

test('"U beleške" makes a note from the task and removes the task through the delete snapshot, with Undo', () => {
  const convert = fn('inboxTaskToNote');
  assert.match(convert, /if \(!task \|\| undoHold \|\| \(task\.attachmentIds \|\| \[\]\)\.length\) return;/);
  assert.match(convert, /const lines = \(task\.subtasks \|\| \[\]\)\.map\(item => `- \[\$\{item\.isCompleted \? 'x' : ' '\}\] \$\{item\.title\}`\)\.join\('\\n'\);/);
  assert.match(convert, /const note = \{ id: uid\('note'\), title: task\.title \|\| tr\('Note'\), body: \[task\.notes \|\| '', lines\]\.filter\(Boolean\)\.join\('\\n\\n'\), areaId: Core\.effectiveTaskArea\(task, state\.projects \|\| \[\]\) \|\| null, tagIds: \[\.\.\.\(task\.tagIds \|\| \[\]\)\], linkUrls: \[\], attachmentIds: \[\], favorite: false, clip: '', createdAt: now, updatedAt: now \};/);
  assert.match(convert, /const snapshot = await buildDeleteSnapshot\('task', task\.id\);\n\s+await applyDeleteSnapshot\(snapshot\);\n\s+state\.notes\.push\(note\);/);
  assert.match(convert, /setUndo\(msg\('Moved to notes'\), async \(\) => \{ await restoreDeleteSnapshot\(snapshot\); state\.notes = state\.notes\.filter\(item => item\.id !== note\.id\); saveState\(\); render\(\); \}, \(\) => finalizeDeleteSnapshot\(snapshot\), snapshot\);/);
});

test('the guide says what lands in Inbox', () => {
  assert.ok(read('uputstvo.html').includes('Zadatak bez datuma i bez projekta ide u <strong>Inbox</strong>, i kad stigne glasom, preko widgeta ili opcije „Podeli u Dailo“.'));
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['To notes', 'U beleške'], ['Moved to notes', 'Prebačeno u beleške']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R86 is released as 2.0.0-alpha.113', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.113');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.113';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.113');
});
