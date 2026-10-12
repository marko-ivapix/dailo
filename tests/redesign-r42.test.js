// Redesign R42: server messages in Serbian and "Proveri server" on Nalog, so a missing Supabase step says what to do.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r42-server-messages.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const respond = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const clientWith = (status, body) => Sync.createClient({ url: 'https://x.supabase.co', anonKey: 'k', fetch: respond(status, body) });
const session = { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600000, user: { id: 'u', email: 'a@b.rs' } };
async function failure(status, body, call = client => client.signIn('a@b.rs', 'x')) {
  try { await call(clientWith(status, body)); } catch (error) { return error.message; }
  assert.fail('no error');
}
const MISSING = 'The sync tables are missing on the server. Run 0001_sync.sql and 0002_journal.sql in Supabase.';

test('Supabase Auth errors read as sentences the app can translate', async () => {
  for (const [status, body, message] of [
    [400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 'Wrong e-mail address or password.'],
    [400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 'Wrong e-mail address or password.'],
    [400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 'The e-mail address is not confirmed yet.'],
    [422, { error_code: 'user_already_exists', msg: 'User already registered' }, 'An account with this e-mail address already exists. Sign in.'],
    [422, { error_code: 'email_exists', msg: 'Email address already registered' }, 'An account with this e-mail address already exists. Sign in.'],
    [422, { error_code: 'weak_password', msg: 'Password should contain at least one character of each' }, 'The password is too weak for the server. Use a longer one with digits and letters.'],
    [429, { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, 'Too many requests. Wait a minute and try again.'],
    [429, { error_code: 'over_request_rate_limit' }, 'Too many requests. Wait a minute and try again.'],
    [403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 'The code is wrong or has expired.'],
    [400, { error_code: 'email_address_not_authorized', msg: 'Email address not authorized' }, 'The server cannot send e-mail to this address yet: its SMTP is not set up.'],
    [500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending confirmation email' }, 'The server could not send the e-mail. Try again later.'],
    [500, { msg: 'Error sending recovery email' }, 'The server could not send the e-mail. Try again later.'],
    [422, { error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' }, 'Registration is turned off on the server.'],
    [400, { error_code: 'email_address_invalid', msg: 'Email address "x" is invalid' }, 'Enter a valid e-mail address.'],
    [400, { msg: 'Unable to validate email address: invalid format' }, 'Enter a valid e-mail address.'],
    [422, { error_code: 'same_password', msg: 'New password should be different from the old password.' }, 'The new password must differ from the old one.'],
    [400, { error_code: 'provider_disabled', msg: 'Unsupported provider: provider is not enabled' }, 'This sign-in method is turned off on the server.'],
    [400, { error_code: 'email_provider_disabled', msg: 'Email logins are disabled' }, 'This sign-in method is turned off on the server.'],
    [401, { message: 'Invalid API key' }, 'The server does not accept the app key.'],
    [500, { message: 'boom' }, 'Server error: boom'],
  ]) assert.equal(await failure(status, body), message, JSON.stringify(body));
  const offline = Sync.createClient({ url: 'https://x.supabase.co', anonKey: 'k', fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.signIn('a@b.rs', 'x'), error => error.message === 'Network unavailable' && error.status === 0, 'no English detail');
});

test('PostgREST errors name the missing migration', async () => {
  assert.equal(await failure(404, { code: 'PGRST205', message: "Could not find the table 'public.records' in the schema cache" }, client => client.pull(session, null)), MISSING);
  assert.equal(await failure(404, { code: '42P01', message: 'relation "public.records" does not exist' }, client => client.pull(session, null)), MISSING);
  assert.equal(await failure(404, { code: 'PGRST202', message: 'Could not find the function public.delete_my_account' }, client => client.deleteAccount(session)), MISSING);
  assert.equal(await failure(400, { code: '23514', message: 'new row for relation "records" violates check constraint "records_type_check"' }, client => client.push(session, [{ type: 'journal', id: 'journal_2026-10-12', data: {} }])), 'The server does not accept Dnevnik yet. Run 0002_journal.sql in Supabase.');
  // The fake server answers the same way when a step is missing.
  const fake = createFakeSupabase({ autoconfirm: true, tables: false });
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  const { session: own } = await client.signUp('ana@example.com', 'tajna1234');
  await assert.rejects(client.pull(own, null), error => error.message === MISSING);
});

test('checkServer reads the key, the tables and the sign-in settings', async () => {
  const fake = createFakeSupabase();
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  assert.deepEqual(await client.checkServer(), { key: true, tables: 'ok', signup: true, confirm: true, google: true, apple: false });
  const bare = createFakeSupabase({ tables: false, autoconfirm: true, providers: {} });
  assert.deepEqual(await Sync.createClient({ url: bare.url, anonKey: bare.anonKey, fetch: bare.fetch }).checkServer(), { key: true, tables: 'missing', signup: true, confirm: false, google: false, apple: false });
  assert.deepEqual(await Sync.createClient({ url: fake.url, anonKey: 'wrong', fetch: fake.fetch }).checkServer(), { key: false, tables: 'unknown', signup: false, confirm: false, google: false, apple: false });
  const offline = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.checkServer(), error => error.message === 'Network unavailable');
});

function account(view) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'account' }, { state: { settings: {} }, esc, pageHeader: title => `<h1>${title}</h1>`, syncView: () => ({ configured: true, signedIn: false, email: '', ...view }) });
}

test('Nalog: "Proveri server" lists what is set up and what is missing', () => {
  const idle = account({});
  assert.match(idle, /<div class="server-check" data-server-check><div class="settings-row"><div class="settings-label"><strong>Server<\/strong><span>Check that the server is ready for sign-in and sync\.<\/span><\/div><button class="btn btn-secondary" type="button" data-action="sync-check-server">Check the server<\/button><\/div><\/div>/);
  assert.match(account({ serverCheck: { running: true } }), /data-action="sync-check-server" disabled>Checking…<\/button>/);
  assert.match(account({ serverCheck: { error: 'Network unavailable' } }), /<p class="validation" role="alert">Network unavailable<\/p>/);
  const ok = account({ serverCheck: { result: { key: true, tables: 'ok', signup: true, confirm: true, google: true, apple: false } } });
  assert.match(ok, /<ul class="server-check-list"><li class="is-ok"><i class="ph ph-check-circle" aria-hidden="true"><\/i><span>The server accepts the app key\.<\/span><\/li><li class="is-ok"><i class="ph ph-check-circle" aria-hidden="true"><\/i><span>The sync tables are in place\.<\/span><\/li><li class="is-ok"><i class="ph ph-check-circle" aria-hidden="true"><\/i><span>Registration is on\.<\/span><\/li><li class="is-info"><i class="ph ph-info" aria-hidden="true"><\/i><span>New accounts confirm their e-mail address with a code\.<\/span><\/li><li class="is-ok"><i class="ph ph-check-circle" aria-hidden="true"><\/i><span>Sign-in with Google is on\.<\/span><\/li><li class="is-info"><i class="ph ph-info" aria-hidden="true"><\/i><span>Sign-in with Apple is not turned on yet\.<\/span><\/li><li class="is-info"><i class="ph ph-info" aria-hidden="true"><\/i><span>The e-mail templates and SMTP cannot be checked from the app; the setup guide lists them\.<\/span><\/li><\/ul>/);
  const bad = account({ serverCheck: { result: { key: true, tables: 'missing', signup: false, confirm: false, google: false, apple: false } } });
  assert.match(bad, new RegExp(`<li class="is-bad"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>${MISSING.replace(/\./g, '\\.')}</span></li><li class="is-bad"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>Registration is turned off on the server\\.</span></li><li class="is-info"><i class="ph ph-info" aria-hidden="true"></i><span>New accounts are confirmed without an e-mail\\.</span></li>`));
  assert.match(account({ serverCheck: { result: { key: false, tables: 'unknown', signup: false, confirm: false, google: false, apple: false } } }), /<li class="is-bad"><i class="ph ph-warning-circle" aria-hidden="true"><\/i><span>The server does not accept the app key\.<\/span><\/li><li class="is-info"><i class="ph ph-info" aria-hidden="true"><\/i><span>The sync tables could not be checked\.<\/span><\/li>/);
  assert.match(account({ signedIn: true, email: 'a@b.rs', lastSyncAt: null, lastError: '' }), /data-server-check/, 'signed in too');
});

test('the app runs the check and keeps its result for the Nalog screen', async () => {
  const start = app.indexOf('  // Optional sync (V2.0-a).');
  const end = app.indexOf('  function completeWeeklyReview(');
  const fake = createFakeSupabase({ tables: false });
  const calls = { renders: 0 };
  const context = withI18n({
    console, JSON, Date, Promise, Error, Object, Array, String, Number, Boolean, Set, Map, URL, URLSearchParams, Sync,
    syncClient: Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch }), syncMeta: null, syncRunning: false, applyingSync: false, syncTimer: null, liveSync: null /* R50 */,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, render() { calls.renders += 1; }, modalState: null,
  });
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  const running = vm.runInContext('runServerCheck()', context);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('serverCheck', context))), { running: true });
  await running;
  assert.equal(vm.runInContext('serverCheck', context).result.tables, 'missing');
  assert.equal(vm.runInContext('syncView()', context).serverCheck.result.key, true);
  assert.equal(calls.renders, 2);
  assert.ok(app.includes("else if (action === 'sync-check-server') runServerCheck();"));
});

test('Serbian', () => {
  for (const [en, value] of [
    ['The e-mail address is not confirmed yet.', 'E-adresa još nije potvrđena.'],
    ['The server cannot send e-mail to this address yet: its SMTP is not set up.', 'Server još ne može da pošalje e-poruku na ovu adresu: nije podešen SMTP.'],
    ['The server could not send the e-mail. Try again later.', 'Server nije uspeo da pošalje e-poruku. Pokušaj kasnije.'],
    [MISSING, 'Na serveru nedostaju tabele za sinhronizaciju. U Supabase-u pokreni 0001_sync.sql i 0002_journal.sql.'],
    ['The server does not accept Dnevnik yet. Run 0002_journal.sql in Supabase.', 'Server još ne prima Dnevnik. U Supabase-u pokreni 0002_journal.sql.'],
    ['Check the server', 'Proveri server'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R42 shipped as 2.0.0-alpha.68 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 68);
});
