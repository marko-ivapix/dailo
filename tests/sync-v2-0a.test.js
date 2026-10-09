const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const Sync = require('../js/sync.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, attachmentIds: [], updatedAt: '2026-10-08T09:00:00.000Z', ...fields });
const baseState = (fields = {}) => ({
  version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [],
  settings: { weekStartsOn: 1, compactDensity: true, backupStatus: { lastExport: '2026-10-01T10:00:00.000Z' } }, ui: { calendarView: 'week' }, ...fields,
});

function device(fake, state = baseState(), habitLogs = [], options = {}) {
  const store = { state: clone(state), habitLogs: clone(habitLogs) };
  const meta = {};
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now, ...options });
  return {
    store, meta, client,
    async signIn(email) { await client.requestCode(email); meta.session = await client.verifyCode(email, '123456'); },
    sync(mode) {
      return Sync.syncOnce({
        client, meta, mode, now: fake.now,
        readLocal: async () => ({ state: store.state, habitLogs: store.habitLogs }),
        writeLocal: async result => {
          store.state = result.state;
          store.habitLogs = store.habitLogs.filter(log => !result.habitLogDeletes.includes(log.id));
          for (const log of result.habitLogPuts) store.habitLogs = [...store.habitLogs.filter(item => item.id !== log.id), log];
        },
      });
    },
  };
}

test('collectRecords sends collections, shared settings and habit logs, never attachments or device-only data', () => {
  const state = baseState({ tasks: [task('t1', { attachmentIds: ['f1'] })], notes: [{ id: 'n1', title: 'N', attachmentIds: ['f2'], linkUrls: ['https://x.y'] }] });
  const records = Sync.collectRecords(state, [{ id: 'l1', habitId: 'h1', date: '2026-10-08', status: 'done' }]);
  assert.deepEqual([...records.keys()].sort(), ['habitLogs/l1', 'notes/n1', 'settings/settings', 'tasks/t1']);
  assert.equal('attachmentIds' in records.get('tasks/t1').data, false);
  assert.equal('attachmentIds' in records.get('notes/n1').data, false);
  assert.deepEqual(records.get('settings/settings').data, { weekStartsOn: 1 });
  assert.equal(Sync.hashRecord({ a: 1, b: [1, 2] }), Sync.hashRecord({ b: [1, 2], a: 1 }), 'hashes ignore key order');
  assert.notEqual(Sync.hashRecord({ a: 1 }), Sync.hashRecord({ a: 2 }));
});

test('diffRecords finds new, changed and removed records against the shadow', () => {
  const before = Sync.collectRecords(baseState({ tasks: [task('a'), task('b')] }));
  const shadow = Object.fromEntries([...before].map(([key, record]) => [key, Sync.hashRecord(record.data)]));
  const after = Sync.collectRecords(baseState({ tasks: [task('a', { title: 'A2' }), task('c')] }));
  const diff = Sync.diffRecords(after, shadow);
  assert.deepEqual(diff.upserts.map(record => `${record.type}/${record.id}`).sort(), ['tasks/a', 'tasks/c']);
  assert.deepEqual(diff.deletes.map(record => `${record.type}/${record.id}`), ['tasks/b']);
});

test('applyRemote keeps local attachments and device settings, removes tombstones and resolves same-day habit logs', () => {
  const state = baseState({ tasks: [task('t1', { attachmentIds: ['f1'] }), task('gone')] });
  const logs = [{ id: 'local-log', habitId: 'h1', date: '2026-10-08', status: 'done' }];
  const result = Sync.applyRemote(state, logs, [
    { type: 'tasks', id: 't1', data: { id: 't1', title: 'Remote title', isCompleted: false }, deleted: false, updated_at: '2026-10-08T10:00:00.010Z' },
    { type: 'tasks', id: 'new', data: { id: 'new', title: 'New' }, deleted: false, updated_at: '2026-10-08T10:00:00.020Z' },
    { type: 'tasks', id: 'gone', data: null, deleted: true, updated_at: '2026-10-08T10:00:00.030Z' },
    { type: 'settings', id: 'settings', data: { weekStartsOn: 0 }, deleted: false, updated_at: '2026-10-08T10:00:00.040Z' },
    { type: 'habitLogs', id: 'remote-log', data: { id: 'remote-log', habitId: 'h1', date: '2026-10-08', status: 'skipped' }, deleted: false, updated_at: '2026-10-08T10:00:00.050Z' },
  ]);
  assert.deepEqual(result.state.tasks.map(item => [item.id, item.title, item.attachmentIds]), [['t1', 'Remote title', ['f1']], ['new', 'New', []]]);
  assert.deepEqual(result.state.settings, { weekStartsOn: 0, compactDensity: true, backupStatus: { lastExport: '2026-10-01T10:00:00.000Z' } });
  assert.deepEqual(result.state.ui, { calendarView: 'week' });
  assert.deepEqual(result.habitLogDeletes, ['local-log']);
  assert.deepEqual(result.habitLogPuts.map(log => log.id), ['remote-log']);
  assert.equal(result.changed, true);
  assert.equal(state.tasks[0].title, 't1', 'the input state is not mutated');
  const same = Sync.applyRemote(result.state, [], [{ type: 'tasks', id: 'new', data: { id: 'new', title: 'New' }, deleted: false, updated_at: '2026-10-08T10:00:01.000Z' }]);
  assert.equal(same.changed, false, 'identical rows change nothing');
});

