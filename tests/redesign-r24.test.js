// Redesign R24: app shortcuts on the icon and "Podeli u Dailo" (additions B and C), Android and the web app.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r24-shortcuts-share.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const exists = file => fs.existsSync(path.join(__dirname, '..', file));
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

test('C: shared text becomes a Quick Add draft — the subject or first line as the title, the rest and the link as notes', () => {
  assert.deepEqual(Core.sharedTextDraft({ subject: 'Kako uštedeti struju', text: 'https://example.com/clanak' }), { title: 'Kako uštedeti struju', notes: 'https://example.com/clanak' });
  assert.deepEqual(Core.sharedTextDraft({ text: 'Kupi mleko' }), { title: 'Kupi mleko', notes: '' });
  assert.deepEqual(Core.sharedTextDraft({ text: 'Pozovi Anu\r\nzbog ugovora\n\nu petak' }), { title: 'Pozovi Anu', notes: 'zbog ugovora\nu petak' });
  assert.deepEqual(Core.sharedTextDraft({ text: 'https://www.example.com/page?x=1' }), { title: 'example.com', notes: 'https://www.example.com/page?x=1' });
  assert.deepEqual(Core.sharedTextDraft({ text: 'Pogledaj ovo https://a.rs/x', url: 'https://a.rs/x' }), { title: 'Pogledaj ovo https://a.rs/x', notes: '' }, 'a link already in the title is not repeated');
  assert.deepEqual(Core.sharedTextDraft({ title: 'Recept', url: 'https://kuhinja.rs/r' }), { title: 'Recept', notes: 'https://kuhinja.rs/r' }, 'the web share target names it "title"');
  assert.equal(Core.sharedTextDraft({ text: 'x'.repeat(400) }).title.length, 200);
  assert.deepEqual(Core.sharedTextDraft({}), { title: '', notes: '' });
});

function linkHarness(extra = {}) {
  const calls = [];
  const ctx = withI18n({
    URL, URLSearchParams, Core, state: { tasks: [] }, modalState: null, globalOperation: null, recovery: null,
    openQuickAdd: context => calls.push(['quick', context]), navigate: route => calls.push(['navigate', route]),
    openKnowledgeWindow: (type, id, options) => calls.push(['knowledge', type, id, options]), // R35: a shared link becomes a resource
    closePopover: () => calls.push(['closePopover']), flushTextSave: () => calls.push(['flush']), closeModal: () => calls.push(['close']),
    ...extra,
  });
  vm.createContext(ctx);
  vm.runInContext(fn('handleIncomingLink'), ctx);
  return { ctx, calls };
}

test('B, C: Dailo links open Quick Add, Danas, Dnevnik or a shared draft', () => {
  const { ctx, calls } = linkHarness();
  assert.equal(ctx.handleIncomingLink('dailo://new-task'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['quick', {}]);
  ctx.handleIncomingLink('dailo://today');
  assert.deepEqual(calls.at(-1), ['navigate', '#today']);
  ctx.handleIncomingLink('dailo://journal');
  assert.deepEqual(calls.at(-1), ['navigate', '#journal']);
  ctx.handleIncomingLink(`dailo://share?${new URLSearchParams({ text: 'Kupi mleko\ni hleb' })}`);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['quick', { title: 'Kupi mleko', notes: 'i hleb' }]);
  // R35 (H): a shared link opens a new resource in Inbox instead.
  ctx.handleIncomingLink(`dailo://share?${new URLSearchParams({ text: 'https://example.com/a', subject: 'Članak' })}`);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['knowledge', 'resource', null, { prefill: { title: 'Članak', linkUrls: ['https://example.com/a'], description: '' }, inbox: true }]);
  assert.equal(ctx.handleIncomingLink('https://example.com'), false);
  assert.equal(ctx.handleIncomingLink('dailo://unknown'), false);
  assert.equal(ctx.handleIncomingLink('not a link'), false);
});

test('B, C: an open window is saved and closed first; during an import nothing happens', () => {
  const open = linkHarness({ modalState: { type: 'task', taskId: 't1' } });
  open.ctx.handleIncomingLink('dailo://new-task');
  assert.deepEqual(open.calls.map(call => call[0]), ['closePopover', 'flush', 'close', 'quick']);
  const busy = linkHarness({ globalOperation: { reason: 'restore' } });
  assert.equal(busy.ctx.handleIncomingLink('dailo://new-task'), false);
  assert.deepEqual(busy.calls, []);
});

