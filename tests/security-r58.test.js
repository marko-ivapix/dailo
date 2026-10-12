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
    store, meta, client, journal: { key: options.key || null, salt: options.salt || null, locked: Boolean(options.locked) },
    async signIn() { await client.requestCode('ana@example.com'); meta.session = await client.verifyCode('ana@example.com', '123456'); },
    sync: (mode = null) => Sync.syncOnce({ client: self.client, meta, mode, now: fake.now, journal: self.journal, readLocal: async () => ({ state: store.state, habitLogs: store.habitLogs }), writeLocal: async result => { store.state = result.state; } }),
  };
  return self;
}
const serverRow = (fake, id) => fake.rowsFor('ana@example.com').find(row => row.type === 'journal' && row.id === id);

// An app that keeps settings.journalCipher but neither seals nor locks: a version from before R51.
const preR51 = (fake, state) => device(fake, state, { key: null, locked: false });

test('finding 2: a readable journal row that reaches a device with the key goes back sealed in the same round', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const phone = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Šifrovano' })], settings: { journalCipher: cipher } }), { key, salt: cipher.salt });
  await phone.signIn(); await phone.sync();
  delete phone.meta.purgeJournalHistory;
  // An older app on the account (it synced before) edits the entry in a normal round and pushes it readable.
  const oldApp = preR51(fake, v3({ journal: [entry('2026-10-10', { text: 'Šifrovano' })], settings: { journalCipher: cipher } }));
  await oldApp.signIn(); await oldApp.sync('server');
  oldApp.store.state.journal = [entry('2026-10-10', { text: 'Izmenjeno na starom telefonu', updatedAt: '2026-10-11T08:00:00.000Z' })];
  fake.advance(10000);
  await oldApp.sync();
  assert.match(JSON.stringify(serverRow(fake, 'journal_2026-10-10').data), /starom telefonu/);
  const round = await phone.sync();
  assert.equal(round.status, 'ok');
  assert.equal(round.pushed, 1, 'the re-seal counts as a push');
  assert.equal(phone.store.state.journal[0].text, 'Izmenjeno na starom telefonu', 'the device keeps the newer entry');
  assert.ok(serverRow(fake, 'journal_2026-10-10').data.sealed, 'the server row is sealed again');
  assert.equal(phone.meta.purgeJournalHistory, true, 'the history purge runs after this round');
  await phone.client.purgeJournalHistory(phone.meta.session);
  assert.ok(!fake.history.some(item => item.type === 'journal'));
  fake.advance(10000);
  assert.equal((await phone.sync()).pushed, 0, 'nothing left to re-seal');
  assert.ok(serverRow(fake, 'journal_2026-10-10').data.sealed);
});

test('review 1: when another device turns encryption off, a device with the old key leaves the readable journal alone', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const mac = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Moj dan' })], settings: { journalCipher: cipher } }), { key, salt: cipher.salt });
  const phone = device(fake, v3({ settings: { journalCipher: cipher } }), { key, salt: cipher.salt });
  await mac.signIn(); await mac.sync();
  await phone.signIn(); await phone.sync('merge');
  // The Mac turns encryption off: the setting goes, and the journal goes back readable.
  mac.store.state.settings = {};
  mac.journal = { key: null, locked: false };
  Sync.forgetJournalShadow(mac.meta);
  fake.advance(10000);
  await mac.sync();
  assert.match(JSON.stringify(serverRow(fake, 'journal_2026-10-10').data), /Moj dan/);
  fake.advance(10000);
  assert.equal((await phone.sync()).status, 'ok');
  assert.match(JSON.stringify(serverRow(fake, 'journal_2026-10-10').data), /Moj dan/, 'still readable for every device');
  assert.equal(phone.store.state.journal[0].text, 'Moj dan');
  assert.equal(phone.meta.purgeJournalHistory, undefined);
  const fresh = device(fake, v3());
  await fresh.signIn(); await fresh.sync('server');
  assert.equal(fresh.store.state.journal[0]?.text, 'Moj dan', 'a new device reads the journal');
});

