// R75: with the encrypted journal on and its key on this device, a ZIP backup carries the journal sealed, the same
// way sync sends it ({ id, date, sealed }). The ZIP keeps backupVersion 2. A restore opens the entries with the key on
// this device, or with the journal password typed in the restore window; without the password everything else is
// restored. Older apps refuse such a ZIP instead of dropping the journal silently.
// Data-model spec: docs/superpowers/specs/2026-10-15-r75-backup-journal-sealed.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const ITER = 1000; // the real count is 600,000; tests derive faster
const stamp = '2026-10-10T20:00:00.000Z';
const entry = (date, fields = {}) => ({ id: `journal_${date}`, date, text: 'Tajna misao', mood: 4, createdAt: stamp, updatedAt: stamp, ...fields });
const stateWith = (journal, settings = {}) => TodoCore.normalizeState({
  version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [],
  journal, settings, ui: {},
});
const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };
const sealer = key => async item => (await Sync.sealJournalRecord(key, { data: item })).data;
const opener = key => sealed => Sync.openJournalData(key, sealed);
async function dataJson(blob) { return JSON.parse(await (await JSZip.loadAsync(await blob.arrayBuffer())).file('data.json').async('string')); }
async function zipOf(manifest) { const zip = new JSZip(); zip.file('data.json', JSON.stringify(manifest)); return zip.generateAsync({ type: 'blob' }); }

test('with the key, the export seals every journal entry; the ZIP holds no readable journal text', async () => {
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const state = stateWith([entry('2026-10-10'), entry('2026-10-11', { text: 'Drugi dan', mood: null })], { journalCipher: cipher });
  const manifest = await dataJson(await Backup.exportBackupV3(state, storage, '2026-10-15T10:00:00.000Z', { sealJournal: sealer(key) }));
  assert.equal(manifest.backupVersion, 2);
  assert.deepEqual(manifest.data.journal.map(item => Object.keys(item).sort()), [['date', 'id', 'sealed'], ['date', 'id', 'sealed']]);
  assert.deepEqual(manifest.data.journal.map(item => item.id), ['journal_2026-10-10', 'journal_2026-10-11']);
  assert.doesNotMatch(JSON.stringify(manifest), /Tajna|Drugi dan|"mood"/);
  assert.deepEqual(manifest.data.settings.journalCipher, plain(cipher), 'the shared, non-secret part goes along');
  assert.deepEqual(plain(state.journal[0]), entry('2026-10-10'), 'the app state is not touched');
});

test('without a sealer (no encryption, or a locked device) the journal stays readable, as before', async () => {
  const manifest = await dataJson(await Backup.exportBackupV3(stateWith([entry('2026-10-10')]), storage, '2026-10-15T10:00:00.000Z'));
  assert.deepEqual(manifest.data.journal, [entry('2026-10-10')]);
});

test('the inspection sets the sealed entries apart; the key opens them, a wrong key does not', async () => {
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const blob = await Backup.exportBackupV3(stateWith([entry('2026-10-10'), entry('2026-10-11')], { journalCipher: cipher }), storage, '2026-10-15T10:00:00.000Z', { sealJournal: sealer(key) });
  const validated = await Backup.inspectBackupV3(blob);
  assert.deepEqual(plain(validated.state.journal), []);
  assert.equal(validated.sealedJournal.length, 2);
  assert.equal(validated.summary.sealedJournal, 2);
  assert.deepEqual(plain(await Backup.openJournalEntries(validated.sealedJournal, opener(key))), [entry('2026-10-10'), entry('2026-10-11')]);
  const other = await Sync.createJournalCipher('druga lozinka 1', { iterations: ITER });
  assert.equal(await Backup.openJournalEntries(validated.sealedJournal, opener(other.key)), null);
  const readable = await Backup.inspectBackupV3(await Backup.exportBackupV3(stateWith([entry('2026-10-12')]), storage, '2026-10-15T10:00:00.000Z'));
  assert.deepEqual(plain(readable.sealedJournal), []);
  assert.equal(readable.state.journal.length, 1);
});

test('the inspection refuses a sealed journal without its cipher, a malformed entry or a day twice', async () => {
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: ITER });
  const manifest = await dataJson(await Backup.exportBackupV3(stateWith([entry('2026-10-10')], { journalCipher: cipher }), storage, '2026-10-15T10:00:00.000Z', { sealJournal: sealer(key) }));
  const sealed = manifest.data.journal[0];
  const variant = (journal, settings = manifest.data.settings) => zipOf({ ...manifest, data: { ...manifest.data, journal, settings } });
  await assert.rejects(Backup.inspectBackupV3(await variant([sealed], { ...manifest.data.settings, journalCipher: undefined })), /Invalid backup: journal/);
  await assert.rejects(Backup.inspectBackupV3(await variant([{ ...sealed, id: 'journal_2026-10-11' }])), /Invalid backup: journal/);
  await assert.rejects(Backup.inspectBackupV3(await variant([{ ...sealed, text: 'readable too' }])), /Invalid backup: journal/);
  await assert.rejects(Backup.inspectBackupV3(await variant([{ ...sealed, sealed: { v: 1, iv: 'AAAA', ct: sealed.sealed.ct } }])), /Invalid backup: journal/);
  await assert.rejects(Backup.inspectBackupV3(await variant([sealed, entry('2026-10-10')])), /Invalid backup: journal/);
});

