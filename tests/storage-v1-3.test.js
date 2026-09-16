const test = require('node:test');
const assert = require('node:assert/strict');

global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
require('../js/attachments.js');
const S = global.TodoStorage;

test('habit logs round-trip by habit and date', async () => {
  await S.clearAllForTests();
  await S.habitLogs.put({ id: 'h1:2026-09-16', habitId: 'h1', date: '2026-09-16', status: 'done', value: null });
  const item = await S.habitLogs.getByHabitAndDate('h1', '2026-09-16');
  assert.equal(item.status, 'done');
  assert.equal((await S.habitLogs.listByHabit('h1')).length, 1);
});

test('habit logs keep different dates for the same habit', async () => {
  await S.clearAllForTests();
  await S.habitLogs.put({ id: 'h1:2026-09-16', habitId: 'h1', date: '2026-09-16', status: 'done', value: null });
  await S.habitLogs.put({ id: 'h1:2026-09-17', habitId: 'h1', date: '2026-09-17', status: 'skipped', value: null });
  assert.equal((await S.habitLogs.listByHabit('h1')).length, 2);
  assert.equal((await S.habitLogs.getByHabitAndDate('h1', '2026-09-17')).status, 'skipped');
});

test('goal history and recovery snapshots are isolated stores', async () => {
  await S.clearAllForTests();
  await S.goalHistory.put({ id: 'e1', goalId: 'g1', type: 'created', data: {}, createdAt: '2026-09-16T00:00:00Z' });
  await S.recoverySnapshots.put({ id: 'r1', reason: 'reset', appData: { version: 3 } });
  assert.equal((await S.goalHistory.listByGoal('g1')).length, 1);
  assert.equal((await S.recoverySnapshots.get('r1')).reason, 'reset');
});

test('attachment facade reads and writes the shared attachments namespace', async () => {
  await S.clearAllForTests();
  await S.attachments.put({ id: 'a1', taskId: 't1', fileName: 'note.txt', pendingDeleteUntil: null });
  assert.equal((await global.TodoAttachments.get('a1')).fileName, 'note.txt');

  await global.TodoAttachments.put({ id: 'a2', taskId: 't1', fileName: 'second.txt', pendingDeleteUntil: null });
  assert.deepEqual((await S.attachments.listByTask('t1')).map(record => record.id).sort(), ['a1', 'a2']);
});

test('attachment facade preserves the V1.2 put return value', async () => {
  await S.clearAllForTests();
  const record = { id: 'a1', taskId: 't1', fileName: 'note.txt', pendingDeleteUntil: null };
  assert.strictEqual(await global.TodoAttachments.put(record), record);
});
