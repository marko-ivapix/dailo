// Redesign R40: the welcome screen (first launch) and sign-in with an e-mail address and password, Google or Apple.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r40-welcome-sign-in.md
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
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const clientFor = fake => Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
const WEAK = 'The password needs at least 8 characters, with a digit and a letter.';

test('client: sign-up with a code from the e-mail, then sign-in with the password', async () => {
  const fake = createFakeSupabase();
  const client = clientFor(fake);
  assert.deepEqual(await client.signUp(' ana@example.com ', 'tajna123', { fullName: 'Ana Anić', termsAcceptedAt: '2026-10-12T08:00:00.000Z' }), { confirm: true });
  assert.deepEqual(fake.metadataOf('ana@example.com'), { full_name: 'Ana Anić', terms_accepted_at: '2026-10-12T08:00:00.000Z' });
  await assert.rejects(client.signIn('ana@example.com', 'tajna123'), error => error instanceof Sync.SyncError && error.status === 400 && error.reason === 'email_not_confirmed');
  await client.resendSignUp('ana@example.com');
  assert.deepEqual(fake.mail.map(item => item.kind), ['signup', 'signup']);
  const confirmed = await client.verifyCode('ana@example.com', '123456');
  assert.deepEqual(confirmed.user, { id: 'user-1', email: 'ana@example.com', name: 'Ana Anić' }, 'the session keeps the name');
  const session = await client.signIn('ana@example.com', 'tajna123');
  assert.ok(session.accessToken && session.refreshToken && session.expiresAt > fake.now());
  await assert.rejects(client.signIn('ana@example.com', 'pogresna1'), error => error.status === 400 && error.reason === 'invalid_credentials');
  await assert.rejects(client.signUp('ana@example.com', 'druga1234'), error => error.status === 422 && error.reason === 'user_already_exists', 'the stand-in user without identities');
  // A project that confirms automatically answers sign-up with a session, and a second sign-up with an error.
  const auto = createFakeSupabase({ autoconfirm: true });
  const result = await clientFor(auto).signUp('mila@example.com', 'tajna123');
  assert.equal(result.session.user.email, 'mila@example.com');
  await assert.rejects(clientFor(auto).signUp('mila@example.com', 'tajna123'), error => error.reason === 'user_already_exists');
});

test('client: a new password through a code from the e-mail', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  const client = clientFor(fake);
  await client.signUp('ana@example.com', 'stara1234');
  await client.requestPasswordReset('ana@example.com');
  assert.deepEqual(fake.mail.map(item => item.kind), ['recovery']);
  await assert.rejects(client.verifyRecovery('ana@example.com', '000000'), error => error.status === 403);
  const session = await client.verifyRecovery('ana@example.com', '123456');
  await client.updatePassword(session, 'nova12345');
  assert.equal(fake.passwordOf('ana@example.com'), 'nova12345');
  assert.ok((await client.signIn('ana@example.com', 'nova12345')).accessToken);
});

test('client: Google and Apple through PKCE, with the S256 challenge of RFC 7636', async () => {
  assert.equal(await Sync.codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const verifier = Sync.createCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9\-._~]{64}$/);
  assert.notEqual(Sync.createCodeVerifier(), verifier);
  const fake = createFakeSupabase();
  const client = clientFor(fake);
  assert.deepEqual((await client.authSettings()).external, { email: true, google: true, apple: false });
  const challenge = await Sync.codeChallenge(verifier);
  const url = new URL(client.authorizeUrl({ provider: 'google', redirectTo: 'dailo://auth', codeChallenge: challenge }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://fake.supabase.co/auth/v1/authorize');
  assert.deepEqual(Object.fromEntries(url.searchParams), { provider: 'google', redirect_to: 'dailo://auth', code_challenge: challenge, code_challenge_method: 's256' });
  const code = fake.providerRedirect({ provider: 'google', codeChallenge: challenge, email: 'ana@gmail.com' });
  await assert.rejects(client.exchangeCode(code, Sync.createCodeVerifier()), error => error.status === 400, 'another verifier is refused');
  const session = await client.exchangeCode(code, verifier);
  assert.equal(session.user.email, 'ana@gmail.com');
  await assert.rejects(client.exchangeCode(code, verifier), error => error.status === 400, 'a code works once');
});

test('the password rule: at least 8 characters with a digit and a letter', () => {
  for (const weak of ['kratko1', 'samoslova', '12345678', '']) assert.equal(Sync.passwordProblem(weak), WEAK, weak);
  for (const good of ['šifra123', 'Tajna2026', '1234567a']) assert.equal(Sync.passwordProblem(good), '', good);
  assert.ok(sr.includes(`${JSON.stringify(WEAK)}: "Lozinka mora imati najmanje 8 znakova, sa bar jednim brojem i slovom."`));
});

// The screen, rendered by settings-ui.js for the 'welcome' window.
function renderWelcome(fields) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const modalState = { type: 'welcome', mode: 'sign-in', name: '', email: '', password: '', confirm: '', code: '', terms: false, showPassword: false, busy: false, error: '', firstRun: true, ...fields };
  return adapter.renderRoute({ type: 'modal', modalType: 'welcome' }, {
    modalState, esc,
    modalFrame: (content, cls, attrs) => `<div class="modal-backdrop modal-backdrop-${cls}" data-action="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true" ${attrs}>${content}</section></div>`,
  });
}

