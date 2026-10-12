// R49: the Android release build — the version from package.json, the upload key from the environment (never the
// repository), and a GitHub workflow that builds the signed AAB for Google Play.
// Spec: docs/superpowers/specs/2026-10-12-r49-android-release.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const gradle = read('android/app/build.gradle');

test('versionName and versionCode come from package.json; a later version always has a higher code', () => {
  assert.match(gradle, /^import groovy\.json\.JsonSlurper\n/);
  assert.match(gradle, /def dailoVersion = new JsonSlurper\(\)\.parse\(rootProject\.file\('\.\.\/package\.json'\)\)\.version/);
  assert.match(gradle, /versionCode dailoVersionCode\(dailoVersion\)\n\s+versionName dailoVersion\n/);
  // X.Y.Z-alpha.N < X.Y.Z-beta.N < X.Y.Z-rc.N < X.Y.Z: alpha N, beta 300 + N, rc 600 + N, the release 999.
  assert.match(gradle, /def stage = \[alpha: 0, beta: 300, rc: 600\]/);
  assert.match(gradle, /return major \* 10000000 \+ minor \* 100000 \+ patch \* 1000 \+ step/);
  assert.match(gradle, /throw new GradleException\("Unsupported version \$\{version\}/);
});

test('the release is signed with the upload key from the environment or Gradle properties, never a file in git', () => {
  for (const name of ['DAILO_UPLOAD_STORE_FILE', 'DAILO_UPLOAD_STORE_PASSWORD', 'DAILO_UPLOAD_KEY_ALIAS', 'DAILO_UPLOAD_KEY_PASSWORD']) {
    assert.ok(gradle.includes(`dailoSecret('${name}')`), name);
  }
  assert.match(gradle, /def dailoSecret\(String name\) \{\n\s+return System\.getenv\(name\) \?: project\.findProperty\(name\)\n\}/);
  assert.match(gradle, /signingConfig dailoReleaseSigning \? signingConfigs\.upload : null/);
  assert.match(gradle, /throw new GradleException\('A release build needs the upload key: set DAILO_UPLOAD_STORE_FILE/);
  assert.doesNotMatch(gradle, /release\s*\{[^}]*storePassword '/, 'no release password in the file');
  const ignore = read('.gitignore');
  assert.match(ignore, /\n\*\.jks\n/);
  assert.match(ignore, /\n!android\/app\/debug\.keystore\n/);
});

test('the Android release workflow builds the signed AAB and APK by hand or from a v* tag', () => {
  const flow = read('.github/workflows/android-release.yml');
  assert.match(flow, /^name: Android release\n/);
  assert.match(flow, /\non:\n  workflow_dispatch:\n  push:\n    tags: \['v\*'\]\n/);
  for (const part of [
    "java-version: '21'", 'run: npm ci', 'run: npm run verify', 'run: npm run cap:sync',
    'KEYSTORE_BASE64: ${{ secrets.DAILO_UPLOAD_KEYSTORE_BASE64 }}', 'base64 --decode > "$RUNNER_TEMP/upload.jks"',
    'echo "DAILO_UPLOAD_STORE_FILE=$RUNNER_TEMP/upload.jks" >> "$GITHUB_ENV"',
    'DAILO_UPLOAD_STORE_PASSWORD: ${{ secrets.DAILO_UPLOAD_STORE_PASSWORD }}', 'DAILO_UPLOAD_KEY_ALIAS: ${{ secrets.DAILO_UPLOAD_KEY_ALIAS }}',
    'DAILO_UPLOAD_KEY_PASSWORD: ${{ secrets.DAILO_UPLOAD_KEY_PASSWORD }}', 'run: ./gradlew bundleRelease assembleRelease --no-daemon',
    'android/app/build/outputs/bundle/release/app-release.aab', 'android/app/build/outputs/apk/release/app-release.apk', 'rm -f "$RUNNER_TEMP/upload.jks"',
  ]) assert.ok(flow.includes(part), part);
  assert.match(flow, /echo "::error::Add the DAILO_UPLOAD_\* secrets/);
});

test('a Serbian guide explains the upload key, the secrets, the build and Google Play', () => {
  const guide = read('docs/v2/android-izdanje.md');
  for (const part of ['keytool -genkeypair', 'DAILO_UPLOAD_KEYSTORE_BASE64', 'Android release', 'Play App Signing', 'Data safety', 'privatnost.html', 'versionCode', 'SCHEDULE_EXACT_ALARM']) {
    assert.ok(guide.includes(part), part);
  }
});
