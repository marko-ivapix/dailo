// Redesign R43: Nalog → "Promeni lozinku" and "Promeni e-adresu" (point 3 of the next steps).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r43-account-changes.md
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
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clientFor = fake => Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
const WEAK = 'The password needs at least 8 characters, with a digit and a letter.';

test('client: a new password ends the other sessions; reauthentication and the current password when the server asks', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  const phone = clientFor(fake); const laptop = clientFor(fake);
  const { session } = await phone.signUp('ana@example.com', 'stara1234');
  const other = await laptop.signIn('ana@example.com', 'stara1234');
  await phone.updatePassword(session, 'nova12345');
  assert.equal(fake.passwordOf('ana@example.com'), 'nova12345');
  assert.ok((await phone.refresh(session)).accessToken, 'this device stays signed in');
  await assert.rejects(laptop.refresh(other), error => error.status === 400, 'the other devices sign in again');

  const strict = createFakeSupabase({ autoconfirm: true, reauthentication: true });
  const client = clientFor(strict);
  const own = (await client.signUp('mila@example.com', 'stara1234')).session;
  await assert.rejects(client.updatePassword(own, 'nova12345'), error => error.reason === 'reauthentication_needed');
  await client.reauthenticate(own);
  assert.deepEqual(strict.mail.map(item => item.kind), ['reauthentication']);
  await assert.rejects(client.updatePassword(own, 'nova12345', { nonce: '000000' }), error => error.message === 'The code is wrong or has expired.');
  await client.updatePassword(own, 'nova12345', { nonce: '123456' });
  assert.equal(strict.passwordOf('mila@example.com'), 'nova12345');

  const careful = createFakeSupabase({ autoconfirm: true, requireCurrentPassword: true });
  const third = clientFor(careful);
  const mine = (await third.signUp('iva@example.com', 'stara1234')).session;
  await assert.rejects(third.updatePassword(mine, 'nova12345'), error => error.reason === 'current_password_required');
  await assert.rejects(third.updatePassword(mine, 'nova12345', { currentPassword: 'pogresna1' }), error => error.message === 'The current password is not right.');
  await third.updatePassword(mine, 'nova12345', { currentPassword: 'stara1234' });
  assert.equal(careful.passwordOf('iva@example.com'), 'nova12345');
});

test('client: a new e-mail address is confirmed by codes, from both addresses when the server asks for both', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  const client = clientFor(fake);
  const { session } = await client.signUp('ana@example.com', 'tajna1234');
  await clientFor(fake).signUp('zauzeto@example.com', 'tajna1234');
  await assert.rejects(client.changeEmail(session, 'zauzeto@example.com'), error => error.reason === 'email_exists');
  await client.changeEmail(session, ' nova@example.com ');
  assert.deepEqual(fake.mail.map(item => [item.email, item.kind]), [['nova@example.com', 'email_change_new'], ['ana@example.com', 'email_change_current']]);
  assert.deepEqual(await client.verifyEmailChange('nova@example.com', '123456'), { pending: true }, 'one of two');
  const done = await client.verifyEmailChange('ana@example.com', '123456');
  assert.equal(done.session.user.email, 'nova@example.com');
  assert.ok((await client.signIn('nova@example.com', 'tajna1234')).accessToken);

  const simple = createFakeSupabase({ autoconfirm: true, secureEmailChange: false });
  const one = clientFor(simple);
  const own = (await one.signUp('mila@example.com', 'tajna1234')).session;
  await one.changeEmail(own, 'mila2@example.com');
  assert.deepEqual(simple.mail.map(item => item.kind), ['email_change_new']);
  assert.equal((await one.verifyEmailChange('mila2@example.com', '123456')).session.user.email, 'mila2@example.com');
});

// The windows, rendered by settings-ui.js.
function render(modalState) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'modal', modalType: modalState.type }, { modalState: { step: 'new', password: '', confirm: '', current: '', code: '', email: '', error: '', busy: false, ...modalState }, esc, modalFrame: (content, cls) => `<frame ${cls}>${content}` });
}

