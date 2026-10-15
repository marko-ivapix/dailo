// R103: old completed tasks leave localStorage for IndexedDB v2 (the new store `archivedTasks`). A task is archived
// 180 days after it was completed when it has no project (project bars and counts stay the same), no files, no goal,
// and nothing else in the data names its id. Archived tasks stay in Search, Završeni zadaci, the summary, ZIP backups
// (merged back into data.tasks, so the ZIP format is unchanged), the phone's file mirror and sync: sync sees them as
// present, so it never sends a deletion for them, and a change from another device brings one back. Any action on an
// archived task brings it back first. Reset, restore and recovery treat the store like the other user stores.
// Data-model spec: docs/superpowers/specs/2026-10-15-r103-archived-tasks.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-15';
const at = date => new Date(`${date}T12:00:00`).toISOString();
const old = Core.addDays(TODAY, -181), recent = Core.addDays(TODAY, -179);
const task = (id, fields = {}) => ({ id, title: id, isCompleted: true, completedAt: at(old), isInbox: false, plannedDate: null, dueDate: null, projectId: null, areaId: null, tagIds: [], goalIds: [], subtasks: [], attachmentIds: [], createdAt: at('2026-01-01'), updatedAt: at(old), ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('which tasks are archived: completed 180 days ago, no project, no files, no goal, named nowhere else', () => {
  assert.equal(Core.ARCHIVE_AFTER_DAYS, 180);
  const state = emptyState({
    projects: [{ id: 'p', name: 'p', color: '#5362FF', goalIds: [], isArchived: false, order: 0, createdAt: at('2026-01-01'), updatedAt: at('2026-01-01') }],
    tasks: [
      task('old'), task('recent', { completedAt: at(recent) }), task('open', { isCompleted: false, completedAt: null }),
      task('project', { projectId: 'p' }), task('files', { attachmentIds: ['a1'] }), task('goal', { goalIds: ['g'] }),
      task('named', {}), task('successor', { recurrenceSuccessorId: 'named', completedAt: at(recent) }), task('resource'),
    ],
    resources: [{ id: 'r', title: 'r', relatedTaskIds: ['resource'] }],
  });
  // R103b: a series link (recurrenceSuccessorId) is never looked up, so it no longer keeps "named" live; the resource does.
  assert.deepEqual(Core.archivableTaskIds(state, TODAY), ['old', 'named']);
  assert.deepEqual(Core.archivableTaskIds(state, TODAY, 1).sort(), ['named', 'old', 'recent', 'successor'], 'the age is a parameter');
});

test('after a sync, an archived task stays archived, comes back when it changed, and goes when it was deleted', () => {
  const state = emptyState();
  const tasks = [task('live', { isCompleted: false, completedAt: null }), task('kept', { title: 'Renamed' }), task('reopened', { isCompleted: false, completedAt: null })];
  const split = Core.splitArchived(tasks, ['kept', 'reopened', 'gone'], { ...state, tasks }, TODAY);
  assert.deepEqual(split.live.map(item => item.id), ['live', 'reopened']);
  assert.deepEqual(split.archived.map(item => [item.id, item.title]), [['kept', 'Renamed']]);
  assert.deepEqual([split.unarchived, split.removed], [['reopened'], ['gone']]);
});

test('IndexedDB v2 adds the store; reset, restore and recovery treat it like the other user stores', async () => {
  assert.equal(Storage.DB_VERSION, 2);
  assert.ok(Storage.STORES.includes('archivedTasks'));
  assert.match(read('js/storage.js'), /const archivedTasks = db\.objectStoreNames\.contains\('archivedTasks'\)\n\s+\? tx\.objectStore\('archivedTasks'\)\n\s+: db\.createObjectStore\('archivedTasks', \{ keyPath: 'id' \}\);/);
  await Storage.clearAllForTests();
  await Storage.archivedTasks.putMany([task('a'), task('b')]);
  assert.deepEqual((await Storage.archivedTasks.listAll()).map(item => item.id).sort(), ['a', 'b']);
  const captured = await Storage.captureUserData();
  assert.deepEqual(captured.archivedTasks.map(item => item.id).sort(), ['a', 'b']);
  assert.equal(await Storage.sameUserData(captured, { attachments: [], habitLogs: [], goalHistory: [] }), false, 'a payload without the store means an empty one');
  await Storage.replaceUserData({ attachments: [], habitLogs: [], goalHistory: [] });
  assert.deepEqual(await Storage.archivedTasks.listAll(), [], 'an older recovery copy (no archive) restores an empty archive; its state holds every task');
  assert.equal(await Storage.sameUserData(await Storage.captureUserData(), { attachments: [], habitLogs: [], goalHistory: [] }), true);
  assert.equal(await Storage.archivedTasks.fillEmpty([task('c')]), 1);
  await Storage.archivedTasks.deleteMany(['c']);
  assert.deepEqual(await Storage.archivedTasks.listAll(), []);
});

test('the ZIP carries the archived tasks in data.tasks; the format stays backupVersion 2', async () => {
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] }, archivedTasks: { listAll: async () => [task('archived')] } };
  const state = Core.normalizeState(emptyState({ tasks: [task('live', { isCompleted: false, completedAt: null })] }));
  const blob = await Backup.exportBackupV3(state, storage, '2026-10-15T10:00:00.000Z');
  const manifest = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file('data.json').async('string'));
  assert.equal(manifest.backupVersion, 2);
  assert.deepEqual(manifest.data.tasks.map(item => item.id).sort(), ['archived', 'live']);
  const restored = await Backup.inspectBackupV3(blob);
  assert.deepEqual(restored.state.tasks.map(item => item.id).sort(), ['archived', 'live'], 'a restore brings every task back; the next start archives the old ones again');
});

