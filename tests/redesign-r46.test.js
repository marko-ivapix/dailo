// Redesign R46 (V2.1, data model): attachments sync — files in Supabase Storage, their metadata as "attachments" records.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r46-attachment-sync.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const { withI18n } = require('./support/i18n.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const clone = value => JSON.parse(JSON.stringify(value));
const base = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { weekStartsOn: 1 }, ...fields });
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, attachmentIds: [], updatedAt: '2026-10-12T08:00:00.000Z', ...fields });
const file = (id, owner, text = `contents of ${id}`) => ({ id, taskId: owner, fileName: `${id}.txt`, mimeType: 'text/plain', size: text.length, blob: new Blob([text], { type: 'text/plain' }), createdAt: '2026-10-12T08:00:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z', pendingDeleteUntil: null });

// One device: its state, its attachment store and the callbacks the app hands to the sync.
function device(fake, state, attachments = []) {
  const store = { state: clone(state), files: new Map(attachments.map(record => [record.id, record])), removed: [] };
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  const meta = {};
  const files = {
    async read(id) { return store.files.get(id)?.blob || null; },
    async store(data, blob) {
      const owner = store.state.tasks.find(item => item.id === data.ownerId);
      if (!owner) return false;
      store.files.set(data.id, { id: data.id, taskId: data.ownerId, fileName: data.fileName, mimeType: data.mimeType, size: blob.size, blob, createdAt: data.createdAt, updatedAt: data.updatedAt, pendingDeleteUntil: null });
      if (!owner.attachmentIds.includes(data.id)) owner.attachmentIds.push(data.id);
      return true;
    },
  };
  return {
    store, client, meta,
    async signIn(email) { meta.session = await client.signIn(email, 'tajna1234'); },
    sync(mode = null, withFiles = true) {
      return Sync.syncOnce({
        client, meta, mode, now: fake.now, files: withFiles ? files : null,
        readLocal: async () => ({ state: store.state, habitLogs: [], attachments: [...store.files.values()].filter(record => !record.pendingDeleteUntil) }),
        writeLocal: async result => { store.state = result.state; for (const id of result.fileDeletes || []) { store.files.delete(id); store.removed.push(id); } },
      });
    },
  };
}
async function pair(options = {}) {
  const fake = createFakeSupabase({ autoconfirm: true, ...options });
  await Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch }).signUp('ana@example.com', 'tajna1234');
  return fake;
}

test('the metadata record: owner, name, type, size and times, never the file itself', () => {
  const records = Sync.collectRecords(base({ tasks: [task('t1', { attachmentIds: ['a1'] })] }), [], undefined, [file('a1', 't1'), { ...file('n1', null), taskId: undefined, ownerType: 'note', ownerId: 'note1' }]);
  assert.deepEqual(records.get('attachments/a1'), { type: 'attachments', id: 'a1', data: { id: 'a1', ownerType: 'task', ownerId: 't1', fileName: 'a1.txt', mimeType: 'text/plain', size: 14, createdAt: '2026-10-12T08:00:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z' } });
  assert.equal(records.get('attachments/n1').data.ownerType, 'note');
  assert.equal(records.get('tasks/t1').data.attachmentIds, undefined, 'attachmentIds stay device-local');
  assert.equal(Sync.collectRecords(base(), []).size, 1, 'without attachments only the settings');
});

test('two devices: the file goes to Storage, its record to the table, and the other device downloads it', async () => {
  const fake = await pair();
  const phone = device(fake, base({ tasks: [task('t1', { attachmentIds: ['a1'] })] }), [file('a1', 't1', 'hello')]);
  const laptop = device(fake, base());
  await phone.signIn('ana@example.com');
  await laptop.signIn('ana@example.com');
  assert.equal((await phone.sync()).status, 'ok');
  const uid = phone.meta.session.user.id;
  assert.deepEqual(fake.filesOf(uid), [`${uid}/a1`]);
  assert.equal(await fake.fileText(`${uid}/a1`), 'hello');
  assert.equal((await laptop.sync('server')).status, 'ok');
  assert.deepEqual(laptop.store.state.tasks[0].attachmentIds, ['a1']);
  assert.equal(await laptop.store.files.get('a1').blob.text(), 'hello');
  assert.deepEqual(laptop.meta.pendingFiles, {});
  assert.equal((await laptop.sync()).pushed, 0, 'a downloaded file is not sent back');
  // Deleting it on the laptop removes the record, the file in Storage and the copy on the phone.
  laptop.store.files.delete('a1');
  laptop.store.state.tasks[0].attachmentIds = [];
  assert.equal((await laptop.sync()).status, 'ok');
  assert.deepEqual(fake.filesOf(uid), []);
  await phone.sync();
  assert.deepEqual([phone.store.removed, phone.store.state.tasks[0].attachmentIds], [['a1'], []]);
});