test('e-mail one-time code sign-in, wrong codes, refresh of an expired session and sign-out', async () => {
  const fake = createFakeSupabase();
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  await assert.rejects(client.requestCode('not-an-email'), error => error instanceof Sync.SyncError && /invalid format/.test(error.message));
  await client.requestCode('ana@example.com');
  assert.deepEqual(fake.sentCodes, [{ email: 'ana@example.com', code: '123456' }]);
  await assert.rejects(client.verifyCode('ana@example.com', '000000'), /invalid/i);
  await client.requestCode('ana@example.com');
  const session = await client.verifyCode('ana@example.com', '123456');
  assert.equal(session.user.email, 'ana@example.com');
  assert.ok(session.expiresAt > fake.now());
  fake.advance(3600 * 1000 + 1);
  const fresh = await client.ensureSession(session);
  assert.notEqual(fresh.accessToken, session.accessToken, 'an expiring session is refreshed');
  await client.signOut(fresh);
  await assert.rejects(client.pull(fresh, null), error => error.status === 401);
});

test('two devices converge: create, edit, delete; attachments and device settings stay local', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, baseState({ tasks: [task('t1', { attachmentIds: ['photo'] })] }));
  const mac = device(fake, baseState({ settings: { weekStartsOn: 1, compactDensity: false } }));
  await phone.signIn('ana@example.com');
  assert.equal((await phone.sync()).status, 'ok');
  await mac.signIn('ana@example.com');
  assert.equal((await mac.sync()).status, 'ok', 'an empty device merges without asking');
  assert.deepEqual(mac.store.state.tasks.map(item => [item.id, item.attachmentIds]), [['t1', []]]);
  assert.equal(mac.store.state.settings.compactDensity, false, 'device-only settings are not overwritten');

  mac.store.state.tasks[0].title = 'Edited on Mac';
  mac.store.state.tasks.push(task('t2'));
  await mac.sync();
  await phone.sync();
  assert.deepEqual(phone.store.state.tasks.map(item => [item.id, item.title, item.attachmentIds]), [['t1', 'Edited on Mac', ['photo']], ['t2', 't2', []]]);

  phone.store.state.tasks = phone.store.state.tasks.filter(item => item.id !== 't2');
  await phone.sync();
  await mac.sync();
  assert.deepEqual(mac.store.state.tasks.map(item => item.id), ['t1']);
  assert.ok(fake.rowsFor('ana@example.com').some(row => row.type === 'tasks' && row.id === 't2' && row.deleted && row.data === null));
  assert.ok(fake.rowsFor('ana@example.com').every(row => row.type !== 'tasks' || row.deleted || !('attachmentIds' in row.data)));
});

test('the last write wins and the replaced version stays in the server history', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, baseState({ tasks: [task('t1')] }));
  const mac = device(fake);
  await phone.signIn('ana@example.com'); await phone.sync();
  await mac.signIn('ana@example.com'); await mac.sync();
  phone.store.state.tasks[0].title = 'Phone version';
  mac.store.state.tasks[0].title = 'Mac version';
  await phone.sync();
  await mac.sync();
  await phone.sync();
  assert.equal(phone.store.state.tasks[0].title, 'Mac version');
  assert.equal(mac.store.state.tasks[0].title, 'Mac version');
  assert.ok(fake.history.some(row => row.data?.title === 'Phone version'));
});

test('habit logs for the same habit and day converge to one log on both devices', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, baseState({ habits: [{ id: 'h1', name: 'Walk', status: 'active' }] }), [{ id: 'log-phone', habitId: 'h1', date: '2026-10-08', status: 'done' }]);
  const mac = device(fake, baseState(), []);
  await phone.signIn('ana@example.com'); await phone.sync();
  await mac.signIn('ana@example.com'); await mac.sync();
  mac.store.habitLogs = [{ id: 'log-mac', habitId: 'h1', date: '2026-10-09', status: 'done' }, ...mac.store.habitLogs];
  phone.store.habitLogs.push({ id: 'log-phone-2', habitId: 'h1', date: '2026-10-09', status: 'skipped' });
  for (let round = 0; round < 3; round += 1) { await phone.sync(); await mac.sync(); }
  const day = logs => logs.filter(log => log.date === '2026-10-09');
  assert.equal(day(phone.store.habitLogs).length, 1);
  assert.deepEqual(day(phone.store.habitLogs), day(mac.store.habitLogs));
  assert.equal(phone.store.habitLogs.filter(log => log.date === '2026-10-08').length, 1);
});