test('finding 2 and review 4: a first sync that takes the server copy re-seals readable rows in the same round', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const oldApp = preR51(fake, v3({ journal: [entry('2026-10-09', { text: 'Staro' })], settings: { journalCipher: cipher } }));
  await oldApp.signIn(); await oldApp.sync();
  const phone = device(fake, v3(), { key, salt: cipher.salt });
  await phone.signIn();
  assert.equal((await phone.sync('server')).status, 'ok');
  assert.ok(serverRow(fake, 'journal_2026-10-09').data.sealed, 'sealed in the same round');
  assert.equal(phone.meta.purgeJournalHistory, true);
  assert.equal(phone.store.state.journal[0].text, 'Staro');
});

test('review 2: "keep this device" still deletes account-only journal rows, and seals the ones it keeps', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const oldApp = preR51(fake, v3({ journal: [entry('2026-10-08', { text: 'Samo na nalogu' }), entry('2026-10-09', { text: 'Oba' })], settings: { journalCipher: cipher } }));
  await oldApp.signIn(); await oldApp.sync();
  fake.advance(10000);
  const phone = device(fake, v3({ journal: [entry('2026-10-09', { text: 'Oba' })], settings: { journalCipher: cipher } }), { key, salt: cipher.salt });
  await phone.signIn();
  assert.equal((await phone.sync('device')).status, 'ok');
  assert.equal(serverRow(fake, 'journal_2026-10-08').deleted, true, 'the account-only row is deleted');
  assert.ok(serverRow(fake, 'journal_2026-10-09').data.sealed, 'the kept row is sealed');
  assert.deepEqual(phone.store.state.journal.map(item => item.id), ['journal_2026-10-09']);
});

test('review 5: the purge flag survives a failed re-seal push', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const phone = device(fake, v3({ journal: [entry('2026-10-10')], settings: { journalCipher: cipher } }), { key, salt: cipher.salt });
  await phone.signIn(); await phone.sync();
  const oldApp = preR51(fake, v3({ settings: { journalCipher: cipher } }));
  await oldApp.signIn(); await oldApp.sync('server');
  oldApp.store.state.journal = [entry('2026-10-10', { text: 'Novo', updatedAt: '2026-10-11T08:00:00.000Z' })];
  fake.advance(10000); await oldApp.sync();
  const real = phone.client;
  let pushes = 0;
  phone.client = new Proxy(real, { get: (target, prop) => (prop === 'push' ? async (...args) => { pushes += 1; throw new Error('network'); } : Reflect.get(target, prop)) });
  const failing = await Sync.syncOnce({ client: phone.client, meta: phone.meta, now: fake.now, journal: phone.journal, readLocal: async () => ({ state: phone.store.state, habitLogs: [] }), writeLocal: async result => { phone.store.state = result.state; } });
  assert.equal(failing.status, 'error');
  assert.equal(pushes, 1);
  assert.equal(phone.meta.purgeJournalHistory, true, 'set before the push');
});

test('review 3: an item over the size cap stays on the device, is named, and does not stop the rest', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, v3({ notes: [{ id: 'note-big', title: 'Velika beleška', body: 'x'.repeat(300 * 1024), createdAt: stamp, updatedAt: stamp }, { id: 'note-small', title: 'Mala', body: 'ok', createdAt: stamp, updatedAt: stamp }] }));
  await phone.signIn();
  const round = await phone.sync();
  assert.equal(round.status, 'ok');
  const rows = fake.rowsFor('ana@example.com');
  assert.ok(rows.some(row => row.type === 'notes' && row.id === 'note-small'));
  assert.ok(!rows.some(row => row.type === 'notes' && row.id === 'note-big'));
  assert.deepEqual(plain(phone.meta.tooLarge), [{ type: 'notes', id: 'note-big', name: 'Velika beleška' }]);
  phone.store.state.notes[0].body = 'kraće';
  phone.store.state.notes[0].updatedAt = '2026-10-11T08:00:00.000Z';
  fake.advance(10000);
  await phone.sync();
  assert.ok(fake.rowsFor('ana@example.com').some(row => row.type === 'notes' && row.id === 'note-big'), 'goes once it is shorter');
  assert.equal(phone.meta.tooLarge, undefined);
  assert.equal(Sync.SYNC_RECORD_LIMIT, 240 * 1024);
  const card = read('js/settings-ui.js');
  assert.match(card, /sync\.tooLarge\?\.length \? `<br><span class="validation" role="alert">\$\{esc\(tr\('Too large to sync \(at most 240 KB\): \{items\}', \{ items: sync\.tooLarge\.map\(item => item\.name\)\.join\(', '\) \}\)\)\}<\/span>` : ''/);
  assert.match(functionSource('syncView').source, /tooLarge: meta\.tooLarge \|\| \[\]/);
  assert.match(functionSource('journalSyncOptions').source, /return \{ key, salt: key \? state\.settings\.journalCipher\.salt : null, locked: Boolean\(state\?\.settings\?\.journalCipher\) && !key \};/);
});