test('screen: sign-in after the first mockup', () => {
  const html = renderWelcome({ email: 'ana@example.com' });
  assert.match(html, /<section class="modal welcome-screen" role="dialog" aria-modal="true" aria-labelledby="welcome-title">/);
  assert.match(html, /<div class="welcome-waves" aria-hidden="true"><\/div>/);
  assert.match(html, /<div class="welcome-brand"><img class="welcome-logo" src="icons\/icon\.svg" alt="" width="72" height="72" \/><p class="welcome-wordmark">Dailo<\/p><p class="welcome-tagline">Plan\. Focus\. Do more\.<\/p><\/div>/);
  assert.doesNotMatch(html, /welcome-back/, 'the first screen has no back button');
  assert.match(html, /<div class="welcome-intro"><h2 class="welcome-title" id="welcome-title">A more organized day<\/h2><p class="welcome-lead">Turn your goals into daily progress\.<\/p><\/div>/);
  assert.match(html, /<form class="welcome-form" data-welcome-form novalidate>/);
  assert.match(html, /<div class="welcome-field"><i class="ph ph-envelope-simple" aria-hidden="true"><\/i><label class="sr-only" for="welcome-email">E-mail address<\/label><input class="welcome-input" id="welcome-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="E-mail address" value="ana@example\.com" \/><\/div>/);
  assert.match(html, /<div class="welcome-field"><i class="ph ph-lock-simple" aria-hidden="true"><\/i><label class="sr-only" for="welcome-password">Password<\/label><input class="welcome-input" id="welcome-password" type="password" autocomplete="current-password" placeholder="Password" value="" \/><button class="welcome-eye" type="button" data-action="welcome-toggle-password" aria-label="Show password" aria-pressed="false"><i class="ph ph-eye" aria-hidden="true"><\/i><\/button><\/div>/);
  assert.match(html, /<button class="welcome-link" type="button" data-action="welcome-mode" data-mode="reset">Forgot password\?<\/button>/);
  assert.match(html, /<button class="btn btn-primary welcome-submit" type="submit">Log in<\/button><\/form>/);
  assert.match(html, /<p class="welcome-divider">or continue with<\/p><div class="welcome-providers"><button class="welcome-provider" type="button" data-action="welcome-provider" data-provider="apple" aria-label="Continue with Apple"><i class="ph-fill ph-apple-logo" aria-hidden="true"><\/i><\/button><button class="welcome-provider" type="button" data-action="welcome-provider" data-provider="google" aria-label="Continue with Google"><img src="icons\/google\.svg" alt="" width="24" height="24" \/><\/button><\/div>/);
  assert.match(html, /<button class="welcome-switch" type="button" data-action="welcome-mode" data-mode="sign-up"><span>No account yet\?<\/span> <strong>Sign up<\/strong><\/button>/);
  assert.match(html, /<button class="welcome-skip" type="button" data-action="welcome-skip">Continue without an account<\/button><p class="welcome-note">Without an account, everything stays only on this device\.<\/p>/);
  assert.doesNotMatch(html, /discord/i);
  // The eye shows the password; an error and a request in flight show under the fields.
  const shown = renderWelcome({ showPassword: true, password: 'a"b', error: 'Wrong e-mail address or password.', busy: true });
  assert.match(shown, /id="welcome-password" type="text" autocomplete="current-password" placeholder="Password" value="a&quot;b" \/><button class="welcome-eye" type="button" data-action="welcome-toggle-password" aria-label="Hide password" aria-pressed="true"><i class="ph ph-eye-slash"/);
  assert.match(shown, /<p class="validation" role="alert">Wrong e-mail address or password\.<\/p><button class="btn btn-primary welcome-submit" type="submit" disabled>Log in<\/button>/);
});

test('screen: registration after the second mockup', () => {
  const html = renderWelcome({ mode: 'sign-up', name: 'Ana', email: 'ana@example.com', terms: true });
  assert.match(html, /^<div class="modal-backdrop modal-backdrop-welcome-screen" data-action="modal-backdrop"><section class="modal welcome-screen"[^>]*><div class="welcome-waves" aria-hidden="true"><\/div><div class="welcome-column"><button class="welcome-back" type="button" data-action="welcome-mode" data-mode="sign-in" aria-label="Back to sign-in"><i class="ph ph-caret-left" aria-hidden="true"><\/i><\/button><div class="welcome-brand">/);
  assert.match(html, /<div class="welcome-intro is-left"><h2 class="welcome-title" id="welcome-title">Create your account<\/h2><p class="welcome-lead">A more organized day starts here\.<\/p><\/div>/);
  assert.match(html, /<i class="ph ph-user" aria-hidden="true"><\/i><label class="sr-only" for="welcome-name">Full name<\/label><input class="welcome-input" id="welcome-name" type="text" autocomplete="name" placeholder="Full name" value="Ana" \/>/);
  assert.match(html, /id="welcome-password" type="password" autocomplete="new-password" aria-describedby="welcome-password-hint" placeholder="Password" value="" \/>/);
  assert.match(html, /<p class="welcome-hint" id="welcome-password-hint">At least 8 characters, with a digit and a letter<\/p>/);
  assert.match(html, /<label class="sr-only" for="welcome-password-confirm">Confirm password<\/label><input class="welcome-input" id="welcome-password-confirm" type="password" autocomplete="new-password" placeholder="Confirm password" value="" \/><button class="welcome-eye"/);
  assert.match(html, /<label class="welcome-terms"><input id="welcome-terms" type="checkbox" checked \/><span>I accept <a href="uslovi\.html" target="_blank" rel="noopener">the Terms of Use<\/a> and <a href="privatnost\.html" target="_blank" rel="noopener">the Privacy Policy<\/a><\/span><\/label>/);
  assert.match(html, /<button class="btn btn-primary welcome-submit" type="submit">Create account<\/button>/);
  assert.match(html, /<button class="welcome-provider is-wide" type="button" data-action="welcome-provider" data-provider="apple" aria-label="Continue with Apple"><i class="ph-fill ph-apple-logo" aria-hidden="true"><\/i><span>Apple<\/span><\/button><button class="welcome-provider is-wide" type="button" data-action="welcome-provider" data-provider="google" aria-label="Continue with Google"><img src="icons\/google\.svg" alt="" width="24" height="24" \/><span>Google<\/span><\/button>/);
  assert.match(html, /<button class="welcome-switch" type="button" data-action="welcome-mode" data-mode="sign-in"><span>Already have an account\?<\/span> <strong>Log in<\/strong><\/button>/);
  assert.doesNotMatch(html, /welcome-skip|data-mode="reset"/);
});

test('screen: the code to confirm an account, and a new password in two steps', () => {
  const confirm = renderWelcome({ mode: 'confirm', email: 'ana@example.com' });
  assert.match(confirm, /<h2 class="welcome-title" id="welcome-title">Confirm your e-mail address<\/h2><p class="welcome-lead">We sent a code to ana@example\.com\.<\/p>/);
  assert.match(confirm, /<i class="ph ph-key" aria-hidden="true"><\/i><label class="sr-only" for="welcome-code">Code from the e-mail<\/label><input class="welcome-input" id="welcome-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code from the e-mail" value="" \/>/);
  assert.match(confirm, /<button class="btn btn-primary welcome-submit" type="submit">Confirm<\/button><\/form><button class="welcome-link is-centered" type="button" data-action="welcome-resend">Send a new code<\/button><p class="welcome-note">The link in the message confirms the account too; then sign in\.<\/p>/);
  assert.match(confirm, /class="welcome-back"/);
  assert.doesNotMatch(confirm, /welcome-provider|id="welcome-email"|id="welcome-password"/);
  const reset = renderWelcome({ mode: 'reset', email: 'ana@example.com' });
  assert.match(reset, /id="welcome-title">New password<\/h2><p class="welcome-lead">Enter your e-mail address and we will send you a code\.<\/p>/);
  assert.match(reset, /id="welcome-email"[^>]*value="ana@example\.com" \/>[\s\S]*<button class="btn btn-primary welcome-submit" type="submit">Send code<\/button>/);
  assert.doesNotMatch(reset, /id="welcome-password"/);
  const code = renderWelcome({ mode: 'reset-code', email: 'ana@example.com' });
  assert.match(code, /We sent a code to ana@example\.com\./);
  assert.match(code, /id="welcome-code"[\s\S]*id="welcome-password" type="password" autocomplete="new-password" aria-describedby="welcome-password-hint" placeholder="New password"[\s\S]*id="welcome-password-confirm"/);
  assert.match(code, /type="submit">Save the password<\/button><\/form><button class="welcome-link is-centered" type="button" data-action="welcome-resend">Send a new code<\/button>/);
});

// The app's sign-in block (from its marker to completeWeeklyReview) against the fake server.
function harness({ fake = createFakeSupabase(), meta = null, storage: entries = [], native = false } = {}) {
  const start = app.indexOf('  // Optional sync (V2.0-a).');
  const end = app.indexOf('  function completeWeeklyReview(');
  const storage = new Map([...(meta ? [['dailoSync', JSON.stringify(meta)]] : []), ...entries]);
  const calls = { renders: 0, modals: 0, toasts: [], assigned: [], opened: [], closedBrowser: 0, replaced: [] };
  const context = {
    console, JSON, Date, Promise, Error, Object, Array, String, Number, Boolean, Set, Map, URL, URLSearchParams,
    Sync, syncClient: clientFor(fake), syncMeta: null, syncTimer: null, syncRunning: false, applyingSync: false, liveSync: null /* R50 */,
    state: { version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} },
    recovery: null, globalOperation: null, startupPromise: null, storageError: false, staleDataNotice: null,
    modalState: null, undoState: null, undoHold: null, textSaveTimer: null, dragState: null, modalReturnFocus: null,
    // R110: the drag state lives in js/drag-ui.js; syncWaiting asks it through callDomainHook('isDragging').
    callDomainHook: hook => (hook === 'isDragging' ? Boolean(context.dragState) : undefined),
    document: { activeElement: null },
    localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: run => run(),
    TodoStorage: { habitLogs: { listAll: async () => [], deleteMany: async () => {}, put: async () => {} }, attachments: { listAll: async () => [] }, createAutomaticSnapshot: async () => 'snap' },
    normalizeState: value => clone(value),
    Core: { pruneDanglingReferences: require('../js/core.js').pruneDanglingReferences, settleArrivedReminders: require('../js/core.js').settleArrivedReminders },
    nowIso: () => '2026-10-12T08:00:00.000Z',
    saveState: () => true, refreshHabitMetrics: async () => {},
    render() { calls.renders += 1; }, renderModal() { calls.modals += 1; }, closePopover() {},
    // R80: a sync state change refreshes the tab's dot and the sidebar line.
    renderMobileBottomNav() {}, renderSidebar() {}, captureModalReturnFocus() {}, restoreModalReturnFocus() {}, closeModal() { context.modalState = null; },
    currentRoute: () => ({ type: 'today' }), openConfirm() {},
    setToastMessage(message) { calls.toasts.push(message); },
    inputs: {},
    $: selector => { const id = selector.slice(1); return id in context.inputs ? { value: context.inputs[id], checked: context.inputs[id] === true } : null; },
    location: { origin: 'https://marko-ivapix.github.io', pathname: '/dailo/', search: '', hash: '#today', assign(url) { calls.assigned.push(url); } },
    history: { replaceState(data, title, url) { calls.replaced.push(url); } },
    DailoPlatform: native ? { isNative: true, links: { openExternal(url) { calls.opened.push(url); }, closeExternal() { calls.closedBrowser += 1; } } } : { isNative: false, links: {} },
    modalFrame: content => content, esc,
  };
  vm.createContext(withI18n(context));
  vm.runInContext(app.slice(start, end), context);
  const run = code => vm.runInContext(code, context);
  return { context, storage, calls, fake, run, meta: () => JSON.parse(storage.get('dailoSync') || '{}'), welcome: () => context.modalState };
}

