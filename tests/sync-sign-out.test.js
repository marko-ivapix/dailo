// "Odjavi se" ends the session of this device only (found while checking sessions on 2026-10-12): Supabase Auth signs
// out every device when /logout has no scope, so the other devices would lose their sign-in at their next sync.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const Sync = require('../js/sync.js');

const clientFor = fake => Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });

test('signing out ends only this device\'s session; another device keeps its sign-in', async () => {
  const fake = createFakeSupabase({ autoconfirm: true });
  const phone = clientFor(fake);
  const laptop = clientFor(fake);
  await phone.signUp('ana@example.com', 'tajna1234');
  const onPhone = await phone.signIn('ana@example.com', 'tajna1234');
  const onLaptop = await laptop.signIn('ana@example.com', 'tajna1234');
  await phone.signOut(onPhone);
  assert.deepEqual(fake.logoutScopes, ['local']);
  assert.ok((await laptop.refresh(onLaptop)).accessToken, 'the laptop stays signed in');
  await assert.rejects(phone.refresh(onPhone), error => error.status === 400, 'the phone is signed out');
});

test('the client asks for the local scope', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js/sync.js'), 'utf8'), /request\('\/auth\/v1\/logout\?scope=local', \{ method: 'POST', token: session\?\.accessToken \}\)/);
});
