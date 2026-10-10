// Modernization M2: data and sync correctness found by the 2026-10-09 audit (Y-1, Y-2, D-1, S-1, E-2).
// Belgrade time makes the UTC/local-day difference visible (node --test runs each file in its own process).
process.env.TZ = 'Europe/Belgrade';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Sync = require('../js/sync.js');
const Storage = require('../js/storage.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const NOW = '2026-10-09T08:00:00.000Z';
const base = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
const task = (id, extra = {}) => ({ id, title: id, projectId: null, areaId: null, goalIds: [], tagIds: [], plannedTime: null, dueTime: null, attachmentIds: [], createdAt: NOW, updatedAt: NOW, ...extra });

// A tiny in-memory server with the same row shape as Supabase `records`.
function fakeServer() {
  const rows = new Map();
  let clock = 1;
  const stamp = () => new Date(Date.UTC(2026, 9, 9, 0, 0, clock++)).toISOString();
  return {
    rows,
    put: (type, id, data, deleted = false) => rows.set(`${type}/${id}`, { type, id, data: deleted ? null : data, deleted, updated_at: stamp() }),
    client: {
      ensureSession: async session => session,
      push: async (_session, records) => { for (const r of records) rows.set(`${r.type}/${r.id}`, { type: r.type, id: r.id, data: r.deleted ? null : r.data, deleted: Boolean(r.deleted), updated_at: stamp() }); },
      pull: async (_session, since) => [...rows.values()].filter(r => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)),
    },
  };
}
const localStore = initial => {
  let state = initial;
  return { get state() { return state; }, readLocal: async () => ({ state, habitLogs: [] }), writeLocal: async result => { state = result.state; } };
};

// R12a made "journal" a known type; these tests use a made-up type a newer app might add.
test('Y-1: an older client never deletes record types it does not know', async () => {
  const server = fakeServer();
  const local = localStore({ ...base(), tasks: [task('t1')] });
  const meta = { session: { accessToken: 'x' } };
  assert.equal((await Sync.syncOnce({ client: server.client, meta, ...local })).status, 'ok');
  server.put('futureType', 'f1', { id: 'f1', text: 'from a newer app' });
  await Sync.syncOnce({ client: server.client, meta, ...local });
  await Sync.syncOnce({ client: server.client, meta, ...local });
  assert.equal(server.rows.get('futureType/f1').deleted, false, 'the unknown row stays on the server');
  assert.ok(!Object.keys(meta.shadow).some(key => key.startsWith('futureType/')), 'unknown types never enter the shadow');
});

test('Y-1: a shadow that already holds unknown types (older build) does not push deletions for them', () => {
  const records = Sync.collectRecords({ ...base(), tasks: [task('t1')] });
  const { deletes } = Sync.diffRecords(records, { 'futureType/f1': 'hash', 'tasks/t0': 'hash' });
  assert.deepEqual(deletes, [{ type: 'tasks', id: 't0' }], 'only known types are deleted');
});

test('Y-1: first sync in "device" and "server" mode leaves unknown types alone', async () => {
  for (const mode of ['device', 'server']) {
    const server = fakeServer();
    server.put('tasks', 'r1', task('r1'));
    server.put('futureType', 'f1', { id: 'f1', text: 'keep me' });
    const local = localStore({ ...base(), tasks: [task('t1')] });
    const meta = { session: { accessToken: 'x' } };
    assert.equal((await Sync.syncOnce({ client: server.client, meta, mode, ...local })).status, 'ok');
    await Sync.syncOnce({ client: server.client, meta, ...local });
    assert.equal(server.rows.get('futureType/f1').deleted, false, `${mode}: the unknown row survives`);
  }
});

test('Y-2: pruneDanglingReferences drops links to records deleted on another device', () => {
  const state = {
    ...base(),
    areas: [{ id: 'a1', name: 'A', createdAt: NOW, updatedAt: NOW }],
    tasks: [task('t1', { projectId: 'gone-project' }), task('t2', { areaId: 'gone-area', goalIds: ['gone-goal'] }), task('t3', { areaId: 'a1' })],
    projects: [{ id: 'p1', name: 'P', areaId: 'gone-area', goalIds: ['gone-goal'], isArchived: false, createdAt: NOW, updatedAt: NOW }],
    notes: [{ id: 'n1', title: 'N', areaId: 'gone-area' }],
    resources: [{ id: 'r1', title: 'R', areaId: null, relatedTaskIds: ['t1', 'gone-task'], relatedProjectIds: ['gone-project'], relatedGoalIds: [], relatedHabitIds: ['gone-habit'] }],
    goals: [{ id: 'g1', title: 'G', areaId: 'gone-area' }],
    habits: [{ id: 'h1', name: 'H', areaId: 'gone-area' }],
  };
  const before = JSON.stringify(state);
  const next = Core.pruneDanglingReferences(state);
  assert.equal(JSON.stringify(state), before, 'the input is not changed');
  const byId = list => Object.fromEntries(list.map(item => [item.id, item]));
  const tasks = byId(next.tasks);
  assert.equal(tasks.t1.projectId, null);
  assert.equal(tasks.t2.areaId, null);
  assert.deepEqual(tasks.t2.goalIds, []);
  assert.equal(tasks.t3.areaId, 'a1', 'valid links stay');
  assert.equal(next.projects[0].areaId, null);
  assert.deepEqual(next.projects[0].goalIds, []);
  assert.equal(next.notes[0].areaId, null);
  assert.deepEqual(next.resources[0].relatedTaskIds, ['t1']);
  assert.deepEqual(next.resources[0].relatedProjectIds, []);
  assert.deepEqual(next.resources[0].relatedHabitIds, []);
  assert.equal(next.goals[0].areaId, null);
  assert.equal(next.habits[0].areaId, null);
});