test('when: the first start opens the screen once; closing it or "Nastavi bez naloga" remembers that on this device', () => {
  const h = harness();
  assert.equal(h.run('welcomeDue()'), true);
  h.run('startWelcome()');
  assert.deepEqual([h.welcome().type, h.welcome().mode, h.welcome().firstRun], ['welcome', 'sign-in', true]);
  // Back or Escape from registration steps back to sign-in first, then closes like "Nastavi bez naloga".
  h.run("setWelcome({ mode: 'sign-up' })");
  h.run('modalState.onCancel()');
  assert.equal(h.welcome().mode, 'sign-in');
  assert.equal(h.storage.get('dailoWelcome'), undefined);
  h.run('modalState.onCancel()');
  assert.equal(h.welcome(), null);
  assert.equal(h.storage.get('dailoWelcome'), '1');
  assert.equal(h.run('welcomeDue()'), false);
  // "Nastavi bez naloga" does the same.
  const skip = harness();
  skip.run('startWelcome()');
  skip.run('skipWelcome()');
  assert.deepEqual([skip.welcome(), skip.storage.get('dailoWelcome')], [null, '1']);
  // From Nalog, closing it returns there and sets nothing.
  const nalog = harness();
  nalog.run("openWelcome('sign-up')");
  assert.deepEqual([nalog.welcome().mode, nalog.welcome().firstRun], ['sign-up', false]);
  nalog.run('modalState.onCancel()'); nalog.run('modalState.onCancel()');
  assert.deepEqual([nalog.welcome(), nalog.storage.get('dailoWelcome')], [null, undefined]);
  // Not when signed in, not without sync, not over another window or recovery.
  assert.equal(harness({ meta: { session: { accessToken: 'x' } } }).run('welcomeDue()'), false);
  const unset = harness(); unset.context.syncClient = null; assert.equal(unset.run('welcomeDue()'), false);
  const busy = harness(); busy.context.modalState = { type: 'quick' }; busy.run('startWelcome()'); assert.equal(busy.welcome().type, 'quick');
  const broken = harness(); broken.context.recovery = {}; broken.run('startWelcome()'); assert.equal(broken.welcome(), null);
});

