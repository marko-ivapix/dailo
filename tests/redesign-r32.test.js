// Redesign R32: the third design pass, the shell (findings 16, 17, 18, 20, 21, 28, 30, 31, 37).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r32-shell.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];

test('16: an opaque strip covers the status bar, without blur', () => {
  assert.match(css, /body::before \{ content: ""; position: fixed; inset: 0 0 auto; height: env\(safe-area-inset-top\); background: var\(--bg-primary\); z-index: 79; pointer-events: none; \}/);
  const layer = css.slice(css.indexOf('/* Redesign R32'));
  assert.doesNotMatch(layer.slice(0, layer.indexOf('/* Keep primary compact actions')), /backdrop-filter|blur\(/);
});

test('17: Back walks the screens: the previous one, then the tab\'s start, then Danas; on Danas the phone minimizes', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${constLine('ROOT_ROUTES')}\n${fn('backTarget')}\nthis.ROOT_ROUTES = ROOT_ROUTES;`, ctx);
  assert.ok(ctx.ROOT_ROUTES.includes('#habits'), 'Navike is a tab');
  assert.equal(ctx.backTarget('#today', []), null);
  assert.equal(ctx.backTarget('#calendar', []), '#today');
  assert.equal(ctx.backTarget('#habits', []), '#today');
  assert.equal(ctx.backTarget('#project/p1', [{ route: '#today' }]), '#today');
  assert.equal(ctx.backTarget('#project/p1', []), '#tasks');
  assert.equal(ctx.backTarget('#settings', []), '#more');
  const back = fn('handleBackButton');
  assert.match(back, /const step = backTarget\(location\.hash \|\| '#today', screenTrail\);\n\s+if \(!step\) return false;\n\s+navigate\(step\);\n\s+return true;/);
  assert.match(fn('navigate'), /else if \(ROOT_ROUTES\.includes\(target\) \|\| screenTrail\.at\(-1\)\?\.route === target\) location\.replace\(target\);/);
});

test('17: Android Back never walks the browser history; the app decides and otherwise the app is minimized', () => {
  const calls = [];
  const listeners = {};
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'App' ? { addListener: (event, listener) => { listeners[event] = listener; return Promise.resolve({}); }, minimizeApp: () => { calls.push('minimize'); return Promise.resolve(); } } : {}) }, history: { back: () => calls.push('history.back') }, console });
  let handled = false;
  platform.backButton.setHandler(() => handled);
  listeners.backButton({ canGoBack: true });
  assert.deepEqual(calls, ['minimize']);
  handled = true;
  listeners.backButton({ canGoBack: true });
  assert.deepEqual(calls, ['minimize']);
});

test('17: every screen under Još starts with "‹ Još" (or the screen it was opened from)', () => {
  assert.match(constLine('LIBRARY_ROUTES'), /\['settings', 'account', 'goals', 'areas', 'notes', 'resources', 'tags', 'templates', 'saved-views', 'cleaning', 'review', 'journal', 'completed', 'archived'\]/);
  assert.match(fn('renderMain'), /if \(LIBRARY_ROUTES\.includes\(route\.type\) && !content\.includes\('class="screen-back"'\)\) content = backLink\('more', tr\('More'\)\) \+ content;/);
});

function settingsHtml(extra = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, Notification: extra.Notification });
  const ctx = {
    state: { settings: { backupStatus: {} } }, esc: value => String(value ?? ''), pageHeader: title => `<h1>${title}</h1>`, shortcutError: () => '', shortcutLabels: {},
    notificationButtonLabel: () => 'Enable', release: { APP_VERSION: 'x' }, environmentInfo: () => ({ standalone: false, userAgent: extra.userAgent || '' }),
    notificationSettings: () => extra.native || null, readAutoBackup: () => ({ enabled: false }), installPrompt: () => Boolean(extra.installPrompt),
  };
  return adapter.renderRoute({ type: 'settings' }, ctx);
}

test('18: Podešavanja has its own Podsetnici group; a notification button shows only when it does something', () => {
  const html = settingsHtml({ native: { permission: 'granted', exact: 'granted' } });
  assert.match(html, /<section class="settings-card" data-settings-reminders>\s*<h2>Reminders<\/h2>/);
  assert.ok(html.indexOf('data-settings-reminders') < html.indexOf('id="default-reminder-time"'));
  assert.doesNotMatch(html.slice(html.indexOf('data-settings-reminders'), html.indexOf('id="default-reminder-time"')), /data-action="enable-notifications"/, 'already on: no button');
  assert.match(settingsHtml({ native: { permission: 'prompt' } }), /data-action="enable-notifications">Enable<\/button>/);
  assert.doesNotMatch(settingsHtml({ native: { permission: 'denied' } }), /data-action="enable-notifications"/, 'blocked: the text says where to turn it on');
  const backup = html.slice(html.indexOf('<strong>Backup</strong>'), html.indexOf('data-action="export-backup"'));
  assert.doesNotMatch(backup, /Recovery snapshot|Validation|Last import/, 'only what is known');
  assert.match(css, /\.settings-label span \{ font-size: 13px; line-height: 1\.4; \}/);
  assert.match(css, /\.settings-row:has\(> \.btn, > div > \.btn\) \{ flex-direction: column; align-items: stretch; gap: 8px; \}/);
});

test('31: the install row speaks to the browser in use, with an "Instaliraj" button where the browser offers one', () => {
  assert.match(settingsHtml({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), /On iPhone, in Safari tap Share/);
  const chrome = settingsHtml({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140', installPrompt: true });
  assert.match(chrome, /data-action="install-app">Install<\/button>/);
  assert.doesNotMatch(chrome, /in Safari tap Share/);
  assert.match(settingsHtml({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Firefox/140' }), /In the browser menu, choose Install or Add to Home Screen\./);
  assert.match(app, /window\.addEventListener\('beforeinstallprompt', event => \{ event\.preventDefault\(\); installPromptEvent = event;/);
});

test('20, 21: phone type sizes follow G5 and no text uses the low-contrast ink-4', () => {
  assert.match(css, /@media \(max-width: 1023px\) \{\n\s+\.task-title \{ font-size: 15px; \}\n\s+\.task-meta \{ font-size: 12\.5px; \}\n\s+\.page-title \{ font-size: 26px; \}/);
  assert.match(css, /\.task-window-row-value, \.quick-more-meta, \.task-window-more-meta, \.sheet-calendar-weekday, \.day-grid-label \{ color: var\(--ink-3\); \}/);
  assert.match(css, /\.quick-title-input::placeholder, \.search-input::placeholder, textarea::placeholder, \.input::placeholder \{ color: var\(--ink-3\); \}/);
});

test('28: a toast is announced once, through the polite status line, and lifts the "+" by its real height', () => {
  assert.doesNotMatch(read('index.html'), /id="toast-root"[^>]*aria-live/);
  const toast = fn('renderToast');
  assert.match(toast, /const spoken = toastMessage \|\| \(undoState \? tr\(undoState\.message\) : ''\) \|\| globalRecoveryNotice\?\.message \|\| '';/);
  assert.match(toast, /if \(status && status\.textContent !== spoken\) status\.textContent = spoken;/);
  assert.match(toast, /document\.documentElement\.style\.setProperty\('--toast-stack', `\$\{root\.offsetHeight\}px`\);/);
  assert.match(css, /body:has\(#toast-root \.toast\) \.mobile-quick-add \{ transform: translateY\(calc\(-1 \* var\(--toast-stack, 56px\) - 8px\)\); \}/);
});

test('30: the Android theme is dark under the WebView', () => {
  const styles = read('android/app/src/main/res/values/styles.xml');
  assert.match(styles, /<style name="AppTheme\.NoActionBar" parent="Theme\.AppCompat\.NoActionBar">/);
  assert.match(styles, /<item name="android:windowBackground">@color\/dailoBackground<\/item>/);
  assert.match(read('android/app/src/main/res/values/colors.xml'), /<color name="dailoBackground">#0F1114<\/color>/);
});

test('37: the Weekly review tile says whether this week is done', () => {
  assert.match(fn('renderMoreScreen'), /moreRow\('review', 'ph-clipboard-text', tr\('Weekly review'\), '', reviewNote\)/);
  assert.match(fn('renderMoreScreen'), /const reviewNote = Core\.weeklyReviewDue\(state\.settings, Core\.dateOnly\(\), state\.settings\.weekStartsOn\) \? tr\('Time for this week\\'s review'\) : lastReview \? tr\('Last: \{date\}', \{ date: formatDate\(Core\.localDateOf\(lastReview\.completedAt\)\) \}\) : '';/);
});

test('R32 shipped as 2.0.0-alpha.58 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 58);
});