test('sync sees archived tasks as present: no deletion is sent for them', () => {
  const live = task('live', { isCompleted: false, completedAt: null }), archived = task('archived');
  const state = emptyState({ tasks: [live, archived] });
  const shadow = Object.fromEntries([...Sync.collectRecords(state, [])].map(([key, record]) => [key, Sync.hashRecord(record.data)]));
  const withArchive = Sync.collectRecords({ ...state, tasks: [live, archived] }, []);
  assert.deepEqual(Sync.diffRecords(withArchive, shadow).deletes, []);
  const app = read('js/app.js');
  assert.match(app, /readLocal: async \(\) => \{ const habitLogs = await TodoStorage\.habitLogs\.listAll\(\); return \{ state: withArchive\(state\), habitLogs, attachments: await syncAttachmentList\(\) \}; \},/);
  assert.match(functionSource('runSync').source, /if \(!state \|\| recovery \|\| globalOperation \|\| startupPromise \|\| storageError \|\| staleDataNotice \|\| archiveFailed\) return;/);
  const apply = functionSource('applySyncResult').source;
  assert.match(apply, /const split = archivedTasks\.length \? Core\.splitArchived\(result\.state\.tasks, archivedTasks\.map\(item => item\.id\), result\.state, Core\.dateOnly\(\)\)\n\s+: \{ live: result\.state\.tasks, archived: \[\], unarchived: \[\], removed: \[\] \};/);
  // R103b: the archived tasks kept after the split (with gone tags and areas dropped) are what is compared and written.
  assert.match(apply, /const changed = archivedTasks\.filter\(item => before\.get\(item\.id\) !== JSON\.stringify\(item\)\);\n\s+if \(changed\.length\) await TodoStorage\.archivedTasks\.putMany\(changed\);/);
  assert.match(apply, /await TodoStorage\.archivedTasks\.deleteMany\(\[\.\.\.split\.unarchived, \.\.\.split\.removed\]\);/);
  assert.match(apply, /state = normalizeState\(Core\.settleArrivedReminders\(previous, Core\.pruneDanglingReferences\(\{ \.\.\.result\.state, tasks: split\.live \}\), nowIso\(\)\)\);/);
});