test('sign-in: checks the fields, says when the password is wrong, then signs in and syncs', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  await clientFor(fake).signUp('ana@example.com', 'tajna1234', { fullName: 'Ana Anić' });
  const h = harness({ fake, meta: { userId: 'someone-else', shadow: { 'tasks/x': 'h' } } });
  h.run('startWelcome()');
  Object.assign(h.context.inputs, { 'welcome-email': 'ana@', 'welcome-password': '' });
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'Enter a valid e-mail address.');
  h.context.inputs['welcome-email'] = ' ana@example.com ';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'Enter your password.');
  h.context.inputs['welcome-password'] = 'pogresna1';
  await h.run('welcomeSubmit()');
  assert.deepEqual([h.welcome().error, h.welcome().busy, h.welcome().email], ['Wrong e-mail address or password.', false, 'ana@example.com']);
  h.context.inputs['welcome-password'] = 'tajna1234';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome(), null, 'the screen closes');
  const meta = h.meta();
  assert.deepEqual([meta.session.user.email, meta.session.user.name], ['ana@example.com', 'Ana Anić']);
  assert.equal(meta.shadow['tasks/x'], undefined, 'another account starts from a fresh shadow');
  assert.ok(meta.lastSyncAt, 'the first sync runs after sign-in');
  assert.equal(h.storage.get('dailoWelcome'), '1');
  assert.deepEqual(h.calls.toasts, ['Signed in: ana@example.com']);
});

