const test = require('node:test');
const assert = require('node:assert/strict');

global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };

const baseState = () => TodoCore.normalizeState({
  version: 3,
  tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [],
  settings: {}, ui: {},
});

function manifest(state = baseState(), attachments = []) {
  return {
    backupVersion: 2,
    appVersion: '1.3',
    exportedAt: '2026-09-22T10:00:00.000Z',
    data: state,
    attachments,
    habitLogs: [],
    goalHistory: [],
  };
}

async function zipWith(entries) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generateAsync({ type: 'blob' });
}

test('backup preflight rejects an archive over the ZIP entry limit before extraction', async () => {
  const limits = { maxZipEntries: 2 };
  const payload = await zipWith({ 'data.json': JSON.stringify(manifest()), 'extra-a': 'a', 'extra-b': 'b' });
  await assert.rejects(() => Backup.inspectBackupV3(payload, { limits }), /ZIP entry limit/i);
});

test('backup preflight rejects declared attachment count and bytes before extraction', async () => {
  const state = TodoCore.normalizeState({ ...baseState(), tasks: [{ id: 'task', title: 'Task', attachmentIds: ['file'] }] });
  const attachments = [{ id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 8, path: 'attachments/task_task/file.txt' }];
  const payload = await zipWith({
    'data.json': JSON.stringify(manifest(state, attachments)),
    'attachments/task_task/file.txt': '12345678',
  });
  await assert.rejects(() => Backup.inspectBackupV3(payload, { limits: { maxAttachments: 0 } }), /attachment count/i);
  await assert.rejects(() => Backup.inspectBackupV3(payload, { limits: { maxAttachmentBytes: 4 } }), /attachment bytes/i);
});

test('backup extraction enforces decompressed size while reading entries', async () => {
  const payload = await zipWith({ 'data.json': JSON.stringify(manifest()), 'large.bin': '1234567890' });
  await assert.rejects(() => Backup.inspectBackupV3(payload, { limits: { maxDecompressedBytes: 8 } }), /decompressed/i);
});

test('automatic snapshots stay within a byte budget and preserve non-automatic recovery copies', async () => {
  await Storage.clearAllForTests();
  const state = TodoCore.normalizeState({ ...baseState(), tasks: [{ id: 'task', title: 'Task', attachmentIds: ['file'] }] });
  await Storage.attachments.put({ id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 20, blob: new Blob(['12345678901234567890'], { type: 'text/plain' }) });
  localStorage.setItem('todoAppData', JSON.stringify(state));
  await Storage.recoverySnapshots.put({ id: 'safety', reason: 'restore', phase: 'prepared', createdAt: '2026-09-22T09:00:00.000Z' });
  await assert.rejects(() => Storage.createAutomaticSnapshot(state, new Date('2026-09-22T10:00:00Z'), { maxBytes: 1 }), /snapshot budget/i);
  assert.ok(await Storage.recoverySnapshots.get('safety'));
  assert.equal((await Storage.recoverySnapshots.listAll()).filter(item => item.reason === 'automatic').length, 0);
});

test('recovery-backed replacement preserves canonical data and attachments on injected failure', async () => {
  await Storage.clearAllForTests();
  const original = TodoCore.normalizeState({ ...baseState(), tasks: [{ id: 'task', title: 'Original', attachmentIds: ['file'] }] });
  const replacement = structuredClone(original);
  replacement.tasks[0].title = 'Replacement';
  const file = { id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 3, blob: new Blob(['old'], { type: 'text/plain' }) };
  await Storage.attachments.put(file);
  const before = await Storage.captureUserData();
  let saved = JSON.stringify(original);
  global.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = String(value); }, removeItem() {} };
  await assert.rejects(() => Storage.restoreValidatedBackup({ state: replacement, attachmentRecords: [{ ...file, blob: new Blob(['new'], { type: 'text/plain' }) }], habitLogs: [], goalHistory: [] }, {
    failAfterNative: true,
    expected: before,
  }), /injected restore failure/i);
  assert.deepEqual(await Storage.captureUserData(), before);
  assert.equal(JSON.parse(saved).tasks[0].title, 'Original');
});

test('recovery-backed replacement keeps attachments and growing logs in sync on success', async () => {
  await Storage.clearAllForTests();
  const original = TodoCore.normalizeState({ ...baseState(), tasks: [{ id: 'task', title: 'Original', attachmentIds: ['file'] }] });
  const replacement = structuredClone(original);
  replacement.tasks[0].title = 'Replacement';
  const nextFile = { id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 3, blob: new Blob(['new'], { type: 'text/plain' }) };
  await Storage.attachments.put({ ...nextFile, blob: new Blob(['old'], { type: 'text/plain' }) });
  await Storage.habitLogs.put({ id: 'old-log', habitId: 'habit', date: '2026-09-22', status: 'done', value: null });
  await Storage.goalHistory.put({ id: 'old-history', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-22T10:00:00.000Z' });
  let saved = JSON.stringify(original);
  global.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = String(value); }, removeItem() {} };
  await Storage.restoreValidatedBackup({
    state: replacement,
    attachmentRecords: [nextFile],
    habitLogs: [{ id: 'new-log', habitId: 'habit', date: '2026-09-23', status: 'skipped', value: null }],
    goalHistory: [{ id: 'new-history', goalId: 'goal', type: 'statusChanged', data: {}, createdAt: '2026-09-23T10:00:00.000Z' }],
  }, { expected: await Storage.captureUserData() });
  assert.equal((await Storage.attachments.get('file')).blob.size, 3);
  assert.deepEqual((await Storage.habitLogs.listAll()).map(item => item.id), ['new-log']);
  assert.deepEqual((await Storage.goalHistory.listAll()).map(item => item.id), ['new-history']);
  assert.equal(JSON.parse(saved).tasks[0].title, 'Replacement');
});

test('stale canonical writes are rejected instead of overwriting a newer tab', async () => {
  const current = JSON.stringify(baseState());
  const newer = JSON.stringify({ ...baseState(), tasks: [{ id: 'new', title: 'Newer' }] });
  let saved = newer;
  global.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = String(value); }, removeItem() {} };
  await assert.rejects(() => Storage.writeCanonicalState(baseState(), current), /newer|stale|changed/i);
  assert.equal(saved, newer);
});