test('the app loads the archive before sync, archives at start, and brings a task back on any action', () => {
  const app = read('js/app.js');
  assert.match(functionSource('drainReady').source, /try \{ await loadArchive\(\); \} catch \(error\) \{ archiveFailed = true; console\.error\(error\); \}/);
  // R103b: the memory archive empties while it loads, so a failure never shows the one before.
  assert.match(functionSource('loadArchive').source, /archiveFailed = true; archivedTasks = \[\];\n[\s\S]*archiveFailed = false;/);
  assert.match(functionSource('init').source, /await startReady\(\);\n[\s\S]*?await archiveOldTasks\(\)\.catch\(console\.error\);\n[\s\S]*?startSync\(\);/);
  const archive = functionSource('archiveOldTasks').source;
  assert.match(archive, /const ids = new Set\(Core\.archivableTaskIds\(state, Core\.dateOnly\(\)\)\);/);
  assert.match(archive, /await TodoStorage\.archivedTasks\.putMany\(moving\);/);
  assert.match(archive, /if \(!saveState\(\)\) \{ state\.tasks = previous; await TodoStorage\.archivedTasks\.deleteMany\(\[\.\.\.movedIds\]\); return 0; \}/);
  // R103b: the kept tasks pass through pruneArchivedTask before they become the memory archive.
  assert.match(functionSource('loadArchive').source, /const kept = stored\.filter\(item => !live\.has\(item\.id\)\);/);
  assert.match(functionSource('historyTasks').source, /return \[\.\.\.state\.tasks, \.\.\.archivedTasks\];/);
  assert.match(functionSource('searchResultsHtml').source, /Core\.searchItems\(historyTasks\(\), state\.projects, query\)/);
  assert.match(functionSource('renderCompleted').source, /Core\.filterCompleted\(historyTasks\(\), \{ projectId, periodDays \}, nowIso\(\)\)/);
  assert.match(functionSource('completedSummaryCard').source, /Core\.completionSummary\(historyTasks\(\), Core\.dateOnly\(\)\)/);
  assert.match(functionSource('unarchiveTask').source, /state\.tasks\.push\(item\); archivedTasks = archivedTasks\.filter\(entry => entry\.id !== id\);/);
  assert.match(app, /if \(el\?\.dataset\?\.taskId\) unarchiveTask\(el\.dataset\.taskId\);/);
  assert.match(functionSource('openTaskDetail').source, /unarchiveTask\(taskId\);/);
  // R103b: when the archived tasks cannot come back, clearing stops.
  assert.match(functionSource('clearCompleted').source, /if \(!unarchiveAll\(\)\) return;\n\s+requestDeleteEntity\('clear-completed', null\);/);
});

test('reset, restore, the safety ZIP and the phone mirror include the archive', () => {
  const begin = functionSource('beginGlobalOperation').source;
  assert.match(begin, /archivedTasks: \{ listAll: async \(\) => op\.payload\.archivedTasks \|\| \[\] \}/);
  // R103b: a task the one-item restore brings into the state leaves the kept archive (tests/archive-r103b.test.js).
  assert.match(begin, /op\.validated\.archivedTasks = selection \? \(op\.payload\.archivedTasks \|\| \[\]\)\.filter\(/);
  assert.match(functionSource('verifyGlobalReplacement').source, /archivedTasks: next\.archivedTasks/);
  const commit = functionSource('commitGlobalOperation').source;
  assert.match(commit, /goalHistory: op\.validated\.goalHistory, archivedTasks: op\.validated\.archivedTasks \} \}\);/);
  assert.match(commit, /await loadArchive\(\)\.catch\(console\.error\);/);
  assert.match(read('js/storage.js'), /await replaceUserData\(\{ attachments: next\.attachmentRecords, habitLogs: next\.habitLogs, goalHistory: next\.goalHistory, archivedTasks: next\.archivedTasks \|\| \[\] \}, expected, validateFn\);/);
  assert.match(read('js/platform.js'), /archivedTasks: 'dailo\/archived-tasks\.json'/);
  assert.match(functionSource('queueRecordsMirror').source, /\['habitLogs', 'goalHistory', 'archivedTasks'\]/);
  assert.match(functionSource('restoreRecordsMirror').source, /\['habitLogs', 'goalHistory', 'archivedTasks'\]/);
});

test('the rules and the pages say IndexedDB v2; the guide and Šta je novo explain the archive', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md']) assert.doesNotMatch(read(file), /IndexedDB v1/, file);
  assert.match(read('CLAUDE.md'), /IndexedDB v2/);
  assert.ok(read('uputstvo.html').includes('Zadaci bez projekta završeni pre više od 180 dana sele se u arhivu na uređaju, da glavni podaci ostanu mali. I dalje ih nalaziš u Pretrazi i u Završenim zadacima, u rezervnoj kopiji su i sinhronizuju se; čim nešto uradiš sa takvim zadatkom, vraća se među ostale.'));
  assert.ok(read('novo.html').includes('<li><strong>Stari završeni zadaci u arhivi.</strong>'));
});

test('R103 shipped as 2.0.0-alpha.131 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 131) >= 131);
});