test('sign-up: the password rule, matching passwords and the terms, then the code from the e-mail', async () => {
  const fake = createFakeSupabase();
  const h = harness({ fake });
  h.run("openWelcome('sign-up')");
  Object.assign(h.context.inputs, { 'welcome-name': ' Ana Anić ', 'welcome-email': 'ana@example.com', 'welcome-password': 'kratko', 'welcome-password-confirm': 'kratko', 'welcome-terms': false });
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, WEAK);
  Object.assign(h.context.inputs, { 'welcome-password': 'tajna1234', 'welcome-password-confirm': 'tajna12345' });
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'The passwords do not match.');
  h.context.inputs['welcome-password-confirm'] = 'tajna1234';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'Accept the Terms of Use and the Privacy Policy to continue.');
  h.context.inputs['welcome-terms'] = true;
  await h.run('welcomeSubmit()');
  assert.deepEqual([h.welcome().mode, h.welcome().error, h.welcome().name], ['confirm', '', 'Ana Anić']);
  assert.deepEqual(fake.metadataOf('ana@example.com'), { full_name: 'Ana Anić', terms_accepted_at: '2026-10-12T08:00:00.000Z' });
  await h.run('welcomeResend()');
  assert.deepEqual(fake.mail.map(item => item.kind), ['signup', 'signup']);
  assert.deepEqual(h.calls.toasts, ['A new code was sent.']);
  h.context.inputs = { 'welcome-code': '12' };
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'Enter the code from the e-mail.');
  h.context.inputs['welcome-code'] = '000000';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'The code is wrong or has expired.');
  h.context.inputs['welcome-code'] = '123 456';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome(), null);
  assert.equal(h.meta().session.user.name, 'Ana Anić');
});

