// Modernization M8: the Capacitor shell (iOS and Android projects for cloud.ivapix.dailo).
// Static checks only: compiling, signing and running the native apps needs Xcode (macOS) and the Android SDK.
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

// Verified on npm on 2026-10-09 (audit section 6).
const CAPACITOR = {
  '@capacitor/android': '8.5.3', '@capacitor/app': '8.1.2', '@capacitor/browser': '8.0.5', '@capacitor/core': '8.5.3',
  '@capacitor/filesystem': '8.1.4', '@capacitor/ios': '8.5.3', '@capacitor/keyboard': '8.0.6',
  '@capacitor/local-notifications': '8.3.1', '@capacitor/share': '8.0.3',
};

test('package.json pins Capacitor and every plugin exactly; the scripts build, sync and open the projects', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.type, undefined, 'no "type": "module", the Node tests use require');
  assert.deepEqual(pkg.dependencies, CAPACITOR);
  assert.equal(pkg.devDependencies['@capacitor/cli'], '8.5.3');
  assert.equal(pkg.scripts['cap:sync'], 'node tools/build-www.mjs && cap sync');
  assert.equal(pkg.scripts['cap:ios'], 'cap open ios');
  assert.equal(pkg.scripts['cap:android'], 'cap open android');
  const lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of Object.entries({ ...CAPACITOR, '@capacitor/cli': '8.5.3' })) assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} is locked`);
});

test('capacitor.config.json: app id, www, dark edge-to-edge layout, keyboard resize, notification icon, no live-reload server', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'cloud.ivapix.dailo');
  assert.equal(config.appName, 'Dailo');
  assert.equal(config.webDir, 'www');
  assert.equal(config.backgroundColor, '#0F1114');
  assert.equal(config.ios.contentInset, 'never');
  assert.equal(config.server, undefined, 'a server.url would load the app from the network instead of the package');
  assert.deepEqual(config.plugins.SystemBars, { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' });
  assert.deepEqual(config.plugins.Keyboard, { resize: 'native', style: 'DARK', resizeOnFullScreen: true });
  assert.equal(config.plugins.LocalNotifications.smallIcon, 'ic_stat_dailo');
  assert.ok(exists('android/app/src/main/res/drawable-mdpi/ic_stat_dailo.png'), 'the configured small icon exists');
});

test('the vendored Capacitor runtime is the @capacitor/core file of the pinned version', () => {
  assert.equal(read('vendor/capacitor/VERSION').trim(), CAPACITOR['@capacitor/core']);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'vendor/capacitor/capacitor.js'))).digest('hex');
  assert.equal(hash, read('vendor/capacitor/capacitor.js.sha256').trim().split(/\s+/)[0]);
  const installed = path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js');
  if (fs.existsSync(installed)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(installed)).digest('hex'), hash, 'same file as the installed package');
});

test('the www build copies exactly the precached shell and no service worker', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dailo-www-'));
  fs.writeFileSync(path.join(out, 'stale.txt'), 'old');
  execFileSync(process.execPath, [path.join(root, 'tools/build-www.mjs'), out], { cwd: root });
  assert.deepEqual(listFiles(out).sort(), shellFiles().filter(file => file !== 'sw.js').sort());
  assert.ok(!fs.existsSync(path.join(out, 'sw.js')));
  for (const file of ['index.html', 'js/app.js', 'js/platform.js', 'vendor/capacitor/capacitor.js']) {
    assert.ok(fs.readFileSync(path.join(out, file)).equals(fs.readFileSync(path.join(root, file))), `${file} is copied unchanged`);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test('the iOS and Android projects carry the app id and every plugin the platform layer uses', () => {
  const plugins = ['App', 'Browser', 'Filesystem', 'Keyboard', 'LocalNotifications', 'Share'];
  const platform = read('js/platform.js');
  for (const name of plugins.filter(name => name !== 'Keyboard')) assert.match(platform, new RegExp(`plugin\\('${name}'\\)`), `${name} is used`);
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PRODUCT_BUNDLE_IDENTIFIER = cloud\.ivapix\.dailo;/);
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/);
  const swift = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(swift, /capacitor-swift-pm\.git", exact: "8\.5\.3"/);
  for (const name of plugins) assert.match(swift, new RegExp(`\\.product\\(name: "Capacitor${name}"`), `iOS ${name}`);
  assert.match(read('ios/.gitignore'), /^App\/App\/public$/m, 'copied web files are not committed');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /applicationId "cloud\.ivapix\.dailo"/);
  assert.match(gradle, /namespace = "cloud\.ivapix\.dailo"/);
  const settings = read('android/capacitor.settings.gradle');
  for (const name of ['app', 'browser', 'filesystem', 'keyboard', 'local-notifications', 'share']) assert.match(settings, new RegExp(`include ':capacitor-${name}'`), `Android ${name}`);
  assert.match(read('android/variables.gradle'), /minSdkVersion = 24\n\s+compileSdkVersion = 36\n\s+targetSdkVersion = 36/);
  assert.match(read('android/.gitignore'), /app\/src\/main\/assets\/public/);
  assert.ok(exists('android/gradlew') && exists('android/gradle/wrapper/gradle-wrapper.properties'));
});

test('Android declares the notification permissions the reminders need', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  for (const permission of ['INTERNET', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM']) assert.match(manifest, new RegExp(`<uses-permission android:name="android\\.permission\\.${permission}" />`), permission);
  assert.doesNotMatch(manifest, /USE_EXACT_ALARM"/, 'reserved for alarm and calendar apps in Google Play policy');
});

const { readPng } = require('./support/png.js');
const BLUE = [6, 25, 254];
const DARK = [15, 17, 20];
const near = (actual, expected) => expected.every((value, index) => Math.abs(actual[index] - value) <= 2);
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

test('the native app icons and splash screens are the Dailo mark on its colors', () => {
  const icon = readPng(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  assert.deepEqual([icon.width, icon.height, icon.channels], [1024, 1024, 3], 'the App Store icon has no alpha channel');
  assert.ok(near(icon.pixel(4, 4), BLUE), 'full-bleed blue');
  for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    const splash = readPng(path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', file));
    assert.deepEqual([splash.width, splash.height], [2732, 2732]);
    assert.ok(near(splash.pixel(10, 10), DARK), `${file} is dark`);
    assert.ok(near(splash.pixel(1366 - 270, 1366), BLUE), `${file} shows the blue tile in the middle`);
  }
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const res = `android/app/src/main/res`;
    const launcher = readPng(path.join(root, res, `mipmap-${density}/ic_launcher.png`));
    assert.equal(launcher.width, 48 * scale);
    assert.ok(near(launcher.pixel(Math.round(2 * scale), Math.round(24 * scale)), BLUE));
    const round = readPng(path.join(root, res, `mipmap-${density}/ic_launcher_round.png`));
    assert.equal(round.width, 48 * scale);
    assert.equal(round.pixel(0, 0)[3], 0, 'the round icon has transparent corners');
    const foreground = readPng(path.join(root, res, `mipmap-${density}/ic_launcher_foreground.png`));
    assert.equal(foreground.width, 108 * scale);
    assert.equal(foreground.pixel(Math.round(10 * scale), Math.round(54 * scale))[3], 0, 'the adaptive foreground stays inside the safe zone');
    const port = readPng(path.join(root, res, `drawable-port-${density}/splash.png`));
    assert.ok(near(port.pixel(2, 2), DARK), `${density} splash is dark`);
    assert.ok(near(port.pixel(Math.round(port.width / 2) - Math.round(port.width * 0.11), Math.round(port.height / 2)), BLUE));
  }
  assert.match(read('android/app/src/main/res/values/ic_launcher_background.xml'), /<color name="ic_launcher_background">#0619FE<\/color>/);
});

test('the Android notification icon is a white silhouette on transparency at every density', () => {
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const image = readPng(path.join(root, `android/app/src/main/res/drawable-${density}/ic_stat_dailo.png`));
    assert.deepEqual([image.width, image.height, image.channels], [24 * scale, 24 * scale, 4]);
    let visible = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const [r, g, b, a] = image.pixel(x, y);
        if (a) { visible += 1; assert.deepEqual([r, g, b], [255, 255, 255], `${density} (${x},${y}) is white`); }
      }
    }
    assert.ok(visible > image.width * image.height * 0.1, `${density} draws the mark`);
    assert.equal(image.pixel(0, 0)[3], 0);
  }
});

test('the native projects carry the version, the dark style and the store settings', () => {
  const plist = read('ios/App/App/Info.plist');
  for (const [key, value] of [['CFBundleDisplayName', '<string>Dailo</string>'], ['UIUserInterfaceStyle', '<string>Dark</string>'], ['ITSAppUsesNonExemptEncryption', '<false/>'], ['CFBundleAllowMixedLocalizations', '<true/>']]) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*${value}`), key);
  }
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((project.match(/MARKETING_VERSION = 2\.0\.0;/g) || []).length, 2, 'Debug and Release');
  assert.doesNotMatch(project, /MARKETING_VERSION = 1\.0;/);
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionCode 1\n/);
  assert.match(gradle, /versionName "2\.0\.0"/);
  assert.match(read('android/app/src/main/res/values/styles.xml'), /<item name="windowSplashScreenBackground">#0F1114<\/item>/);
  assert.match(read('tools/generate-icons.py'), /--native/);
});

