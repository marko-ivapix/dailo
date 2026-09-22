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

async function withCorruptCentralCrc(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  for (let index = 0; index <= bytes.length - 20; index += 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x01 && bytes[index + 3] === 0x02) {
      bytes[index + 16] ^= 0xff;
      return new Blob([bytes]);
    }
  }
  throw new Error('Central ZIP entry not found');
}

test('backup preflight rejects an archive over the ZIP entry limit before extraction', async () => {
  const limits = { maxZipEntries: 2 };
  const payload = await zipWith({ 'data.json': JSON.stringify(manifest()), 'extra-a': 'a', 'extra-b': 'b' });
  const parsed = await JSZip.loadAsync(await payload.arrayBuffer());
  const compressedData = Object.getPrototypeOf(parsed.file('data.json')._data);
  const original = compressedData.getContentWorker;
  let extracted = 0;
  compressedData.getContentWorker = function (...args) { extracted += 1; return original.apply(this, args); };
  try { await assert.rejects(() => Backup.inspectBackupV3(payload, { limits }), /ZIP entry limit/i); }
  finally { compressedData.getContentWorker = original; }
  assert.equal(extracted, 0, 'entry data must not inflate before central-directory limits pass');
});

test('backup streams bounded entries without ZipObject.async and verifies their CRC32', async () => {
  const payload = await zipWith({ 'data.json': JSON.stringify(manifest()) });
  const parsed = await JSZip.loadAsync(await payload.arrayBuffer());
  const zipObject = Object.getPrototypeOf(parsed.file('data.json'));
  const originalAsync = zipObject.async;
  zipObject.async = () => { throw new Error('unbounded async extraction used'); };
  try {
    assert.equal((await Backup.inspectBackupV3(payload)).state.version, 3);
    await assert.rejects(() => Backup.inspectBackupV3(withCorruptCentralCrc(payload)), /CRC|corrupt/i);
  } finally { zipObject.async = originalAsync; }
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

test('automatic snapshots prune aggregate automatic bytes before inserting the new copy', async () => {
  await Storage.clearAllForTests();
  const state = baseState();
  localStorage.setItem('todoAppData', JSON.stringify(state));
  const old = {
    id: 'automatic-old', reason: 'automatic', phase: 'prepared', createdAt: '2026-09-22T09:00:00.000Z',
    rawAppData: JSON.stringify(state), appData: state, liveState: state,
    attachments: [], habitLogs: [], goalHistory: [], padding: 'x'.repeat(2000),
  };
  const safety = { id: 'safety', reason: 'restore', phase: 'prepared', createdAt: '2026-09-22T09:01:00.000Z', padding: 'y'.repeat(2000) };
  await Storage.recoverySnapshots.put(old);
  await Storage.recoverySnapshots.put(safety);
  const candidateLimit = 3000;
  const originalPut = Storage.recoverySnapshots.put;
  Storage.recoverySnapshots.put = async record => {
    if (record.reason === 'automatic') {
      const existingAutomaticBytes = (await Storage.recoverySnapshots.listAll())
        .filter(item => item.reason === 'automatic' && item.id !== record.id)
        .reduce((sum, item) => sum + Storage.estimateSnapshotBytes(item), 0);
      assert.ok(existingAutomaticBytes + Storage.estimateSnapshotBytes(record) <= candidateLimit,
        'aggregate automatic snapshot budget exceeded before insertion');
    }
    return originalPut(record);
  };
  try { await Storage.createAutomaticSnapshot(state, new Date('2026-09-22T10:00:00Z'), { maxBytes: candidateLimit }); }
  finally { Storage.recoverySnapshots.put = originalPut; }
  assert.ok(await Storage.recoverySnapshots.get('safety'), 'operation safety copy must not be pruned');
  assert.equal(await Storage.recoverySnapshots.get('automatic-old'), null);
});

test('failed automatic snapshot insertion restores automatic copies pruned for its budget', async () => {
  await Storage.clearAllForTests();
  const state = baseState();
  localStorage.setItem('todoAppData', JSON.stringify(state));
  const old = {
    id: 'automatic-old', reason: 'automatic', phase: 'prepared', createdAt: '2026-09-22T09:00:00.000Z',
    rawAppData: JSON.stringify(state), appData: state, liveState: state,
    attachments: [], habitLogs: [], goalHistory: [], padding: 'x'.repeat(2000),
  };
  const safety = { id: 'safety', reason: 'restore', phase: 'prepared', createdAt: '2026-09-22T09:01:00.000Z' };
  await Storage.recoverySnapshots.put(old);
  await Storage.recoverySnapshots.put(safety);
  const originalPut = Storage.recoverySnapshots.put;
  Storage.recoverySnapshots.put = async record => {
    if (record.reason === 'automatic' && record.id !== old.id) throw new Error('injected candidate write failure');
    return originalPut(record);
  };
  try {
    await assert.rejects(() => Storage.createAutomaticSnapshot(state, new Date('2026-09-22T10:00:00Z'), { maxBytes: 3000 }), /injected candidate/i);
  } finally { Storage.recoverySnapshots.put = originalPut; }
  assert.deepEqual(await Storage.recoverySnapshots.get(old.id), old);
  assert.ok(await Storage.recoverySnapshots.get(safety.id));
});

test('task, Goal and Habit timestamps share strict ISO validation while legacy knowledge dates may be empty', () => {
  const valid = '2026-09-22T10:00:00.000Z';
  const invalid = '2026-02-30T10:00:00.000Z';
  const entities = [
    ['tasks', { id: 'task', title: 'Task', areaId: null, goalIds: [], tagIds: [], attachmentIds: [], plannedTime: null, dueTime: null, createdAt: invalid, updatedAt: valid }],
    ['goals', { id: 'goal', title: 'Goal', areaId: null, taskIds: [], projectLinks: [], habitLinks: [], createdAt: invalid, updatedAt: valid }],
    ['habits', { id: 'habit', name: 'Habit', areaId: null, goalIds: [], createdAt: invalid, updatedAt: valid }],
  ];
  for (const [collection, entity] of entities) {
    const candidate = { ...baseState(), [collection]: [entity] };
    assert.throws(() => Backup.validateDomain(candidate, [], []), /timestamp/i, collection);
    assert.equal(TodoCore.validEntityTimestamps(entity), false, collection);
    assert.match(TodoCore.migrateStateV3(candidate).reason, /timestamp/i, collection);
  }
  assert.equal(TodoCore.isIsoTimestamp('2026-09-22T24:00:00.000Z'), false);
  assert.equal(TodoCore.isIsoTimestamp(''), false);
  const legacyKnowledge = {
    ...baseState(),
    notes: [{ id: 'note', title: 'Legacy', body: '', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], createdAt: '', updatedAt: '' }],
  };
  assert.doesNotThrow(() => Backup.validateDomain(legacyKnowledge, [], []));
  assert.equal(TodoCore.migrateStateV3(legacyKnowledge).ok, true);
});

test('Habit log compare-and-set refuses to overwrite a record changed after its read', async () => {
  await Storage.clearAllForTests();
  const original = { id: 'habit:2026-09-22', habitId: 'habit', date: '2026-09-22', status: 'done', value: null };
  const foreign = { ...original, status: 'skipped' };
  await Storage.habitLogs.put(original);
  await Storage.habitLogs.put(foreign);
  await assert.rejects(() => Storage.habitLogs.putIfCurrent({ ...original, status: 'missed' }, original), /changed|stale/i);
  assert.deepEqual(await Storage.habitLogs.get(original.id), foreign);
  await Storage.habitLogs.putIfCurrent({ ...foreign, status: 'missed' }, foreign);
  assert.equal((await Storage.habitLogs.get(original.id)).status, 'missed');
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

test('legacy restore wrapper delegates to the recovery-backed transaction', async () => {
  const original = Storage.restoreValidatedBackup;
  let delegated = null;
  Storage.restoreValidatedBackup = async value => { delegated = value; };
  const validated = { state: baseState(), attachmentRecords: [], habitLogs: [], goalHistory: [] };
  try { await Backup.restoreBackup(validated); } finally { Storage.restoreValidatedBackup = original; }
  assert.deepEqual(delegated, validated);
});

test('legacy restore wrapper validates before delegating', async () => {
  const original = Storage.restoreValidatedBackup;
  let delegated = false;
  Storage.restoreValidatedBackup = async () => { delegated = true; };
  const invalid = { state: { ...baseState(), tasks: [{ id: 'bad', title: '' }] }, attachmentRecords: [], habitLogs: [], goalHistory: [] };
  try { await assert.rejects(() => Backup.restoreBackup(invalid), /task/i); }
  finally { Storage.restoreValidatedBackup = original; }
  assert.equal(delegated, false);
});