test('a download that fails stays pending (and counts as present) until it works', async () => {
  const fake = await pair();
  const phone = device(fake, base({ tasks: [task('t1', { attachmentIds: ['a1'] })] }), [file('a1', 't1')]);
  const laptop = device(fake, base());
  await phone.signIn('ana@example.com'); await laptop.signIn('ana@example.com');
  await phone.sync();
  fake.failDownloads(1);
  const result = await laptop.sync('server');
  assert.equal(result.status, 'ok');
  assert.deepEqual(Object.keys(laptop.meta.pendingFiles), ['a1']);
  assert.equal(laptop.meta.fileError, 'Server error: download failed');
  const again = await laptop.sync();
  assert.equal(again.pushed, 0, 'no deletion is sent for a file still on its way');
  assert.deepEqual(laptop.meta.pendingFiles, {});
  assert.equal(laptop.meta.fileError, undefined);
  assert.ok(laptop.store.files.has('a1'));
});

test('a server without 0003_attachments.sql syncs everything else and keeps the files on the device', async () => {
  const fake = await pair({ files: false });
  const phone = device(fake, base({ tasks: [task('t1', { attachmentIds: ['a1'] })] }), [file('a1', 't1')]);
  await phone.signIn('ana@example.com');
  const result = await phone.sync();
  assert.equal(result.status, 'ok');
  assert.deepEqual(fake.rowsFor('ana@example.com').map(row => row.type).sort(), ['settings', 'tasks']);
  assert.equal(Object.keys(phone.meta.shadow).some(key => key.startsWith('attachments/')), false);
  assert.equal(phone.meta.fileError, 'The server has no place for attachments yet. Run 0003_attachments.sql in Supabase.', 'Nalog names the missing migration');
  // An app that hands over no files (older harness) does the same.
  const plain = device(await pair(), base({ tasks: [task('t2')] }), [file('a2', 't2')]);
  await plain.signIn('ana@example.com');
  assert.equal((await plain.sync(null, false)).status, 'ok');
});

test('a file the server refuses is not recorded; the others go on', async () => {
  const fake = await pair({ maxFileBytes: 8 });
  const phone = device(fake, base({ tasks: [task('t1', { attachmentIds: ['big', 'ok'] })] }), [file('big', 't1', 'far too large'), file('ok', 't1', 'tiny')]);
  await phone.signIn('ana@example.com');
  const result = await phone.sync();
  assert.equal(result.status, 'ok');
  const types = fake.rowsFor('ana@example.com').filter(row => row.type === 'attachments').map(row => row.id);
  assert.deepEqual(types, ['ok']);
  assert.equal(phone.meta.fileError, 'The file is larger than the server allows.');
  assert.equal(phone.meta.shadow['attachments/big'], undefined, 'tried again next time');
});

test('deleting the account removes the files first; a pulled record with an unsafe id is ignored', async () => {
  const fake = await pair();
  const phone = device(fake, base({ tasks: [task('t1', { attachmentIds: ['a1'] })] }), [file('a1', 't1')]);
  await phone.signIn('ana@example.com');
  await phone.sync();
  const uid = phone.meta.session.user.id;
  await phone.client.deleteAccount(phone.meta.session);
  assert.deepEqual(fake.filesOf(uid), []);
  assert.equal(Sync.safeAttachmentData({ id: '../x', ownerType: 'task', ownerId: 't', fileName: 'x', mimeType: 'text/plain', size: 1 }), null);
  assert.equal(Sync.safeAttachmentData({ id: 'a', ownerType: 'goal', ownerId: 't', fileName: 'x', mimeType: 'text/plain', size: 1 }), null);
  assert.equal(Sync.safeAttachmentData({ id: 'a', ownerType: 'task', ownerId: 't', fileName: 'x', mimeType: 'text/plain', size: 11 * 1024 * 1024 }), null);
  assert.ok(Sync.safeAttachmentData({ id: 'att_1-x', ownerType: 'resource', ownerId: 'r', fileName: 'x.pdf', mimeType: 'application/pdf', size: 10 }));
});

