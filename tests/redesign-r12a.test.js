// Redesign R12a: the journal collection and its reminder setting (data model, no UI).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r12a-journal-data.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const Sync = require('../js/sync.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const stamp = '2026-10-10T20:00:00.000Z';
const entry = (date, fields = {}) => ({ id: `journal_${date}`, date, text: 'A good day.', mood: 4, createdAt: stamp, updatedAt: stamp, ...fields });
const v3 = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {}, ...fields });

test('the id is the day, lookups find a day, and the reminder time defaults to 20:00', () => {
  assert.equal(Core.journalEntryId('2026-10-10'), 'journal_2026-10-10');
  const state = Core.normalizeState(v3({ journal: [entry('2026-10-09'), entry('2026-10-10')] }));
  assert.equal(Core.journalEntryFor(state, '2026-10-10').text, 'A good day.');
  assert.equal(Core.journalEntryFor(state, '2026-10-11'), null);
  assert.equal(Core.journalReminderTime({}), '20:00');
  assert.equal(Core.journalReminderTime({ journalReminderTime: '21:00' }), '21:00');
  assert.equal(Core.journalReminderTime({ journalReminderTime: null }), null, 'off');
  assert.equal(Core.journalReminderTime({ journalReminderTime: '25:00' }), '20:00', 'a bad value falls back');
});

test('normalization adds the journal to older data and fills defaults; a bad journal goes to recovery', () => {
  assert.deepEqual(plain(Core.normalizeState(v3()).journal), [], 'older data gains an empty journal');
  const [normalized] = Core.normalizeState(v3({ journal: [{ id: 'journal_2026-10-10', date: '2026-10-10', mood: 9, createdAt: stamp, updatedAt: stamp }] })).journal;
  assert.deepEqual(plain(normalized), { id: 'journal_2026-10-10', date: '2026-10-10', text: '', mood: null, createdAt: stamp, updatedAt: stamp });
  const migrate = input => Core.migrateStateV3(input);
  assert.equal(migrate(v3({ journal: [entry('2026-10-10')] })).ok, true);
  for (const journal of [{}, [{ date: '2026-10-10' }], [entry('2026-13-40')], [entry('2026-10-10'), entry('2026-10-10', { id: 'journal_2026-10-10b' })]]) {
    const result = migrate(v3({ journal }));
    assert.deepEqual([result.ok, result.reason], [false, 'invalid-journal'], JSON.stringify(journal));
  }
});

test('backups accept the journal and the reminder time, reject bad values, and older backups still validate', () => {
  const state = fields => Core.normalizeState(v3(fields));
  assert.doesNotThrow(() => Backup.validateDomain(state({ journal: [entry('2026-10-09'), entry('2026-10-10', { mood: null, text: '' })], settings: { journalReminderTime: '19:00' } }), [], []));
  assert.doesNotThrow(() => Backup.validateDomain(state({ settings: { journalReminderTime: null } }), [], []));
  const older = state({});
  delete older.journal;
  assert.doesNotThrow(() => Backup.validateDomain(older, [], []), 'a backup made before R12a');
  for (const [journal, settings] of [
    [[entry('2026-10-10', { date: '2026-02-30', id: 'journal_2026-02-30' })], {}],
    [[entry('2026-10-10'), entry('2026-10-10')], {}],
    [[entry('2026-10-10', { id: 'note-1' })], {}],
    [[entry('2026-10-10', { text: 7 })], {}],
    [[entry('2026-10-10', { mood: 6 })], {}],
    [[entry('2026-10-10', { mood: 2.5 })], {}],
    [[entry('2026-10-10', { updatedAt: 'yesterday' })], {}],
    [[], { journalReminderTime: '25:00' }],
    ['not a list', {}],
  ]) {
    const raw = state({});
    raw.journal = journal; raw.settings = { ...raw.settings, ...settings };
    assert.throws(() => Backup.validateDomain(raw, [], []), /journal|Invalid backup/, JSON.stringify([journal, settings]));
  }
});

test('sync carries a journal entry between devices as one record per day', async () => {
  const fake = createFakeSupabase();
  const make = state => {
    const store = { state: plain(state), habitLogs: [] }, meta = {};
    const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
    return {
      store,
      async signIn() { await client.requestCode('ana@example.com'); meta.session = await client.verifyCode('ana@example.com', '123456'); },
      sync: () => Sync.syncOnce({ client, meta, now: fake.now, readLocal: async () => ({ state: store.state, habitLogs: store.habitLogs }), writeLocal: async result => { store.state = result.state; } }),
    };
  };
  const phone = make(v3({ journal: [entry('2026-10-10')] })), mac = make(v3({ journal: [] }));
  await phone.signIn(); assert.equal((await phone.sync()).status, 'ok');
  await mac.signIn(); assert.equal((await mac.sync()).status, 'ok');
  assert.deepEqual(plain(mac.store.state.journal), [entry('2026-10-10')]);
  assert.ok(fake.rowsFor('ana@example.com').some(row => row.type === 'journal' && row.id === 'journal_2026-10-10'));
  mac.store.state.journal[0] = { ...mac.store.state.journal[0], text: 'Edited on the Mac', updatedAt: '2026-10-10T21:00:00.000Z' };
  await mac.sync(); await phone.sync();
  assert.equal(phone.store.state.journal[0].text, 'Edited on the Mac');
  assert.match(read('js/sync.js'), /const COLLECTIONS = \[[^\]]*'journal'\]/);
});

test('the server migration adds the journal type and the setup guide lists it', () => {
  const migration = read('supabase/migrations/0002_journal.sql');
  assert.match(migration, /alter table public\.records drop constraint if exists records_type_check;/);
  assert.match(migration, /alter table public\.records add constraint records_type_check check \(type in \('tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'settings', 'habitLogs', 'journal'\)\);/);
  assert.match(read('docs/v2/podesavanje-supabase.md'), /supabase\/migrations\/0002_journal\.sql/);
});

test('the journal is part of the delete-safety fingerprint, not of Search', () => {
  const app = read('js/app.js');
  assert.match(app, /function undoDomain\(\) \{\n    return JSON\.stringify\(Object\.fromEntries\(\['tasks','projects','tags','areas','goals','habits','notes','resources','templates','savedViews','journal'\]/);
  assert.equal(Core.searchItems.length, 3, 'Search takes tasks, projects and the query only');
});

test('R12a shipped as 2.0.0-alpha.31 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 31);
});
