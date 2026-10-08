const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const shellFiles = () => JSON.parse(`[${read('sw.js').match(/const SHELL_FILES = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const CAPACITOR = {
  '@capacitor/android': '8.5.3', '@capacitor/app': '8.1.2', '@capacitor/core': '8.5.3', '@capacitor/filesystem': '8.1.4',
  '@capacitor/ios': '8.5.3', '@capacitor/local-notifications': '8.3.1', '@capacitor/share': '8.0.3',
};

test('package.json pins the Capacitor packages exactly and keeps the tests CommonJS', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, undefined, 'no "type": "module", the Node tests use require');
  assert.deepEqual(pkg.dependencies, CAPACITOR);
  assert.deepEqual(pkg.devDependencies, { '@capacitor/cli': '8.5.3' });
  assert.equal(pkg.scripts.build, 'node tools/build-www.mjs');
  assert.equal(pkg.scripts.sync, 'node tools/build-www.mjs && cap sync');
  const lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of Object.entries({ ...CAPACITOR, '@capacitor/cli': '8.5.3' })) assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} is locked`);
  const ignored = read('.gitignore').split('\n').map(line => line.trim());
  for (const entry of ['node_modules/', 'www/']) assert.ok(ignored.includes(entry), `${entry} is ignored`);
});

test('capacitor.config.json names the app, uses www and keeps the dark edge-to-edge layout', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'cloud.ivapix.dailo');
  assert.equal(config.appName, 'Dailo');
  assert.equal(config.webDir, 'www');
  assert.equal(config.backgroundColor, '#0F1114');
  assert.equal(config.ios.contentInset, 'never');
  assert.deepEqual(config.plugins.SystemBars, { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' });
  assert.equal(config.plugins.LocalNotifications.smallIcon, 'ic_stat_dailo');
  assert.match(config.plugins.LocalNotifications.iconColor, /^#[0-9A-F]{6}$/);
});

test('the vendored Capacitor runtime loads first, is precached and is the 8.5.3 file', () => {
  const html = read('index.html');
  const at = file => html.indexOf(`<script src="${file}"></script>`);
  assert.ok(at('vendor/capacitor/capacitor.js') > 0);
  assert.ok(at('vendor/capacitor/capacitor.js') < at('js/release.js'), 'before every app script');
  assert.ok(shellFiles().includes('vendor/capacitor/capacitor.js'));
  assert.match(read('vendor/capacitor/LICENSE'), /MIT License/);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/capacitor/capacitor.js'))).digest('hex');
  assert.equal(hash, read('vendor/capacitor/capacitor.js.sha256').trim().split(/\s+/)[0], 'unchanged copy of @capacitor/core/dist/capacitor.js');
});

test('the www build copies exactly the precached shell and no service worker', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dailo-www-'));
  fs.writeFileSync(path.join(out, 'stale.txt'), 'old');
  execFileSync(process.execPath, [path.join(root, 'tools/build-www.mjs'), out], { cwd: root });
  assert.deepEqual(listFiles(out).sort(), shellFiles().sort());
  assert.ok(!fs.existsSync(path.join(out, 'sw.js')));
  for (const file of ['index.html', 'js/app.js', 'vendor/capacitor/capacitor.js']) {
    assert.ok(fs.readFileSync(path.join(out, file)).equals(fs.readFileSync(path.join(root, file))), `${file} is copied unchanged`);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test('the iOS and Android projects carry the app id and every native plugin', () => {
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PRODUCT_BUNDLE_IDENTIFIER = cloud\.ivapix\.dailo;/);
  const swift = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(swift, /capacitor-swift-pm\.git", exact: "8\.5\.3"/);
  for (const plugin of ['CapacitorApp', 'CapacitorFilesystem', 'CapacitorLocalNotifications', 'CapacitorShare']) assert.match(swift, new RegExp(`\\.product\\(name: "${plugin}"`));
  assert.match(read('ios/.gitignore'), /^App\/App\/public$/m, 'copied web files are not committed');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /applicationId "cloud\.ivapix\.dailo"/);
  assert.match(gradle, /namespace = "cloud\.ivapix\.dailo"/);
  const settings = read('android/capacitor.settings.gradle');
  for (const plugin of ['capacitor-app', 'capacitor-filesystem', 'capacitor-local-notifications', 'capacitor-share']) assert.match(settings, new RegExp(`include ':${plugin}'`));
  assert.match(read('android/.gitignore'), /app\/src\/main\/assets\/public/);
  assert.ok(exists('android/gradlew') && exists('android/gradle/wrapper/gradle-wrapper.properties'));
});