test('windows: "Promeni lozinku" with the current password or a code when needed, "Promeni e-adresu" in two steps', () => {
  const password = render({ type: 'account-password', currentEmail: 'ana@example.com' });
  assert.match(password, /^<frame quick><div class="modal-inner quick-sheet"><div class="modal-header"><h2 class="modal-title">Change the password<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><p class="dialog-copy">Other devices will need to sign in again\.<\/p><form class="account-form" data-account-form novalidate>/);
  assert.match(password, /<label class="sheet-field"><i class="ph ph-lock-simple" aria-hidden="true"><\/i><span>New password<\/span><input id="account-password" class="input" type="password" autocomplete="new-password" aria-describedby="account-password-hint" value="" \/><\/label><p class="sheet-note" id="account-password-hint">At least 8 characters, with a digit and a letter<\/p><label class="sheet-field"><i class="ph ph-lock-simple" aria-hidden="true"><\/i><span>Confirm password<\/span><input id="account-password-confirm" class="input" type="password" autocomplete="new-password" value="" \/><\/label>/);
  assert.match(password, /<div class="quick-sheet-footer"><button class="btn btn-primary habit-window-save" type="submit">Save the password<\/button><\/div><\/form><\/div>$/);
  assert.doesNotMatch(password, /account-current|account-code/);
  assert.match(render({ type: 'account-password', step: 'current' }), /<span>Current password<\/span><input id="account-current" class="input" type="password" autocomplete="current-password" value="" \/>/);
  const nonce = render({ type: 'account-password', step: 'nonce', currentEmail: 'ana@example.com', error: 'The code is wrong or has expired.', busy: true });
  assert.match(nonce, /<p class="sheet-note">We sent a code to ana@example\.com to confirm the change\.<\/p><label class="sheet-field"><i class="ph ph-key" aria-hidden="true"><\/i><span>Code from the e-mail<\/span><input id="account-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" value="" \/><\/label><p class="validation" role="alert">The code is wrong or has expired\.<\/p><div class="quick-sheet-footer"><button class="btn btn-primary habit-window-save" type="submit" disabled>/);

  const email = render({ type: 'account-email', step: 'email', currentEmail: 'ana@example.com' });
  assert.match(email, /<h2 class="modal-title">Change the e-mail address<\/h2>[\s\S]*<p class="dialog-copy">Current address: ana@example\.com<\/p><form class="account-form" data-account-form novalidate><label class="sheet-field"><i class="ph ph-envelope-simple" aria-hidden="true"><\/i><span>New e-mail address<\/span><input id="account-email" class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="" \/><\/label><div class="quick-sheet-footer"><button class="btn btn-primary habit-window-save" type="submit">Send code<\/button>/);
  const code = render({ type: 'account-email', step: 'code', currentEmail: 'ana@example.com', email: 'nova@example.com' });
  assert.match(code, /<p class="dialog-copy">We sent a code to nova@example\.com\. If the server also asks to confirm the current address, a code arrives there too\.<\/p>[\s\S]*id="account-code"[\s\S]*type="submit">Confirm<\/button>/);
  assert.match(render({ type: 'account-email', step: 'code', email: 'nova@example.com', pending: true }), /<p class="dialog-copy">One address is confirmed\. Enter the code from the other message\.<\/p>/);
});

test('Nalog: the password and e-mail rows when signed in', () => {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const html = adapter.renderRoute({ type: 'account' }, { state: { settings: {} }, esc, journalCipherStatus: () => 'off' /* R51 */, pageHeader: title => `<h1>${title}</h1>`, syncView: () => ({ configured: true, signedIn: true, email: 'ana@example.com', name: '', lastSyncAt: null, lastError: '' }) });
  assert.match(html, /<div class="settings-row"><div class="settings-label"><strong>Password<\/strong><span>Changing it signs out your other devices\.<\/span><\/div><button class="btn btn-secondary" type="button" data-action="account-change-password">Change<\/button><\/div><div class="settings-row"><div class="settings-label"><strong>E-mail address<\/strong><span>ana@example\.com<\/span><\/div><button class="btn btn-secondary" type="button" data-action="account-change-email">Change<\/button><\/div>/);
});

// The app's account block against the fake server.
function harness(fake, meta) {
  const start = app.indexOf('  // Optional sync (V2.0-a).');
  const end = app.indexOf('  function completeWeeklyReview(');
  const storage = new Map([['dailoSync', JSON.stringify(meta)]]);
  const calls = { toasts: [] };
  const context = withI18n({
    console, JSON, Date, Promise, Error, Object, Array, String, Number, Boolean, Set, Map, URL, URLSearchParams, Sync,
    syncClient: clientFor(fake), syncMeta: null, syncTimer: null, syncRunning: true, applyingSync: false, modalState: null, modalReturnFocus: null,
    state: { tasks: [] }, recovery: null, globalOperation: null, startupPromise: null, storageError: false, staleDataNotice: null,
    document: { activeElement: null }, nowIso: () => '2026-10-12T08:00:00.000Z',
    localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: run => run(),
    render() {}, renderModal() {}, closePopover() {}, captureModalReturnFocus() {}, restoreModalReturnFocus() {},
    setToastMessage(message) { calls.toasts.push(message); },
    inputs: {}, $: selector => { const id = selector.slice(1); return id in context.inputs ? { value: context.inputs[id] } : null; },
  });
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  return { context, calls, run: code => vm.runInContext(code, context), meta: () => JSON.parse(storage.get('dailoSync')), win: () => context.modalState };
}