test('Y-2: pulled tombstones no longer stop sync on normalization', () => {
  const now = new Date().toISOString();
  const project = { id: 'p1', name: 'P', areaId: null, goalIds: [], isArchived: false, createdAt: now, updatedAt: now };
  const local = Core.normalizeState({ ...base(), projects: [project], tasks: [task('t1', { projectId: 'p1', createdAt: now, updatedAt: now }), task('t2', { projectId: 'p1', createdAt: now, updatedAt: now })] });
  const pulled = Sync.applyRemote(local, [], [{ type: 'projects', id: 'p1', deleted: true, data: null, updated_at: now }]);
  assert.throws(() => Core.normalizeState(pulled.state), /missing-task-project/, 'without pruning the state is rejected');
  const repaired = Core.normalizeState(Core.pruneDanglingReferences(pulled.state));
  assert.deepEqual(repaired.tasks.map(item => [item.id, item.projectId]), [['t1', null], ['t2', null]], 'the tasks survive without their project');
});

test('Y-2: the app prunes pulled data before normalizing it', () => {
  const block = read('js/app.js').match(/async function applySyncResult[\s\S]*?\n  }\n/)[0];
  assert.match(block, /normalizeState\((Core\.settleArrivedReminders\(previous, )?Core\.pruneDanglingReferences\(result\.state\)/, 'M12 wraps the pruned state in settleArrivedReminders');
});

test('D-1: localDateOf turns an instant into the local calendar day', () => {
  const justAfterMidnight = new Date(2026, 9, 9, 0, 30).toISOString();
  assert.equal(justAfterMidnight.slice(0, 10), '2026-10-08', 'the UTC text is still the previous day in Belgrade');
  assert.equal(Core.localDateOf(justAfterMidnight), '2026-10-09');
  assert.equal(Core.localDateOf('2026-10-09'), '2026-10-09', 'a calendar date passes through unchanged');
  assert.equal(Core.localDateOf(''), null);
  assert.equal(Core.localDateOf('not a date'), null);
  assert.equal(Core.localDateOf(null), null);
});

test('D-1: a task completed at 00:30 local time counts as completed today', () => {
  const completedAt = new Date(2026, 9, 9, 0, 30).toISOString();
  const sections = Core.deriveTodaySections([task('t1', { isCompleted: true, completedAt })], '2026-10-09');
  assert.deepEqual(sections.completed.map(item => item.id), ['t1']);
});

test('D-1: goal history days are local days', () => {
  const createdAt = new Date(2026, 9, 9, 0, 30).toISOString();
  const history = Core.goalProgressHistory({ id: 'g1' }, { goalHistory: [{ id: 'e1', goalId: 'g1', type: 'manualProgress', createdAt, data: { to: 40 } }] }, { start: '2026-10-09', end: '2026-10-09' });
  assert.deepEqual(history.map(event => event.date), ['2026-10-09']);
});

test('D-1: no instant is sliced into a calendar date anymore', () => {
  for (const file of ['js/core.js', 'js/app.js', 'js/tasks-ui.js', 'js/cleaning-ui.js']) {
    assert.doesNotMatch(read(file), /(completedAt|createdAt)[^;\n]{0,24}\.slice\(0, ?10\)/, `${file} uses Core.localDateOf`);
  }
});

test('S-1: only images, PDF and plain text open inside the app', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain']) assert.equal(Core.attachmentOpensInline(type), true, type);
  for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'application/javascript', 'text/xml', 'application/octet-stream', '', undefined]) assert.equal(Core.attachmentOpensInline(type), false, String(type));
  assert.equal(Core.attachmentOpensInline('IMAGE/PNG; charset=binary'), true, 'case and parameters are ignored');
});

test('S-1: the app downloads attachments it will not open inline', () => {
  const block = read('js/app.js').match(/async function openAttachment[\s\S]*?\n  }\n/)[0];
  assert.match(block, /Core\.attachmentOpensInline\(/);
});

test('E-2: snapshot size counts shared attachment lists and Blobs once', () => {
  const blob = new Blob([new Uint8Array(1024 * 1024)]);
  const attachments = [{ id: 'f1', blob }];
  const once = Storage.estimateSnapshotBytes({ attachments });
  const shared = Storage.estimateSnapshotBytes({ attachments, attachmentRefs: attachments });
  assert.ok(shared < once + 64, `shared list counted once (${once} vs ${shared})`);
  const twoLists = Storage.estimateSnapshotBytes({ a: [{ blob }], b: [{ blob }] });
  assert.ok(twoLists < 1024 * 1024 + 256, 'the same Blob in two lists is counted once');
});