test('sign-up and sign-in send each other the cases they cannot finish', async () => {
  const fake = createFakeSupabase();
  await clientFor(fake).signUp('ana@example.com', 'tajna1234');
  const h = harness({ fake });
  h.run('startWelcome()');
  Object.assign(h.context.inputs, { 'welcome-email': 'ana@example.com', 'welcome-password': 'tajna1234' });
  await h.run('welcomeSubmit()');
  assert.deepEqual([h.welcome().mode, h.welcome().error], ['confirm', 'Confirm the e-mail address first. We sent a new code.'], 'an unconfirmed address gets a new code');
  assert.deepEqual(fake.mail.map(item => item.kind), ['signup', 'signup']);
  await clientFor(fake).verifyCode('ana@example.com', '123456');
  h.run("welcomeMode('sign-up')");
  assert.deepEqual([h.welcome().mode, h.welcome().email, h.welcome().password], ['sign-up', 'ana@example.com', ''], 'the address carries over, the password does not');
  Object.assign(h.context.inputs, { 'welcome-email': 'ana@example.com', 'welcome-password': 'druga12345', 'welcome-password-confirm': 'druga12345', 'welcome-terms': true });
  await h.run('welcomeSubmit()');
  assert.deepEqual([h.welcome().mode, h.welcome().error], ['sign-in', 'An account with this e-mail address already exists. Sign in.']);
});

test('a forgotten password: the code, a new password, and the user is signed in', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  await clientFor(fake).signUp('ana@example.com', 'stara1234');
  const h = harness({ fake });
  h.run('startWelcome()');
  h.context.inputs = { 'welcome-email': 'ana@example.com', 'welcome-password': '' };
  h.run("welcomeMode('reset')");
  h.context.inputs = { 'welcome-email': 'ana@example.com' };
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().mode, 'reset-code');
  h.context.inputs = { 'welcome-code': '123456', 'welcome-password': 'nova1234', 'welcome-password-confirm': 'nova12345' };
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome().error, 'The passwords do not match.');
  h.context.inputs['welcome-password-confirm'] = 'nova1234';
  await h.run('welcomeSubmit()');
  assert.equal(h.welcome(), null);
  assert.equal(fake.passwordOf('ana@example.com'), 'nova1234');
  assert.deepEqual(h.calls.toasts, ['Password saved. Signed in: ana@example.com']);
});

test('Google and Apple: a provider that is off says so; the web leaves and comes back with ?code=', async () => {
  const fake = createFakeSupabase();
  const h = harness({ fake });
  h.run('startWelcome()');
  await h.run("startProviderSignIn('apple')");
  assert.deepEqual([h.welcome().error, h.calls.assigned.length], ['Sign-in with Apple is not turned on yet.', 0]);
  await h.run("startProviderSignIn('google')");
  const url = new URL(h.calls.assigned[0]);
  assert.equal(url.searchParams.get('redirect_to'), 'https://marko-ivapix.github.io/dailo/');
  const pending = h.meta().pkce;
  assert.equal(pending.provider, 'google');
  assert.equal(url.searchParams.get('code_challenge'), await Sync.codeChallenge(pending.verifier));
  // The page comes back with ?code=; the address is cleaned and the code becomes a session.
  const back = harness({ fake, meta: h.meta() });
  back.context.location.search = `?code=${fake.providerRedirect({ provider: 'google', codeChallenge: url.searchParams.get('code_challenge'), email: 'ana@gmail.com' })}`;
  await back.run('startWelcome()'); // it returns the sign-in in flight
  assert.deepEqual(back.calls.replaced, ['/dailo/#today']);
  assert.equal(back.meta().session.user.email, 'ana@gmail.com');
  assert.equal(back.meta().pkce, undefined, 'the verifier is used once');
  assert.equal(back.welcome(), null);
  assert.equal(back.storage.get('dailoWelcome'), '1');
  // A ?code= that Dailo did not ask for is left alone.
  const stray = harness({ fake });
  stray.context.location.search = '?code=abc';
  stray.run('startWelcome()');
  assert.deepEqual([stray.calls.replaced, stray.welcome().type], [[], 'welcome']);
});