test('finding 3: the goal unit is escaped in the progress sheet, once', () => {
  const sheet = functionSource('progressSheetHtml').source;
  assert.match(sheet, /const unit = goal\.unit \? ` \$\{ctx\.esc\(goal\.unit\)\}` : '';/);
  assert.match(sheet, /ctx\.esc\(tr\('of \{target\}', \{ target: `\$\{plainNumber\(target\)\}\$\{goal\.unit \? ` \$\{goal\.unit\}` : ''\}` \}\)\)/, 'the raw unit inside the escaped label');
});

test('finding 4: Realtime listens to an opaque per-account table, not to records', () => {
  const sockets = [];
  class FakeSocket { constructor(url) { this.url = url; this.sent = []; sockets.push(this); } send(text) { this.sent.push(JSON.parse(text)); } close() {} }
  FakeSocket.OPEN = 1;
  const live = Sync.createRealtime({ url: 'https://abc.supabase.co', key: 'k', WebSocket: FakeSocket, timers: { setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {} }, onChange() {} });
  live.connect({ accessToken: 't', user: { id: 'user-1' } });
  sockets[0].readyState = 1; sockets[0].onopen();
  const pokes = [];
  const listening = Sync.createRealtime({ url: 'https://abc.supabase.co', key: 'k', WebSocket: FakeSocket, timers: { setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {} }, onChange: () => pokes.push('poke') });
  listening.connect({ accessToken: 't', user: { id: 'user-1' } });
  sockets[1].readyState = 1; sockets[1].onopen();
  sockets[1].onmessage({ data: JSON.stringify({ topic: 'realtime:dailo-records', event: 'postgres_changes', payload: { data: { type: 'DELETE', table: 'record_pokes' } } }) });
  sockets[1].onmessage({ data: JSON.stringify({ topic: 'realtime:dailo-records', event: 'postgres_changes', payload: { data: { type: 'UPDATE', table: 'record_pokes' } } }) });
  assert.deepEqual(pokes, ['poke'], "a deleted account's row starts no sync");
  assert.deepEqual(sockets[0].sent[0].payload.config.postgres_changes, [{ event: '*', schema: 'public', table: 'record_pokes', filter: 'user_id=eq.user-1' }]);
  const sql = read('supabase/migrations/0006_security.sql');
  assert.match(sql, /create table if not exists public\.record_pokes \(\n\s+id uuid primary key default gen_random_uuid\(\),\n\s+user_id uuid not null unique references auth\.users \(id\) on delete cascade,/);
  assert.match(sql, /alter table public\.record_pokes enable row level security;/);
  assert.match(sql, /for select to authenticated\n\s+using \(user_id = auth\.uid\(\)\);/);
  assert.match(sql, /revoke all on public\.record_pokes from anon, authenticated;\ngrant select on public\.record_pokes to authenticated;/);
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
  assert.equal(Sync.serverMessage(400, '23514', 'new row for relation "records" violates check constraint "records_data_size"'), 'An item is too large to sync (at most 256 KB). Shorten it.');
  const guide = read('docs/v2/podesavanje-supabase.md');
  assert.match(guide, /0006_security\.sql/);
  assert.match(guide, /pokreni ga tek kad su svi uređaji na verziji `2\.0\.0-alpha\.85` ili novijoj/);
  assert.doesNotMatch(read('docs/superpowers/specs/2026-10-12-security-review.md'), /only `records` in the Realtime publication/);
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
  assert.ok(!privacy.includes('Za šifrovan dnevnik prethodne verzije se ne čuvaju.'), 'not true: sealed versions stay in the history');
  assert.ok(privacy.includes('Za šifrovan dnevnik server čuva samo šifrovane prethodne verzije.'));
  const terms = read('uslovi.html');
  for (const part of ['Marko Radičević', '15 godina']) assert.ok(terms.includes(part), part);
});

test('R58 is released as 2.0.0-alpha.85', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.85');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.85';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.85');
});
