// R58: fixes from the 2026-10-12 security review and the missing parts of the privacy policy and the terms.
// Spec: docs/superpowers/specs/2026-10-12-r58-security-fixes.md · review: docs/superpowers/specs/2026-10-12-security-review.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const ITER = 1000;
const stamp = '2026-10-10T20:00:00.000Z';
const entry = (date, fields = {}) => ({ id: `journal_${date}`, date, text: 'A good day.', mood: 4, createdAt: stamp, updatedAt: stamp, ...fields });
const v3 = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {}, ...fields });

function device(fake, state, options = {}) {
  const store = { state: plain(state), habitLogs: [] };
  const meta = {};
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  const self = {
    store, meta, client, journal: { key: options.key || null, locked: Boolean(options.locked) },
    async signIn() { await client.requestCode('ana@example.com'); meta.session = await client.verifyCode('ana@example.com', '123456'); },
    sync: (mode = null) => Sync.syncOnce({ client, meta, mode, now: fake.now, journal: self.journal, readLocal: async () => ({ state: store.state, habitLogs: store.habitLogs }), writeLocal: async result => { store.state = result.state; } }),
  };
  return self;
}
const serverRow = (fake, id) => fake.rowsFor('ana@example.com').find(row => row.type === 'journal' && row.id === id);

test('finding 2: a readable journal row that reaches a device with the key goes back sealed in the same round', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const phone = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Šifrovano' })], settings: { journalCipher: cipher } }), { key });
  await phone.signIn(); await phone.sync();
  delete phone.meta.purgeJournalHistory;
  // An older device that has not pulled the cipher yet edits the entry and pushes it readable.
  const oldApp = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Izmenjeno na starom telefonu', updatedAt: '2026-10-11T08:00:00.000Z' })] }));
  await oldApp.signIn(); await oldApp.sync('device');
  assert.match(JSON.stringify(serverRow(fake, 'journal_2026-10-10').data), /starom telefonu/);
  assert.equal((await phone.sync()).status, 'ok');
  assert.equal(phone.store.state.journal[0].text, 'Izmenjeno na starom telefonu', 'the device keeps the newer entry');
  assert.ok(serverRow(fake, 'journal_2026-10-10').data.sealed, 'the server row is sealed again');
  assert.equal(phone.meta.purgeJournalHistory, true, 'the history purge runs after this round');
  await phone.client.purgeJournalHistory(phone.meta.session);
  assert.ok(!fake.history.some(item => item.type === 'journal'));
  assert.equal((await phone.sync()).pushed, 0, 'nothing left to re-seal');
});

test('finding 2: a first sync that takes the server copy still re-seals readable journal rows on the next round', async () => {
  const fake = createFakeSupabase();
  const oldApp = device(fake, v3({ journal: [entry('2026-10-09', { text: 'Staro' })] }));
  await oldApp.signIn(); await oldApp.sync();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const phone = device(fake, v3({ settings: { journalCipher: cipher } }), { key });
  await phone.signIn();
  assert.equal((await phone.sync('server')).status, 'ok');
  assert.ok(!Object.keys(phone.meta.shadow).includes('journal/journal_2026-10-09'), 'not marked as already on the server');
  await phone.sync();
  assert.ok(serverRow(fake, 'journal_2026-10-09').data.sealed);
});

test('finding 3: the goal unit is escaped in the progress sheet', () => {
  assert.match(functionSource('progressSheetHtml').source, /const unit = goal\.unit \? ` \$\{ctx\.esc\(goal\.unit\)\}` : '';/);
});

