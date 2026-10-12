// R51: the encrypted journal — sealed at the network boundary of sync with a key from the journal password, so the
// server sees only ciphertext; the devices keep the readable journal.
// Data-model spec: docs/superpowers/specs/2026-10-12-r51-journal-encryption.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const ITER = 1000; // the real count is 600,000; tests derive faster
const stamp = '2026-10-10T20:00:00.000Z';
const entry = (date, fields = {}) => ({ id: `journal_${date}`, date, text: 'A good day.', mood: 4, createdAt: stamp, updatedAt: stamp, ...fields });
const v3 = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {}, ...fields });
const bytes = base64 => Buffer.from(base64, 'base64').length;

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

test('a journal cipher: a salt, the iteration count and a check; the password unlocks it, a wrong one does not', async () => {
  assert.equal(Sync.JOURNAL_ITERATIONS, 600000);
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  assert.deepEqual(Object.keys(cipher).sort(), ['check', 'iterations', 'salt', 'v']);
  assert.deepEqual([cipher.v, cipher.iterations, bytes(cipher.salt), bytes(cipher.check.iv)], [1, ITER, 16, 12]);
  assert.ok(key);
  assert.ok(await Sync.unlockJournalCipher(cipher, 'lozinka dnevnika 7'));
  assert.equal(await Sync.unlockJournalCipher(cipher, 'lozinka dnevnika 8'), null);
  assert.equal(await Sync.unlockJournalCipher({ ...cipher, check: { v: 1, iv: cipher.check.iv, ct: 'AAAA' } }, 'lozinka dnevnika 7'), null);
  const again = await Sync.importJournalKey(await Sync.exportJournalKey(key));
  const other = await Sync.createJournalCipher('druga lozinka 1', { iterations: ITER });
  assert.ok(Sync.journalCipherValid(cipher));
  assert.ok(!Sync.journalCipherValid({ ...cipher, iterations: 5 }) && !Sync.journalCipherValid({ v: 1 }) && !Sync.journalCipherValid(null));
  assert.ok(again && other.cipher.salt !== cipher.salt);
});

test('two devices with the key: the server row holds no readable text, the other device reads the entry', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const macKey = await Sync.unlockJournalCipher(cipher, 'lozinka dnevnika 7');
  const phone = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Tajna misao' })], settings: { journalCipher: cipher } }), { key });
  const mac = device(fake, v3({ settings: { journalCipher: cipher } }), { key: macKey });
  await phone.signIn(); assert.equal((await phone.sync()).status, 'ok');
  const row = serverRow(fake, 'journal_2026-10-10');
  assert.deepEqual(Object.keys(row.data).sort(), ['date', 'id', 'sealed']);
  assert.doesNotMatch(JSON.stringify(row.data), /Tajna|"mood"|"text"/);
  await mac.signIn(); assert.equal((await mac.sync('merge')).status, 'ok');
  assert.deepEqual(plain(mac.store.state.journal), [entry('2026-10-10', { text: 'Tajna misao' })]);
  mac.store.state.journal[0] = { ...mac.store.state.journal[0], text: 'Izmenjeno na Macu', updatedAt: '2026-10-10T21:00:00.000Z' };
  assert.equal((await mac.sync()).pushed, 1);
  await phone.sync();
  assert.equal(phone.store.state.journal[0].text, 'Izmenjeno na Macu');
  assert.notDeepEqual(serverRow(fake, 'journal_2026-10-10').data.sealed.iv, row.data.sealed.iv, 'a fresh IV for every push');
  assert.equal((await phone.sync()).pushed, 0, 'an echo of its own push changes nothing');
});