test('first sign-in with data on both sides asks, then merges, keeps the server or keeps the device', async () => {
  for (const [mode, expected] of [['merge', ['local', 'remote']], ['server', ['remote']], ['device', ['local']]]) {
    const fake = createFakeSupabase();
    const first = device(fake, baseState({ tasks: [task('remote')] }));
    await first.signIn('ana@example.com'); await first.sync();
    const second = device(fake, baseState({ tasks: [task('local')] }));
    await second.signIn('ana@example.com');
    const asked = await second.sync();
    assert.equal(asked.status, 'choose', mode);
    assert.deepEqual(second.store.state.tasks.map(item => item.id), ['local'], 'nothing changes before the choice');
    assert.equal((await second.sync(mode)).status, 'ok');
    assert.deepEqual(second.store.state.tasks.map(item => item.id).sort(), expected, mode);
    await first.sync();
    assert.deepEqual(first.store.state.tasks.map(item => item.id).sort(), expected, `${mode} reaches the other device`);
  }
});

test('merging on first sign-in keeps the newer version of a record that exists on both sides', async () => {
  const fake = createFakeSupabase();
  const first = device(fake, baseState({ tasks: [task('a', { title: 'server newer', updatedAt: '2026-10-08T12:00:00.000Z' }), task('b', { title: 'server older', updatedAt: '2026-10-08T08:00:00.000Z' })] }));
  await first.signIn('ana@example.com'); await first.sync();
  const second = device(fake, baseState({ tasks: [task('a', { title: 'device older', updatedAt: '2026-10-08T10:00:00.000Z' }), task('b', { title: 'device newer', updatedAt: '2026-10-08T10:00:00.000Z' })] }));
  await second.signIn('ana@example.com');
  assert.equal((await second.sync('merge')).status, 'ok');
  const titles = store => Object.fromEntries(store.state.tasks.map(item => [item.id, item.title]));
  assert.deepEqual(titles(second.store), { a: 'server newer', b: 'device newer' });
  await first.sync();
  assert.deepEqual(titles(first.store), { a: 'server newer', b: 'device newer' }, 'both devices keep the newer versions');
});

test('a session that can no longer be refreshed is reported as expired', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, baseState({ tasks: [task('t1')] }));
  await phone.signIn('ana@example.com');
  const stale = { ...phone.meta.session, refreshToken: 'revoked', expiresAt: 0 };
  await assert.rejects(phone.client.ensureSession(stale), error => error instanceof Sync.SyncError && error.status === 401 && /Session expired/.test(error.message));
  phone.meta.session = stale;
  const result = await phone.sync();
  assert.equal(result.status, 'error');
  assert.equal(result.code, 401);
});

test('pulls are paged, errors are reported without losing the pending changes, and accounts can be deleted', async () => {
  const fake = createFakeSupabase();
  const many = baseState({ tasks: Array.from({ length: 7 }, (_, index) => task(`t${index}`)) });
  const phone = device(fake, many, [], { pageSize: 2 });
  await phone.signIn('ana@example.com'); await phone.sync();
  const mac = device(fake, baseState(), [], { pageSize: 2 });
  await mac.signIn('ana@example.com'); await mac.sync();
  assert.equal(mac.store.state.tasks.length, 7);

  phone.store.state.tasks.push(task('offline'));
  const offline = Sync.syncOnce({ client: Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: async () => { throw new TypeError('Failed to fetch'); }, now: fake.now }), meta: phone.meta, now: fake.now,
    readLocal: async () => ({ state: phone.store.state, habitLogs: [] }), writeLocal: async () => { throw new Error('must not write'); } });
  const result = await offline;
  assert.equal(result.status, 'error');
  assert.match(result.error, /Failed to fetch/);
  await phone.sync();
  await mac.sync();
  assert.ok(mac.store.state.tasks.some(item => item.id === 'offline'), 'the change waits for the next successful sync');

  await phone.client.deleteAccount(phone.meta.session);
  assert.equal(fake.hasUser('ana@example.com'), false);
  assert.deepEqual(fake.rowsFor('ana@example.com'), []);
});

test('the server schema keeps rows private, stamps server time, keeps history and allows account deletion', () => {
  const sql = read('supabase/migrations/0001_sync.sql');
  for (const pattern of [
    /alter table public\.records enable row level security;/,
    /alter table public\.record_history enable row level security;/,
    /create policy "records are private" on public\.records\s+for all to authenticated\s+using \(user_id = auth\.uid\(\)\)\s+with check \(user_id = auth\.uid\(\)\);/,
    /new\.updated_at := clock_timestamp\(\);/,
    /create trigger records_touch before insert or update on public\.records/,
    /create trigger records_history after update on public\.records/,
    /create or replace function public\.delete_my_account\(\) returns void\s+language plpgsql\s+security definer\s+set search_path = public/,
    /revoke all on function public\.delete_my_account\(\) from public, anon;\s+grant execute on function public\.delete_my_account\(\) to authenticated;/,
    /revoke all on public\.records from anon;/,
  ]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /service_role|eyJ[a-zA-Z0-9]/, 'no keys in the repository');
});
