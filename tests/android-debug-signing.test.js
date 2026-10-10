// Android test builds share one debug key, so a newer APK installs over an older one from any machine.
// The key is the standard Android debug key (passwords "android"); it never signs a release build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const keystore = path.join(root, 'android/app/debug.keystore');

// The key that signed the first APK sent to the user on 2026-10-10
// (certificate SHA-256 68:9B:BF:E7:32:21:8A:90:18:71:30:36:DD:1A:01:CA:B1:48:56:F9:22:21:7A:60:94:71:CD:29:9F:29:C5:7B).
const KEYSTORE_SHA256 = '96d04b683551109a4e2e6236cf363b54b5d88018691d9eefa24aa7009232608f';

test('the debug keystore is in the repository and unchanged', () => {
  assert.ok(fs.existsSync(keystore), 'android/app/debug.keystore');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(keystore)).digest('hex'), KEYSTORE_SHA256);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'android/.gitignore'), 'utf8'), /^\*\.keystore$/m, 'not ignored');
});

test('debug builds are signed with it, release builds are not', () => {
  const signing = gradle.match(/signingConfigs \{\n\s+debug \{([\s\S]*?)\n\s+\}\n\s+\}/);
  assert.ok(signing, 'a signingConfigs.debug block');
  assert.match(signing[1], /storeFile file\('debug\.keystore'\)/);
  assert.match(signing[1], /storePassword 'android'/);
  assert.match(signing[1], /keyAlias 'androiddebugkey'/);
  assert.match(signing[1], /keyPassword 'android'/);
  assert.match(gradle, /buildTypes \{\n\s+debug \{\n\s+signingConfig signingConfigs\.debug\n\s+\}/);
  const release = gradle.match(/\n\s+release \{([\s\S]*?)\n\s+\}/)[1];
  assert.doesNotMatch(release, /signingConfig/, 'the release key is separate and never in the repository');
});