test('a locked device pushes, deletes and takes nothing of the journal until the password is entered', async () => {
  const fake = createFakeSupabase();
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const phone = device(fake, v3({ journal: [entry('2026-10-10')], settings: { journalCipher: cipher } }), { key });
  await phone.signIn(); await phone.sync();
  const tablet = device(fake, v3({ journal: [entry('2026-10-11', { text: 'Samo na tabletu' })], settings: { journalCipher: cipher } }), { locked: true });
  await tablet.signIn();
  assert.equal((await tablet.sync('merge')).status, 'ok');
  assert.deepEqual(plain(tablet.store.state.journal).map(item => item.id), ['journal_2026-10-11'], 'the sealed entry is left out');
  assert.equal(serverRow(fake, 'journal_2026-10-11'), undefined, 'nothing readable leaves the locked device');
  tablet.store.state.journal = [];
  await tablet.sync();
  assert.ok(serverRow(fake, 'journal_2026-10-10') && !serverRow(fake, 'journal_2026-10-10').deleted, 'no deletion either');
  tablet.store.state.journal = [entry('2026-10-11', { text: 'Samo na tabletu' })];
  tablet.journal = { key: await Sync.unlockJournalCipher(cipher, 'lozinka dnevnika 7'), locked: false };
  tablet.meta.cursor = null;
  await tablet.sync();
  assert.deepEqual(plain(tablet.store.state.journal).map(item => item.id).sort(), ['journal_2026-10-10', 'journal_2026-10-11']);
  assert.ok(serverRow(fake, 'journal_2026-10-11').data.sealed);
  // The first sync's "keep the account data" never deletes the entries of a locked device.
  const laptop = device(fake, v3({ journal: [entry('2026-10-12')], settings: { journalCipher: cipher } }), { locked: true });
  await laptop.signIn();
  await laptop.sync('server');
  assert.deepEqual(plain(laptop.store.state.journal).map(item => item.id), ['journal_2026-10-12']);
});

test('turning encryption on over readable rows pushes them sealed, and the history loses the readable versions', async () => {
  const fake = createFakeSupabase();
  const phone = device(fake, v3({ journal: [entry('2026-10-10', { text: 'Pre šifrovanja' })] }));
  await phone.signIn(); await phone.sync();
  assert.match(JSON.stringify(serverRow(fake, 'journal_2026-10-10').data), /Pre šifrovanja/);
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  phone.store.state.settings = { ...phone.store.state.settings, journalCipher: cipher };
  phone.journal = { key, locked: false };
  Sync.forgetJournalShadow(phone.meta);
  assert.ok(Object.keys(phone.meta.shadow).every(item => !item.startsWith('journal')));
  await phone.sync();
  assert.ok(serverRow(fake, 'journal_2026-10-10').data.sealed);
  assert.ok(fake.history.some(item => item.type === 'journal' && /Pre šifrovanja/.test(JSON.stringify(item.data))));
  assert.equal(await phone.client.purgeJournalHistory(phone.meta.session), 1);
  assert.ok(!fake.history.some(item => item.type === 'journal'));
  const old = createFakeSupabase({ journalPurge: false });
  const other = device(old, v3());
  await other.signIn();
  assert.equal(await other.client.purgeJournalHistory(other.meta.session), null, 'without 0005 the call says so');
});

test('rows that do not open are left out; readable rows from older apps still apply', async () => {
  const fake = createFakeSupabase();
  const first = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const second = await Sync.createJournalCipher('druga lozinka 1', { iterations: ITER });
  const phone = device(fake, v3({ journal: [entry('2026-10-10')], settings: { journalCipher: first.cipher } }), { key: first.key });
  await phone.signIn(); await phone.sync();
  const stranger = device(fake, v3({ settings: { journalCipher: second.cipher } }), { key: second.key });
  await stranger.signIn();
  assert.equal((await stranger.sync('merge')).status, 'ok');
  assert.deepEqual(plain(stranger.store.state.journal), []);
  const oldApp = device(fake, v3({ journal: [entry('2026-10-09', { text: 'Sa starog telefona' })] }));
  await oldApp.signIn(); await oldApp.sync('merge');
  await phone.sync();
  assert.equal(phone.store.state.journal.find(item => item.id === 'journal_2026-10-09')?.text, 'Sa starog telefona');
});

test('backups accept a well-formed journal cipher setting and refuse a broken one', async () => {
  const Backup = require('../js/backup.js');
  const { cipher } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const base = () => v3({ settings: { journalCipher: { ...cipher, iterations: 600000 } } });
  assert.doesNotThrow(() => Backup.validateDomain(base(), [], []));
  for (const broken of [{ v: 2 }, { salt: 'not base64!' }, { iterations: 10 }, { check: null }, { check: { v: 1, iv: cipher.check.iv } }]) {
    const raw = base();
    raw.settings.journalCipher = { ...raw.settings.journalCipher, ...broken };
    assert.throws(() => Backup.validateDomain(raw, [], []), /journalCipher|Invalid backup/, JSON.stringify(broken));
  }
});