test('finding 4: Realtime listens to an opaque per-account table, not to records', () => {
  const sockets = [];
  class FakeSocket { constructor(url) { this.url = url; this.sent = []; sockets.push(this); } send(text) { this.sent.push(JSON.parse(text)); } close() {} }
  FakeSocket.OPEN = 1;
  const live = Sync.createRealtime({ url: 'https://abc.supabase.co', key: 'k', WebSocket: FakeSocket, timers: { setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {} }, onChange() {} });
  live.connect({ accessToken: 't', user: { id: 'user-1' } });
  sockets[0].readyState = 1; sockets[0].onopen();
  assert.deepEqual(sockets[0].sent[0].payload.config.postgres_changes, [{ event: '*', schema: 'public', table: 'record_pokes', filter: 'user_id=eq.user-1' }]);
  const sql = read('supabase/migrations/0006_security.sql');
  assert.match(sql, /create table if not exists public\.record_pokes \(\n\s+id uuid primary key default gen_random_uuid\(\),\n\s+user_id uuid not null unique references auth\.users \(id\) on delete cascade,/);
  assert.match(sql, /alter table public\.record_pokes enable row level security;/);
  assert.match(sql, /for select to authenticated\n\s+using \(user_id = auth\.uid\(\)\);/);
  assert.match(sql, /revoke all on public\.record_pokes from anon;/);
  for (const event of ['insert', 'update']) assert.match(sql, new RegExp(`create trigger records_poke_${event} after ${event} on public\\.records\\n\\s+referencing new table as changed\\n\\s+for each statement execute function public\\.poke_record_owner\\(\\);`), `one poke per ${event} statement`);
  assert.match(sql, /select owners\.user_id, clock_timestamp\(\) from \(select distinct user_id from changed\) as owners/);
  assert.match(sql, /alter publication supabase_realtime drop table public\.records;/);
  assert.match(sql, /alter publication supabase_realtime add table public\.record_pokes;/);
});

test('findings 8 and 9: a size cap on records, a 90-day history, anon off the journal purge', () => {
  const sql = read('supabase/migrations/0006_security.sql');
  assert.match(sql, /add constraint records_data_size check \(data is null or pg_column_size\(data\) <= 262144\) not valid;/);
  assert.match(sql, /delete from public\.record_history where user_id = old\.user_id and replaced_at < clock_timestamp\(\) - interval '90 days';/);
  assert.match(sql, /revoke all on function public\.purge_journal_history\(\) from anon;/);
  assert.match(sql, /revoke all on function public\.poke_record_owner\(\) from public, anon, authenticated;/);
  assert.equal(Sync.serverMessage(400, '23514', 'new row for relation "records" violates check constraint "records_data_size"'), 'One item is too large to sync (at most 256 KB). Shorten it, or keep it on this device.');
  const guide = read('docs/v2/podesavanje-supabase.md');
  assert.match(guide, /0006_security\.sql/);
});

test('finding 5: ?shortcut= opens only the three shortcuts; dailo://auth counts only while a sign-in is pending', () => {
  const calls = [];
  const run = search => {
    const context = { location: { search, pathname: '/dailo/', hash: '' }, history: { replaceState() {} }, URLSearchParams, handleIncomingLink: href => calls.push(href) };
    vm.createContext(context);
    vm.runInContext(functionSource('consumeLaunchParams').source, context);
    context.consumeLaunchParams();
  };
  for (const search of ['?shortcut=new-task', '?shortcut=today', '?shortcut=journal', '?shortcut=auth%3Ferror%3DLa%C5%BEna', '?shortcut=habit-done%3Fid%3Dx', '?shortcut=share%3Ftext%3Dx']) run(search);
  assert.deepEqual(calls, ['dailo://new-task', 'dailo://today', 'dailo://journal']);
  assert.match(functionSource('handleIncomingLink').source, /if \(target === 'auth'\) \{ if \(!loadSyncMeta\(\)\.pkce\) return false; finishProviderSignIn\(link\.searchParams\); return true; \}/);
});

test('finding 6: Android leaves the app data out of backups', () => {
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:allowBackup="false"/);
});

test('finding 9: the CSP reaches only this project, and follows js/sync-config.js', () => {
  const host = new URL(read('js/sync-config.js').match(/url: '([^']+)'/)[1]).host;
  const csp = read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/)[1];
  assert.match(csp, new RegExp(`connect-src 'self' https://${host.replace(/\./g, '\\.')} wss://${host.replace(/\./g, '\\.')};`));
  assert.doesNotMatch(csp, /\*\.supabase\.co/);
});

test('the privacy policy names the controller, the age, rights, the EU server, retention, breaches and no marketing', () => {
  const privacy = read('privatnost.html');
  for (const part of ['Marko Radičević', 'marko.radicevic@ivapix.cloud', '15 godina', 'Poverenik', 'poverenik.rs', '72 sata', 'Frankfurt', '90 dana', 'reklamne', 'prenosivost']) {
    assert.ok(privacy.includes(part), part);
  }
  const terms = read('uslovi.html');
  for (const part of ['Marko Radičević', '15 godina']) assert.ok(terms.includes(part), part);
});

test('R58 is released as 2.0.0-alpha.85', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.85');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.85';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.85');
});