test('an app without R75 refuses a sealed journal instead of dropping it', () => {
  assert.throws(() => Backup.validateDomain({ ...stateWith([]), journal: [{ id: 'journal_2026-10-10', date: '2026-10-10', sealed: { v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' } }] }, [], []), /Invalid backup: journal/);
});

test('every ZIP the app writes seals the journal when this device has the key', () => {
  const options = functionSource('journalBackupOptions').source;
  assert.match(options, /const key = await deviceJournalKey\(\);/);
  assert.match(options, /sealJournal: async item => \(await Sync\.sealJournalRecord\(key, \{ data: item \}\)\)\.data/);
  assert.match(functionSource('exportBackupAction').source, /Backup\.exportBackupV3\(state, TodoStorage, nowIso\(\), await journalBackupOptions\(\)\)/);
  assert.match(functionSource('runAutoBackup').source, /Backup\.exportBackupV3\(state, TodoStorage, nowIso\(\), await journalBackupOptions\(\)\)/);
  assert.match(functionSource('beginGlobalOperation').source, /Backup\.exportBackupV3\(JSON\.parse\(op\.stateText\), frozenStorage, nowIso\(\), await journalBackupOptions\(\)\)/);
});

test('a restore opens the journal with this device\'s key, or asks for the journal password', () => {
  const begin = functionSource('beginGlobalOperation').source;
  assert.match(begin, /op\.sealedJournal = op\.validated\.sealedJournal \|\| \[\]; delete op\.validated\.sealedJournal;/);
  assert.match(begin, /const storedKey = op\.sealedJournal\.length \? await storedJournalKeyFor\(op\.validated\.state\.settings\?\.journalCipher\) : null;/);
  assert.match(begin, /if \(storedKey\) await openRestoredJournal\(op, storedKey\);/);
  assert.match(begin, /journalPassword: op\.sealedJournal\.length > 0/);
  const modal = functionSource('renderConfirmModal').source;
  assert.match(modal, /modalState\.journalPassword \? `<label class="sheet-label" for="global-confirm-journal-password">\$\{tr\('Journal password'\)\}<input id="global-confirm-journal-password" class="input" type="password" autocomplete="off" \/><\/label>` : ''/);
  const commit = functionSource('commitGlobalOperation').source;
  assert.ok(commit.indexOf('unlockRestoredJournal(op)') < commit.indexOf("markGlobalSnapshot(op, 'mutating'"), 'the journal is opened before anything is replaced');
  // R78: the key is stored after the redraw, and only while the restored state has its cipher.
  assert.match(commit, /if \(op\.journalKey && state\.settings\?\.journalCipher\) await storeJournalKey\(state\.settings\.journalCipher\.salt, op\.journalKey\);/);
  const unlock = functionSource('unlockRestoredJournal').source;
  assert.match(unlock, /const password = \$\('#global-confirm-journal-password'\)\?\.value \|\| '';/);
  assert.match(unlock, /if \(!password\) \{ op\.journalSkipped = true; return true; \}/);
  assert.match(unlock, /await Sync\.unlockJournalCipher\(op\.validated\.state\.settings\.journalCipher, password\)/);
  assert.match(unlock, /setToastMessage\(tr\('The journal password is wrong\.'\)\)/);
  const open = functionSource('openRestoredJournal').source;
  assert.match(open, /await Backup\.openJournalEntries\(op\.sealedJournal, sealed => Sync\.openJournalData\(key, sealed\)\)/);
  assert.match(open, /Backup\.validateDomain\(next, op\.validated\.habitLogs, op\.validated\.goalHistory\);/);
  assert.match(open, /op\.journalKey = key; op\.sealedJournal = \[\];/);
});

test('the restore window says what happens to the encrypted journal, in Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['The journal in this backup is encrypted ({count} entries). Enter the journal password to restore it too; without it everything else is restored.', 'Dnevnik u ovoj kopiji je šifrovan (unosa: {count}). Upiši lozinku dnevnika da se vrati i on; bez nje se vraća sve ostalo.'],
    ['The encrypted journal ({count} entries) opens with the key on this device.', 'Šifrovan dnevnik (unosa: {count}) otvara se ključem sa ovog uređaja.'],
    ['The journal in this backup could not be opened.', 'Dnevnik iz ove kopije nije mogao da se otvori.'],
    ['Backup restored without the encrypted journal.', 'Rezervna kopija je vraćena bez šifrovanog dnevnika.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R75 shipped as 2.0.0-alpha.102 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 102) >= 102);
});
