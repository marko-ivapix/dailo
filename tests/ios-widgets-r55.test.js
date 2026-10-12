// R55: iPhone home-screen widgets "Danas" and "Navike" and "Podeli u Dailo" — the same snapshot and links as Android,
// through the App Group group.cloud.ivapix.dailo. The two extension targets are created in Xcode by the guide; the
// plugin and the view controller that registers it are in the App target.
// Spec: docs/superpowers/specs/2026-10-12-r55-ios-widgets.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const platform = read('js/platform.js');
const fn = (source, name) => { const match = new RegExp(`\\n([ \\t]+)(async )?function ${name}\\(`).exec(source); assert.ok(match, name); const start = match.index + 1; return source.slice(start, source.indexOf(`\n${match[1]}}\n`, start) + match[1].length + 3); };
const balanced = text => { let depth = 0; for (const char of text.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/\/\/[^\n]*/g, '')) { if (char === '{') depth += 1; if (char === '}') depth -= 1; if (depth < 0) return false; } return depth === 0; };

test('JavaScript: the widget snapshot also goes to the iPhone; shared items are taken on start and resume', () => {
  assert.match(fn(platform, 'updateWidget'), /if \(kind !== 'android' && kind !== 'ios'\) return Promise\.resolve\(false\);/);
  assert.match(fn(platform, 'takeShared'), /if \(kind !== 'ios'\) return \[\];/);
  assert.match(platform, /shared: Object\.freeze\(\{ take: takeShared \}\),/);
  assert.match(fn(app, 'updateWidget'), /if \(!\['android', 'ios'\]\.includes\(platform\?\.kind\) \|\| !platform\.widget \|\| !state\) return;/);
  assert.match(fn(app, 'startPlatform'), /takeSharedItems\(\);/);
  assert.match(fn(app, 'resumeApp'), /takeSharedItems\(\);/);
});

test('takeSharedItems: the first item opens like "Podeli u Dailo", the rest go to Inbox', async () => {
  const calls = [];
  const context = {
    globalThis: { DailoPlatform: { shared: { take: async () => [{ text: 'Kupi hleb', url: '' }, { text: '', url: 'https://dailo.app/a' }, { text: 'Treći', url: '' }] } } },
    handleIncomingLink: href => calls.push(['link', href]), addToInbox: title => calls.push(['inbox', title]), URLSearchParams,
  };
  vm.createContext(context);
  vm.runInContext(fn(app, 'takeSharedItems'), context);
  await context.takeSharedItems();
  assert.deepEqual(calls, [['link', 'dailo://share?text=Kupi+hleb&url='], ['inbox', 'https://dailo.app/a'], ['inbox', 'Treći']]);
});

test('Swift: the plugin and the view controller that registers it are in the App target', () => {
  const plugin = read('ios/App/App/DailoWidgetPlugin.swift');
  for (const part of ['public class DailoWidgetPlugin: CAPPlugin, CAPBridgedPlugin', 'public let jsName = "DailoWidget"', 'CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)', 'CAPPluginMethod(name: "takeShared", returnType: CAPPluginReturnPromise)', 'static let group = "group.cloud.ivapix.dailo"', 'WidgetCenter.shared.reloadAllTimelines()', 'defaults.removeObject(forKey: DailoWidgetPlugin.sharedKey)']) {
    assert.ok(plugin.includes(part), part);
  }
  const controller = read('ios/App/App/DailoViewController.swift');
  assert.match(controller, /class DailoViewController: CAPBridgeViewController \{\n\s+override open func capacitorDidLoad\(\) \{\n\s+bridge\?\.registerPluginInstance\(DailoWidgetPlugin\(\)\)/);
  assert.match(read('ios/App/App/Base.lproj/Main.storyboard'), /customClass="DailoViewController" customModule="App" customModuleProvider="target"/);
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  for (const name of ['DailoWidgetPlugin.swift', 'DailoViewController.swift']) {
    assert.match(project, new RegExp(`/\\* ${name.replace('.', '\\.')} in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = [0-9A-F]{24} /\\* ${name.replace('.', '\\.')} \\*/; \\};`), `${name} build file`);
    assert.match(project, new RegExp(`/\\* ${name.replace('.', '\\.')} \\*/ = \\{isa = PBXFileReference; lastKnownFileType = sourcecode\\.swift; path = ${name.replace('.', '\\.')}; sourceTree = "<group>"; \\};`), `${name} file`);
    const sources = project.slice(project.indexOf('/* Begin PBXSourcesBuildPhase section */'), project.indexOf('/* End PBXSourcesBuildPhase section */'));
    assert.ok(sources.includes(`/* ${name} in Sources */`), `${name} compiles`);
  }
  assert.ok(balanced(plugin) && balanced(controller), 'braces balance');
});

test('Swift: the widgets and the share extension wait in their folders for the Xcode targets', () => {
  const widgets = read('ios/DailoWidgets/DailoWidgets.swift');
  for (const part of ['@main\nstruct DailoWidgets: WidgetBundle', 'StaticConfiguration(kind: "DailoToday"', 'StaticConfiguration(kind: "DailoHabits"', 'forKey: "dailoWidgetSnapshot"', 'dailo://habit-done?id=', '.widgetURL(', 'containerBackground(', 'policy: .after(']) {
    assert.ok(widgets.includes(part), part);
  }
  const share = read('ios/DailoShare/ShareViewController.swift');
  for (const part of ['class ShareViewController: UIViewController', 'UTType.url.identifier', 'UTType.plainText.identifier', 'forKey: "dailoShared"', 'completeRequest(returningItems: nil)']) {
    assert.ok(share.includes(part), part);
  }
  assert.ok(balanced(widgets) && balanced(share), 'braces balance');
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.ok(!project.includes('DailoWidgets.swift') && !project.includes('ShareViewController.swift'), 'not in the App target');
});

test('a Serbian guide walks through App Groups and the two Xcode targets', () => {
  const guide = read('docs/v2/ios-widgeti.md');
  for (const part of ['group.cloud.ivapix.dailo', 'App Groups', 'Widget Extension', 'DailoWidgets', 'Share Extension', 'DailoShare', 'NSExtensionActivationSupportsWebURLWithMaxCount', 'NSExtensionActivationSupportsText']) {
    assert.ok(guide.includes(part), part);
  }
  assert.match(read('docs/v2/capacitor-mac.md'), /ios-widgeti\.md/);
});

test('R55 shipped as 2.0.0-alpha.82 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 82);
});