test('the server function and the guide', () => {
  const sql = read('supabase/migrations/0005_journal_history.sql');
  assert.match(sql, /create or replace function public\.purge_journal_history\(\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /delete from public\.record_history where user_id = auth\.uid\(\) and type = 'journal'/);
  assert.match(sql, /grant execute on function public\.purge_journal_history\(\) to authenticated;/);
  assert.match(read('docs/v2/podesavanje-supabase.md'), /0005_journal_history\.sql/);
});

const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

test('the app: the device key, the sync options and the status', () => {
  assert.match(app, /const JOURNAL_KEY_KEY = 'dailoJournalKey';/);
  assert.match(fn('runSync'), /journal: await journalSyncOptions\(\),/);
  assert.match(fn('runSync'), /if \(result\.status === 'ok'\) \{ connectLiveSync\(\); await afterJournalSync\(meta\); \}/);
  assert.match(fn('journalSyncOptions'), /return \{ key, locked: Boolean\(state\?\.settings\?\.journalCipher\) && !key \};/);
  assert.match(fn('deviceJournalKey'), /if \(stored\?\.salt !== cipher\.salt \|\| typeof stored\.key !== 'string'\) return null;/);
  assert.match(fn('journalCipherStatus'), /return stored\?\.salt === cipher\.salt \? 'on' : 'locked';/);
  const after = fn('afterJournalSync');
  assert.match(after, /if \(!state\?\.settings\?\.journalCipher\) \{ if \(journalCipherStored\(\)\) forgetJournalKey\(\); return; \}/);
  assert.match(after, /const gone = await syncClient\.purgeJournalHistory\(meta\.session\);/);
  assert.match(fn('signOutSync'), /forgetJournalKey\(\);/);
  assert.match(app, /liveSync\?\.disconnect\(\);\n\s+forgetJournalKey\(\);\n\s+syncMeta = \{\};\n\s+try \{ localStorage\.removeItem\(SYNC_META_KEY\); \} catch \(error\) \{ console\.error\(error\); \}\n\s+render\(\);\n\s+setToastMessage\(tr\('The account and its synced data were deleted/);
});

test('the app: on, unlock and off through the journal window', () => {
  const submit = fn('journalCipherSubmit');
  assert.match(submit, /if \(syncRunning\) \{ setJournalWindow\(\{ busy: false, error: msg\('Sync is running\. Try again in a moment\.'\) \}\); return; \}/);
  assert.match(submit, /const \{ cipher, key \} = await Sync\.createJournalCipher\(windowState\.password\);/);
  assert.match(submit, /Sync\.forgetJournalShadow\(meta\);\n\s+meta\.purgeJournalHistory = true;/);
  assert.match(submit, /const key = await Sync\.unlockJournalCipher\(state\.settings\.journalCipher, windowState\.password\);/);
  assert.match(submit, /if \(!key\) \{ setJournalWindow\(\{ busy: false, error: msg\('The journal password is wrong\.'\) \}\); return; \}/);
  assert.match(submit, /meta\.cursor = null;/);
  assert.match(submit, /delete state\.settings\.journalCipher;/);
  assert.match(fn('accountSubmit'), /if \(modalState\?\.type === 'journal-cipher'\) return journalCipherSubmit\(\);/);
  for (const action of ['journal-cipher-enable', 'journal-cipher-unlock', 'journal-cipher-disable']) assert.ok(app.includes(`'${action}'`), action);
  const ui = read('js/settings-ui.js');
  assert.match(ui, /function renderJournalCipherWindow\(ctx\)/);
  assert.match(ui, /if \(route\.type === 'modal' && route\.modalType === 'journal-cipher'\) return renderJournalCipherWindow\(ctx\);/);
  assert.match(ui, /<strong>\$\{tr\('Encrypted journal'\)\}<\/strong>/);
  assert.match(read('js/journal-ui.js'), /ctx\.journalCipherStatus\(\) === 'locked'/);
});

test('Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Encrypted journal', 'Šifrovan dnevnik'], ['Journal password', 'Lozinka dnevnika'], ['The journal password is wrong.', 'Lozinka dnevnika nije tačna.'],
    ['Turn on encryption', 'Uključi šifrovanje'], ['Turn off encryption', 'Isključi šifrovanje'], ['Unlock', 'Otključaj'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R51 is released as 2.0.0-alpha.78', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.78');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.78';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.78');
});
