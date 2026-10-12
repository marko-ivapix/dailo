// The user's Supabase project (2026-10-12): the public URL and publishable key in js/sync-config.js, and requests
// that send the publishable key only as `apikey`, never as a Bearer token (it is not a JWT).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the config holds the project URL and its publishable key, so sync is on', () => {
  const sandbox = {};
  vm.runInNewContext(read('js/sync-config.js'), sandbox);
  const config = sandbox.DailoSyncConfig;
  assert.equal(config.url, 'https://qjfpnvjuqbrmdkjxxmsq.supabase.co');
  assert.match(config.anonKey, /^sb_publishable_[A-Za-z0-9_-]{20,}$/);
  assert.equal(Sync.isConfigured(config), true);
});

function recorder() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, headers: { ...init.headers } });
    const body = url.includes('/auth/v1/verify') ? { access_token: 'user-jwt', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1', email: 'a@b.rs' } } : {};
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { calls, client: Sync.createClient({ url: 'https://qjfpnvjuqbrmdkjxxmsq.supabase.co', anonKey: 'sb_publishable_example_key_123456', fetch }) };
}

test('requests without a sign-in send only the apikey; signed-in requests carry the user token', async () => {
  const { calls, client } = recorder();
  await client.requestCode('a@b.rs');
  const session = await client.verifyCode('a@b.rs', '123456');
  await client.refresh(session);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_publishable_example_key_123456');
    assert.equal(call.headers.Authorization, undefined, `${call.url} sends no Bearer header without a user token`);
  }
  await client.signOut(session).catch(() => {});
  const signedIn = calls.at(-1);
  assert.equal(signedIn.headers.Authorization, 'Bearer user-jwt');
  assert.equal(signedIn.headers.apikey, 'sb_publishable_example_key_123456');
});

test('the setup guide points to Još → Nalog and shows the code templates as paragraphs', () => {
  const guide = read('docs/v2/podesavanje-supabase.md');
  // R40: the codes confirm an account and set a new password; the guide also covers the redirect URLs.
  assert.match(guide, /<p>Tvoj Dailo kod za potvrdu naloga: <strong>\{\{ \.Token \}\}<\/strong><\/p>/);
  assert.match(guide, /<p>Tvoj Dailo kod za novu lozinku: <strong>\{\{ \.Token \}\}<\/strong><\/p>/);
  assert.match(guide, /`dailo:\/\/auth`/);
  assert.match(guide, /\*\*Još → Nalog\*\*/);
  assert.doesNotMatch(guide, /Podešavanja → Sinhronizacija/);
});

test('the configured sync shipped as 2.0.0-alpha.55 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 55);
});