test('Google in the phone app: the system browser, dailo://auth, and a refusal shown on the screen', async () => {
  const fake = createFakeSupabase();
  const h = harness({ fake, native: true });
  h.run('startWelcome()');
  await h.run("startProviderSignIn('google')");
  const url = new URL(h.calls.opened[0]);
  assert.equal(url.searchParams.get('redirect_to'), 'dailo://auth');
  assert.equal(h.calls.assigned.length, 0, 'the WebView never leaves Dailo');
  assert.equal(h.welcome().busy, false);
  await h.run("finishProviderSignIn(new URLSearchParams('error=access_denied&error_description=The+user+said+no'))");
  assert.deepEqual([h.welcome().type, h.welcome().error], ['welcome', 'Sign-in did not finish: The user said no']);
  assert.equal(h.calls.closedBrowser, 1, 'the browser sheet closes');
  assert.equal(h.meta().pkce, undefined);
  const code = fake.providerRedirect({ provider: 'google', codeChallenge: 'unknown', email: 'ana@gmail.com' });
  await h.run(`finishProviderSignIn(new URLSearchParams('code=${code}'))`);
  assert.equal(h.welcome().error, 'Sign-in did not finish. Try again.', 'no verifier on this device');
  // The app's link handler hands dailo://auth to the sign-in before it closes any window.
  const link = fn('handleIncomingLink');
  // R58: dailo://auth counts only while this device has a sign-in pending.
  assert.match(link, /if \(target === 'auth'\) \{ if \(!loadSyncMeta\(\)\.pkce\) return false; finishProviderSignIn\(link\.searchParams\); return true; \}\n    closePopover\(\);/);
  assert.match(link, /\['new-task', 'today', 'journal', 'share', 'auth'(, '[a-z-]+')*\]\.includes\(target\)/);
  assert.match(link, /if \(modalState\?\.type === 'welcome'\) dismissWelcome\(\);\n    else if \(modalState\) \{ flushTextSave\(\); closeModal\(\); \}/, 'a shortcut puts the screen away without answering it');
  assert.match(read('js/platform.js'), /function closeExternal\(\) \{\n      if \(!isNative\) return;\n      Promise\.resolve\(plugin\('Browser'\)\?\.close\?\.\(\)\)/);
  assert.match(read('js/platform.js'), /links: Object\.freeze\(\{ openExternal, closeExternal, interceptExternalLinks, onAppLink \}\)/);
});

test('wiring: start, the form, the actions, Nalog and the old e-mail code', () => {
  assert.match(fn('init'), /startPlatform\(\);\n    startWelcome\(\);/);
  // The first start replaces an empty address with #today; that change of address must not close the screen.
  assert.ok(app.includes("window.addEventListener('hashchange', () => { closePopover(); if (!['sync-choice', 'welcome'].includes(modalState?.type)) closeModal(); render(); });"));
  // R43: the account sheets share the listener.
  assert.match(app, /document\.addEventListener\('submit', event => \{\n      const form = event\.target\?\.closest\?\.\('\[data-welcome-form\], \[data-account-form\]'\);\n      if \(!form\) return;\n      event\.preventDefault\(\);\n      if \(form\.matches\('\[data-welcome-form\]'\)\) welcomeSubmit\(\);/);
  for (const [action, call] of [['open-welcome', 'openWelcome(el.dataset.mode)'], ['welcome-mode', 'welcomeMode(el.dataset.mode)'], ['welcome-skip', 'skipWelcome()'], ['welcome-provider', 'startProviderSignIn(el.dataset.provider)'], ['welcome-resend', 'welcomeResend()'], ['welcome-toggle-password', 'toggleWelcomePassword()']]) {
    assert.ok(app.includes(`else if (action === '${action}') ${call};`), action);
  }
  for (const gone of ['function requestSyncCode', 'function verifySyncCode', "'sync-request-code'", "'sync-change-email'", 'syncUi']) assert.ok(!app.includes(gone), gone);
  assert.match(fn('syncView'), /name: meta\.session\?\.user\?\.name \|\| ''/);
  // Nalog without a sign-in offers the same screen.
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const account = view => adapter.renderRoute({ type: 'account' }, { state: { settings: {} }, esc, journalCipherStatus: () => 'off' /* R51 */, pageHeader: (title, subtitle) => `<h1>${title}</h1><p>${subtitle}</p>`, syncView: () => view });
  const out = account({ configured: true, signedIn: false });
  assert.match(out, /<p class="area-empty-copy">Sign in to have your tasks, habits and goals on all your devices\. Without an account, everything stays only on this device\.<\/p>\s*<div class="sync-actions"><button class="btn btn-primary" type="button" data-action="open-welcome" data-mode="sign-in">Log in<\/button><button class="btn btn-secondary" type="button" data-action="open-welcome" data-mode="sign-up">Create account<\/button><\/div>/);
  assert.doesNotMatch(out, /sync-email|Send code/);
  const signedIn = account({ configured: true, signedIn: true, email: 'ana@example.com', name: 'Ana Anić', lastSyncAt: null, lastError: '' });
  assert.match(signedIn, /<strong>Account<\/strong><span>Ana Anić · ana@example\.com<\/span>/);
});

test('links back into the app, the Google mark and the terms pages', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<intent-filter>\n                <action android:name="android\.intent\.action\.VIEW" \/>\n                <category android:name="android\.intent\.category\.DEFAULT" \/>\n                <category android:name="android\.intent\.category\.BROWSABLE" \/>\n                <data android:scheme="dailo" android:host="auth" \/>\n            <\/intent-filter>/);
  assert.match(read('ios/App/App/Info.plist'), /<key>CFBundleURLTypes<\/key>\s*<array>\s*<dict>\s*<key>CFBundleURLName<\/key>\s*<string>cloud\.ivapix\.dailo<\/string>\s*<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>dailo<\/string>\s*<\/array>\s*<\/dict>\s*<\/array>/);
  assert.match(read('icons/google.svg'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48"/);
  const worker = read('sw.js');
  assert.ok(worker.includes("'icons/google.svg',"), 'the Google mark works offline');
  for (const page of ['uslovi.html', 'privatnost.html']) {
    const html = read(page);
    assert.match(html, /<html lang="sr-Latn">/, page);
    assert.ok(html.includes(Release.REPORT_EMAIL), `${page} names the contact address`);
    assert.ok(!worker.includes(`'${page}'`), `${page} opens online, like the guide`);
  }
  assert.match(read('privatnost.html'), /Supabase/);
  assert.equal(Release.TERMS_URL, 'https://marko-ivapix.github.io/dailo/uslovi.html');
  assert.equal(Release.PRIVACY_URL, 'https://marko-ivapix.github.io/dailo/privatnost.html');
  // R73 added Česta pitanja and R81 Šta je novo to the pages the phone app opens online.
  assert.match(fn('startPlatform'), /onlinePages: \{ 'uputstvo\.html': Release\.GUIDE_URL, 'uslovi\.html': Release\.TERMS_URL, 'privatnost\.html': Release\.PRIVACY_URL, 'pitanja\.html': Release\.FAQ_URL, 'novo\.html': Release\.WHATS_NEW_URL \}/);
});

test('style: a full screen above the bottom bar, in tokens only', () => {
  assert.match(css, /\.modal-backdrop-welcome-screen \{ padding: 0; place-items: stretch; background: var\(--graphite-900\); \}/);
  assert.match(css, /\.modal\.welcome-screen \{ position: relative; width: 100%; max-width: none; min-height: var\(--viewport-height\); max-height: none;/);
  assert.match(css, /\.welcome-waves \{[^}]*var\(--accent-tint\)[^}]*var\(--blue-tint\)/);
  assert.match(css, /\.welcome-input \{[^}]*font-size: var\(--text-input\);/, 'fields stay at 16 px so phones do not zoom');
  assert.match(css, /\.welcome-provider \{[^}]*min-height: 56px;/);
});

test('Serbian: the screen speaks Serbian, without gendered forms', () => {
  for (const [en, value] of [
    ['Plan. Focus. Do more.', 'Planiraj. Fokusiraj se. Uradi više.'], ['A more organized day', 'Organizovaniji dan'], ['Turn your goals into daily progress.', 'Pretvori ciljeve u svakodnevni napredak.'],
    ['Log in', 'Prijavi se'], ['Forgot password?', 'Zaboravljena lozinka?'], ['or continue with', 'ili nastavi sa'], ['No account yet?', 'Nemaš nalog?'], ['Sign up', 'Registruj se'],
    ['Continue without an account', 'Nastavi bez naloga'], ['Create your account', 'Napravi svoj nalog'], ['A more organized day starts here.', 'Organizovaniji dan počinje ovde.'],
    ['Full name', 'Ime i prezime'], ['Confirm password', 'Potvrdi lozinku'], ['Create account', 'Napravi nalog'], ['Already have an account?', 'Već imaš nalog?'],
    ['I accept {terms} and {privacy}', 'Prihvatam {terms} i {privacy}'], ['the Terms of Use', 'Uslove korišćenja'], ['the Privacy Policy', 'Politiku privatnosti'],
    ['Wrong e-mail address or password.', 'Pogrešna e-adresa ili lozinka.'], ['Signed in: {email}', 'Prijava je uspela: {email}'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R40 shipped as 2.0.0-alpha.66 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 66);
});