test('B, C: the phone app hears links through the App plugin; the web reads its start address once', () => {
  const listeners = {};
  const native = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'App' ? { addListener: (event, listener) => { listeners[event] = listener; return Promise.resolve({}); } } : {}) }, console });
  const seen = [];
  assert.equal(native.links.onAppLink(url => seen.push(url)), true);
  listeners.appUrlOpen({ url: 'dailo://today' });
  assert.deepEqual(seen, ['dailo://today']);
  assert.equal(Platform.links.onAppLink(() => {}), false);
  assert.match(fn('startPlatform'), /platform\.links\.onAppLink\?\.\(handleIncomingLink\);/);
  const launch = fn('consumeLaunchParams');
  assert.match(launch, /history\.replaceState\(null, '', location\.pathname \+ location\.hash\);/);
  assert.match(launch, /handleIncomingLink\(`dailo:\/\/\$\{shortcut\}`\)/);
  assert.match(launch, /share_text|share_title|share_url/);
});

test('C: Quick Add shows the shared link that will be saved with the task', () => {
  assert.match(app, /notes: context\.notes \|\| '',/);
  assert.match(app, /\$\{modalState\.draft\.notes \? `<p class="quick-shared-note"><i class="ph ph-link" aria-hidden="true"><\/i><span>\$\{esc\(modalState\.draft\.notes\)\}<\/span><\/p>` : ''\}/);
  assert.match(read('css/styles.css'), /\.quick-shared-note \{/);
});

test('B, C: the web app manifest has the three shortcuts and a share target', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.deepEqual(manifest.shortcuts.map(item => [item.name, item.url]), [['Novi zadatak', './?shortcut=new-task'], ['Danas', './?shortcut=today'], ['Dnevnik', './?shortcut=journal']]);
  assert.ok(manifest.shortcuts.every(item => item.icons?.[0]?.src === 'icons/icon-192.png'));
  assert.deepEqual(manifest.share_target, { action: './', method: 'GET', params: { title: 'share_title', text: 'share_text', url: 'share_url' } });
});

test('B: Android has static shortcuts with their labels and icons', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<meta-data android:name="android\.app\.shortcuts" android:resource="@xml\/shortcuts" \/>/);
  const shortcuts = read('android/app/src/main/res/xml/shortcuts.xml');
  for (const [id, label, icon, data] of [['new_task', 'shortcut_new_task', 'ic_shortcut_add', 'dailo://new-task'], ['today', 'shortcut_today', 'ic_shortcut_today', 'dailo://today'], ['journal', 'shortcut_journal', 'ic_shortcut_journal', 'dailo://journal']]) {
    assert.match(shortcuts, new RegExp(`android:shortcutId="${id}"[^>]*android:icon="@drawable/${icon}"[^>]*android:shortcutShortLabel="@string/${label}"`), id);
    assert.match(shortcuts, new RegExp(`android:targetClass="cloud\\.ivapix\\.dailo\\.MainActivity"\\s+android:data="${data.replace(/[/.]/g, '\\$&')}"`), data);
    assert.ok(exists(`android/app/src/main/res/drawable/${icon}.xml`), icon);
  }
  const strings = read('android/app/src/main/res/values/strings.xml');
  for (const [name, text] of [['shortcut_new_task', 'Novi zadatak'], ['shortcut_today', 'Danas'], ['shortcut_journal', 'Dnevnik']]) assert.match(strings, new RegExp(`<string name="${name}">${text}</string>`));
});

test('C: Android accepts shared text and hands it to the app as a dailo://share link', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<intent-filter>\s*<action android:name="android\.intent\.action\.SEND" \/>\s*<category android:name="android\.intent\.category\.DEFAULT" \/>\s*<data android:mimeType="text\/plain" \/>\s*<\/intent-filter>/);
  const activity = read('android/app/src/main/java/cloud/ivapix/dailo/MainActivity.java');
  assert.match(activity, /public void onCreate\(Bundle savedInstanceState\) \{\n[^]*?asAppLink\(getIntent\(\)\);\n\s+super\.onCreate\(savedInstanceState\);/, 'R28 registers the widget plugin first');
  assert.match(activity, /protected void onNewIntent\(Intent intent\) \{\n\s+asAppLink\(intent\);\n\s+super\.onNewIntent\(intent\);/);
  assert.match(activity, /Intent\.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY/, 'reopening from Recents does not share again');
  assert.match(activity, /new Uri\.Builder\(\)\.scheme\("dailo"\)\.authority\("share"\)\.appendQueryParameter\("text", text\)/);
  assert.match(activity, /intent\.setAction\(Intent\.ACTION_VIEW\);\n\s+intent\.setData\(link\.build\(\)\);/);
});

test('R24 shipped as 2.0.0-alpha.49 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 49);
});