test('the migration: the record type, a private 10 MB bucket and per-user folders', () => {
  const sql = read('supabase/migrations/0003_attachments.sql');
  assert.match(sql, /check \(type in \('tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'settings', 'habitLogs', 'journal', 'attachments'\)\)/);
  assert.match(sql, /insert into storage\.buckets \(id, name, public, file_size_limit\)\s+values \('attachments', 'attachments', false, 10485760\)/);
  for (const action of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`for ${action} to authenticated`), action);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
});

test('the app hands its attachments to the sync and stores downloaded ones under their owner', async () => {
  assert.match(app, /readLocal: async \(\) => \{ const habitLogs = await TodoStorage\.habitLogs\.listAll\(\); return \{ state, habitLogs, attachments: await syncAttachmentList\(\) \}; \},/);
  assert.match(app, /writeLocal: applySyncResult,\n\s+files: syncFiles,/);
  assert.match(app, /if \(result\.fileDeletes\?\.length\) await TodoStorage\.attachments\.deleteMany\(result\.fileDeletes\);/);
  // syncFiles.store puts the file in IndexedDB and adds it to the owner's attachmentIds.
  const start = app.indexOf('  // R46: what the sync needs of this device\'s attachments');
  assert.ok(start > 0);
  const end = app.indexOf('\n  };\n', start) + 5;
  const puts = [];
  const owner = { id: 't1', attachmentIds: [] };
  const context = withI18n({
    Core: {}, state: { tasks: [owner] }, recovery: null, globalOperation: null, saves: 0, MAX_ATTACHMENTS_PER_TASK: 10,
    syncWaiting: () => false, saveState() { context.saves += 1; return true; }, knowledgeAttachmentCache: new Map(),
    attachmentOwner: ({ ownerType, ownerId }) => (ownerType === 'task' && ownerId === 't1' ? { type: 'task', item: owner } : null),
    TodoStorage: { attachments: { put: async record => { puts.push(record); return record; }, get: async () => ({ blob: 'B', pendingDeleteUntil: null }), listAll: async () => [] } },
  });
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  context.syncFiles = vm.runInContext('syncFiles', context);
  const blob = new Blob(['x']);
  assert.equal(await context.syncFiles.store({ id: 'a1', ownerType: 'task', ownerId: 't1', fileName: 'a.txt', mimeType: 'text/plain', size: 1, createdAt: 'c', updatedAt: 'u' }, blob), true);
  assert.deepEqual([puts[0].id, puts[0].taskId, puts[0].fileName, [...owner.attachmentIds], context.saves], ['a1', 't1', 'a.txt', ['a1'], 1]);
  assert.equal(puts[0].blob, blob);
  assert.equal(await context.syncFiles.store({ id: 'a2', ownerType: 'task', ownerId: 'gone' }, blob), false, 'an owner that has not arrived yet waits');
  assert.equal(await context.syncFiles.read('a1'), 'B');
});

test('Nalog and the pages say that attachments sync now', () => {
  const settings = read('js/settings-ui.js');
  assert.ok(settings.includes("tr('Tasks, projects, goals, habits, notes, attachments and settings sync between your devices.')"));
  assert.ok(!settings.includes('Attachments stay on the device where they were added.'));
  assert.match(read('privatnost.html'), /Prilozi \(fajlovi\) se sinhronizuju/);
  for (const [en, value] of [['The file is larger than the server allows.', 'Fajl je veći nego što server dozvoljava.'], ['The server has no place for attachments yet. Run 0003_attachments.sql in Supabase.', 'Server još nema mesta za priloge. U Supabase-u pokreni 0003_attachments.sql.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R46 is released as 2.0.0-alpha.72', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.72');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.72';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.72');
});
