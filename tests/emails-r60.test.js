// R60: the links in the account e-mails lead to Dailo, not to localhost. The app tells Supabase where to send them
// (redirect_to), the landing page says what happened without ever taking the session from the address, and Serbian
// templates with the code are ready to paste into the dashboard.
// Spec: docs/superpowers/specs/2026-10-12-r60-email-links.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const APP_URL = 'https://marko-ivapix.github.io/dailo/';

test('the app tells Supabase where the e-mail links go: sign-up, a new code, a new password and a new address', async () => {
  assert.equal(Release.APP_URL, APP_URL);
  const fake = createFakeSupabase();
  const seen = [];
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, now: fake.now, emailRedirect: Release.APP_URL, fetch: (url, init) => { seen.push(`${init?.method || 'GET'} ${url}`); return fake.fetch(url, init); } });
  await client.signUp('ana@example.com', 'lozinka123');
  await client.resendSignUp('ana@example.com');
  await client.requestPasswordReset('ana@example.com');
  const redirect = `redirect_to=${encodeURIComponent(APP_URL)}`;
  for (const route of ['/auth/v1/signup', '/auth/v1/resend', '/auth/v1/recover']) {
    assert.ok(seen.some(line => line.startsWith('POST ') && line.includes(`${route}?${redirect}`)), route);
  }
  assert.match(read('js/sync.js'), /async changeEmail\(session, email\) \{\n\s+await request\(withRedirect\('\/auth\/v1\/user'\), \{ method: 'PUT'/);
  const plain = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, now: fake.now, fetch: (url, init) => { seen.push(`${init?.method || 'GET'} ${url}`); return fake.fetch(url, init); } });
  seen.length = 0;
  await plain.requestPasswordReset('ana@example.com');
  assert.ok(seen.some(line => line.endsWith('/auth/v1/recover')), 'without the option the address stays as before');
  assert.match(read('js/app.js'), /Sync\.createClient\(\{ url: syncConfig\.url, anonKey: syncConfig\.anonKey, emailRedirect: Release\.APP_URL \}\)/);
});

test('the landing reads only what happened from the address', () => {
  const tokens = 'access_token=eyJ.x.y&expires_in=3600&refresh_token=r&token_type=bearer';
  assert.deepEqual(Sync.authLanding(`#${tokens}&type=signup`), { kind: 'confirmed' });
  assert.deepEqual(Sync.authLanding(`#${tokens}&type=invite`), { kind: 'confirmed' });
  assert.deepEqual(Sync.authLanding(`#${tokens}&type=email_change`), { kind: 'email' });
  assert.deepEqual(Sync.authLanding(`#${tokens}&type=recovery`), { kind: 'recovery' });
  assert.deepEqual(Sync.authLanding('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), { kind: 'expired' });
  assert.deepEqual(Sync.authLanding('?error=server_error&error_description=x'), { kind: 'failed' });
  for (const other of ['', '#today', '#project/p1', '?shortcut=today', '#type=signup']) assert.equal(Sync.authLanding(other), null, other);
});

test('the app cleans the address, says what happened in Serbian, and never uses the session in the link', () => {
  const landing = functionSource('consumeAuthLanding').source;
  assert.doesNotMatch(landing, /access_token|refresh_token|toSession|saveSyncMeta/, 'a link from someone else cannot sign this device in');
  assert.match(landing, /const landing = Sync\?\.authLanding\?\.\(location\.hash\) \|\| \(loadSyncMeta\(\)\.pkce \? null : Sync\?\.authLanding\?\.\(location\.search\)\);/);
  assert.match(landing, /history\.replaceState\(null, '', location\.pathname\);/);
  assert.match(landing, /setToastMessage\(tr\(AUTH_LANDING_MESSAGES\[landing\.kind\]\)\);/);
  assert.match(landing, /if \(landing\.kind === 'confirmed' && syncClient && !loadSyncMeta\(\)\.session\?\.accessToken\) openWelcome\('sign-in'\);/);
  assert.match(functionSource('startWelcome').source, /if \(consumeAuthLanding\(\)\) return true;/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Your e-mail address is confirmed. Sign in with your password.', 'E-adresa je potvrđena. Prijavi se svojom lozinkom.'],
    ['Your new e-mail address is confirmed.', 'Nova e-adresa je potvrđena.'],
    ['For a new password, use the code from the e-mail: Sign in → Forgot password?', 'Za novu lozinku upiši kod iz e-poruke: Prijava → Zaboravljena lozinka?'],
    ['The link has expired or was already used. Ask for a new code in Dailo.', 'Link je istekao ili je već iskorišćen. Zatraži novi kod u Dailu.'],
    ['The link did not work. Ask for a new code in Dailo.', 'Link nije uspeo. Zatraži novi kod u Dailu.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('Serbian templates with the code, ready to paste, and a guide that explains localhost', () => {
  const templates = {
    'confirm-signup.html': 'Dailo — potvrdi nalog',
    'reset-password.html': 'Dailo — nova lozinka',
    'change-email.html': 'Dailo — nova e-adresa',
    'reauthentication.html': 'Dailo — potvrdi promenu lozinke',
  };
  for (const [file, subject] of Object.entries(templates)) {
    const html = read(`supabase/templates/${file}`);
    assert.ok(html.startsWith(`<!-- Subject: ${subject} -->\n`), `${file}: subject line`);
    assert.match(html, /\{\{ \.Token \}\}/, `${file}: the code`);
    assert.doesNotMatch(html, /localhost|<script|<style|class="/i, `${file}: inline styles only, no localhost`);
    assert.match(html, /Ako ovaj zahtev nije poslat sa tvog uređaja, zanemari ovu poruku\./, `${file}: the safety note`);
  }
  assert.match(read('supabase/templates/confirm-signup.html'), /href="\{\{ \.ConfirmationURL \}\}"/);
  for (const file of ['reset-password.html', 'change-email.html', 'reauthentication.html']) assert.doesNotMatch(read(`supabase/templates/${file}`), /ConfirmationURL/, `${file}: the code only`);
  const guide = read('docs/v2/podesavanje-supabase.md');
  for (const part of ['supabase/templates/confirm-signup.html', 'supabase/templates/reset-password.html', 'supabase/templates/change-email.html', 'supabase/templates/reauthentication.html', 'localhost', 'Site URL']) assert.ok(guide.includes(part), part);
});

test('R60 is released as 2.0.0-alpha.87', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.87');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.87';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.87');
});
