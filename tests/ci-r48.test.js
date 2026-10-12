// R48: continuous integration on GitHub Actions — every push and pull request runs the same checks as a local release.
// Spec: docs/superpowers/specs/2026-10-12-r48-ci.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the workflow runs on every push and pull request, one run per branch at a time', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /^name: CI\n/);
  assert.match(ci, /\non:\n  push:\n    branches: \['\*\*'\]\n  pull_request:\n  workflow_dispatch:\n/);
  assert.match(ci, /\npermissions:\n  contents: read\n/);
  assert.match(ci, /\nconcurrency:\n  group: ci-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\n/);
});

test('the web job: syntax and the Node suite, the jsdom smoke boot and the Python checks', () => {
  const ci = read('.github/workflows/ci.yml');
  const web = ci.slice(ci.indexOf('  web:'), ci.indexOf('  android:'));
  for (const step of [
    'uses: actions/checkout@v4', 'uses: actions/setup-node@v4', "node-version: '22'", 'cache: npm', 'run: npm ci',
    'run: npm run verify', 'run: npm run smoke', 'uses: actions/setup-python@v5', 'run: npm run check:python',
  ]) assert.ok(web.includes(step), step);
});

test('the Android job builds the debug APK with JDK 21 and keeps it for two weeks', () => {
  const ci = read('.github/workflows/ci.yml');
  const android = ci.slice(ci.indexOf('  android:'));
  assert.match(android, /    needs: web\n/);
  for (const step of [
    'uses: actions/setup-java@v4', 'distribution: temurin', "java-version: '21'", 'run: npm ci', 'run: npm run cap:sync',
    'run: ./gradlew assembleDebug --no-daemon', 'working-directory: android', 'uses: actions/upload-artifact@v4',
    'path: android/app/build/outputs/apk/debug/app-debug.apk', 'retention-days: 14',
  ]) assert.ok(android.includes(step), step);
});

test('one command runs every Python check, locally and in CI', () => {
  assert.equal(JSON.parse(read('package.json')).scripts['check:python'], 'python3 tools/check-python.py');
  const script = read('tools/check-python.py');
  for (const part of ['ast.parse', 'tests/test_browser_path_adapter.py', 'test_browser_regression_registry.py', "'tests/run-browser-regressions.py', '--dry-run'"]) {
    assert.ok(script.includes(part), part);
  }
  assert.match(script, /sys\.exit\(1 if failures else 0\)/);
});
