// R103b: fixes from the review of R103. An archived task never carries a dangling tag or area (deleting a tag or area
// brings its archived tasks back first, and the archive drops references to tags and areas that are gone, so backups
// and saving keep working). Undo after "Sve na sutra" and the like keeps a task that came back from the archive.
// "Obriši završene" stops when the archived tasks could not come back. Restoring one archived task keeps Poništi
// working. A failed archive write stops sync. References between occurrences of a repeating series no longer keep
// them out of the archive, and a task named only by archived tasks stays archived after a sync.
// Data-model spec: docs/superpowers/specs/2026-10-15-r103-archived-tasks.md (section "R103b")
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15';
const at = date => new Date(`${date}T12:00:00`).toISOString();
const old = Core.addDays(TODAY, -200);
const task = (id, fields = {}) => ({ id, title: id, isCompleted: true, completedAt: at(old), isInbox: false, plannedDate: null, dueDate: null, projectId: null, areaId: null, tagIds: [], goalIds: [], subtasks: [], attachmentIds: [], createdAt: at('2026-01-01'), updatedAt: at(old), ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });
const rule = seriesId => ({ frequency: 'daily', interval: 1, endType: 'never', status: 'active', seriesId, occurrencesCreated: 1, skipNext: false });

test('the done occurrences of a repeating task are archived; the series links do not keep them', () => {
  const state = emptyState({ tasks: [
    task('first', { recurrence: rule('first'), recurrenceSuccessorId: 'second' }),
    task('second', { recurrence: rule('first'), recurrenceSuccessorId: 'live' }),
    task('live', { isCompleted: false, completedAt: null, recurrence: rule('first') }),
  ] });
  assert.deepEqual(Core.archivableTaskIds(state, TODAY), ['first', 'second']);
  const named = emptyState({ tasks: [task('a'), task('b')], resources: [{ id: 'r', title: 'r', relatedTaskIds: ['a'] }] });
  assert.deepEqual(Core.archivableTaskIds(named, TODAY), ['b'], 'other references still keep a task live');
});

test('after a sync, a task named only by archived tasks stays archived', () => {
  const tasks = [task('before', { relatedNote: 'after' }), task('after')];
  const split = Core.splitArchived(tasks, ['before', 'after'], emptyState({ tasks }), TODAY);
  assert.deepEqual(split.archived.map(item => item.id), ['before', 'after']);
  assert.deepEqual([split.live, split.unarchived], [[], []]);
});

test('an archived task drops the tags and the area that are gone; the ZIP is made all the same', async () => {
  const state = emptyState({ tags: [{ id: 'kept', name: 'Kuća' }], areas: [{ id: 'home', name: 'Dom', status: 'active' }] });
  const archived = task('a', { tagIds: ['kept', 'gone'], areaId: 'deleted' });
  assert.deepEqual(JSON.parse(JSON.stringify(Core.pruneArchivedTask(archived, state))), { ...archived, tagIds: ['kept'], areaId: null });
  const same = task('b', { tagIds: ['kept'], areaId: 'home' });
  assert.equal(Core.pruneArchivedTask(same, state), same, 'nothing gone, the same record');
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] }, archivedTasks: { listAll: async () => [archived] } };
  const blob = await Backup.exportBackupV3(Core.normalizeState(state), storage, '2026-10-15T10:00:00.000Z');
  const manifest = JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file('data.json').async('string'));
  assert.deepEqual([manifest.data.tasks[0].tagIds, manifest.data.tasks[0].areaId], [['kept'], null]);
});

test('the app keeps the archive consistent with tags, areas, Undo, restores and failures', () => {
  const app = read('js/app.js');
  const del = functionSource('requestDeleteEntity').source;
  assert.match(del, /if \(type === 'tag' \|\| type === 'area'\) archivedTasks\.filter\(item => \(type === 'tag' \? \(item\.tagIds \|\| \[\]\)\.includes\(identity\) : item\.areaId === identity\)\)\.forEach\(item => unarchiveTask\(item\.id\)\);/);
  assert.match(functionSource('snapshotTasks').source, /ids: new Set\(historyTasks\(\)\.map\(item => item\.id\)\)/);
  assert.match(functionSource('unarchiveTask').source, /const item = Core\.pruneArchivedTask\(found, state\);/);
  const all = functionSource('unarchiveAll').source;
  assert.match(all, /if \(!saveState\(\)\) \{ state\.tasks = previous; archivedTasks = archived; return false; \}/);
  assert.match(functionSource('clearCompleted').source, /if \(!unarchiveAll\(\)\) return;/);
  const load = functionSource('loadArchive').source;
  assert.match(load, /archiveFailed = true; archivedTasks = \[\];/);
  assert.match(load, /const pruned = kept\.map\(item => Core\.pruneArchivedTask\(item, state\)\);/);
  const apply = functionSource('applySyncResult').source;
  assert.match(apply, /const kept = split\.archived\.map\(item => Core\.pruneArchivedTask\(item, state\)\);/);
  assert.match(apply, /catch \(error\) \{ archiveFailed = true; throw error; \}/);
  assert.match(functionSource('beginGlobalOperation').source, /op\.validated\.archivedTasks = selection \? \(op\.payload\.archivedTasks \|\| \[\]\)\.filter\(item => !op\.validated\.state\.tasks\.some\(entry => entry\.id === item\.id\)\) : \[\];/);
  assert.match(app, /moreRow\('completed', 'ph-check-circle', tr\('Completed tasks'\), count\(historyTasks\(\)\.filter\(task => task\.isCompleted\)\)\)/);
  assert.match(functionSource('renderCompleted').source, /const clear = historyTasks\(\)\.some\(task => task\.isCompleted\)/);
});

test('R103b is released as 2.0.0-alpha.132', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.132');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.132';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.132');
  assert.ok(read('docs/superpowers/specs/2026-10-15-r103-archived-tasks.md').includes('## R103b'));
});