test('app: a new password, with a code from the e-mail when the server asks for one', async () => {
  const fake = createFakeSupabase({ autoconfirm: true, reauthentication: true });
  const { session } = await clientFor(fake).signUp('ana@example.com', 'stara1234');
  const h = harness(fake, { userId: session.user.id, session });
  h.run("openAccountWindow('password')");
  assert.deepEqual([h.win().type, h.win().step, h.win().currentEmail], ['account-password', 'new', 'ana@example.com']);
  h.context.inputs = { 'account-password': 'kratko', 'account-password-confirm': 'kratko' };
  await h.run('accountSubmit()');
  assert.equal(h.win().error, WEAK);
  h.context.inputs = { 'account-password': 'nova12345', 'account-password-confirm': 'nova123456' };
  await h.run('accountSubmit()');
  assert.equal(h.win().error, 'The passwords do not match.');
  h.context.inputs['account-password-confirm'] = 'nova12345';
  await h.run('accountSubmit()');
  assert.deepEqual([h.win().step, h.win().error], ['nonce', ''], 'the server asked for a code');
  assert.deepEqual(fake.mail.map(item => item.kind), ['reauthentication']);
  h.context.inputs = { 'account-code': '123456' };
  await h.run('accountSubmit()');
  assert.equal(h.win(), null);
  assert.equal(fake.passwordOf('ana@example.com'), 'nova12345');
  assert.deepEqual(h.calls.toasts, ['Password changed. Other devices will sign in again.']);
});

test('app: a new e-mail address in two steps; the same address and a taken one are refused', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  const { session } = await clientFor(fake).signUp('ana@example.com', 'tajna1234');
  await clientFor(fake).signUp('zauzeto@example.com', 'tajna1234');
  const h = harness(fake, { userId: session.user.id, session, shadow: { 'tasks/x': 'h' } });
  h.run("openAccountWindow('email')");
  for (const [value, error] of [['nova@', 'Enter a valid e-mail address.'], ['ANA@example.com', 'This is already your e-mail address.'], ['zauzeto@example.com', 'Another account already uses this e-mail address.']]) {
    h.context.inputs = { 'account-email': value };
    await h.run('accountSubmit()');
    assert.equal(h.win().error, error, value);
  }
  h.context.inputs = { 'account-email': 'nova@example.com' };
  await h.run('accountSubmit()');
  assert.deepEqual([h.win().step, h.win().email], ['code', 'nova@example.com']);
  h.context.inputs = { 'account-code': '000000' };
  await h.run('accountSubmit()');
  assert.equal(h.win().error, 'The code is wrong or has expired.');
  h.context.inputs = { 'account-code': '123456' };
  await h.run('accountSubmit()');
  assert.deepEqual([h.win().pending, h.win().error], [true, ''], 'one address confirmed');
  await h.run('accountSubmit()');
  assert.equal(h.win(), null);
  assert.equal(h.meta().session.user.email, 'nova@example.com');
  assert.deepEqual(h.meta().shadow, { 'tasks/x': 'h' }, 'the same account keeps its shadow');
  assert.deepEqual(h.calls.toasts, ['E-mail address changed: nova@example.com']);
});

test('wiring and Serbian', () => {
  assert.ok(app.includes("else if (action === 'account-change-password') openAccountWindow('password');"));
  assert.ok(app.includes("else if (action === 'account-change-email') openAccountWindow('email');"));
  assert.match(app, /document\.addEventListener\('submit', event => \{\n      const form = event\.target\?\.closest\?\.\('\[data-welcome-form\], \[data-account-form\]'\);\n      if \(!form\) return;\n      event\.preventDefault\(\);\n      if \(form\.matches\('\[data-welcome-form\]'\)\) accountAction\('welcome-submit'\);\n      else accountSubmit\(\);\n    \}\);/); // R112: the welcome form is the account module's
  for (const [en, value] of [['Change the password', 'Promeni lozinku'], ['Change the e-mail address', 'Promeni e-adresu'], ['Other devices will need to sign in again.', 'Ostali uređaji će morati ponovo da se prijave.'], ['Current password', 'Trenutna lozinka'], ['The current password is not right.', 'Trenutna lozinka nije tačna.'], ['Another account already uses this e-mail address.', 'Drugi nalog već koristi ovu e-adresu.'], ['E-mail address changed: {email}', 'E-adresa je promenjena: {email}'], ['Change', 'Promeni']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R43 shipped as 2.0.0-alpha.69 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 69);
});
