// Redesign R39: the third design pass, addition L — a light theme and "Prati sistem" (reopens M6).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r39-light-theme.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const block = selector => { const start = css.indexOf(`${selector} {`); assert.ok(start >= 0, selector); return css.slice(start, css.indexOf('}', start) + 1); };
const tokensOf = text => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
const hex = value => value.replace('#', '').match(/../g).map(part => parseInt(part, 16) / 255);
const luminance = value => { const [r, g, b] = hex(value).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('L: the light theme redefines every colour primitive and role, and "Prati sistem" uses the same values', () => {
  const light = block(':root[data-theme="light"]');
  const system = css.slice(css.indexOf('@media (prefers-color-scheme: light) {'));
  const systemBlock = system.slice(system.indexOf(':root[data-theme="system"] {'), system.indexOf('}') + 1);
  assert.match(light, /color-scheme: light;/);
  assert.deepEqual(tokensOf(systemBlock), tokensOf(light), 'one palette, written twice');
  for (const token of ['--graphite-950', '--graphite-900', '--graphite-850', '--graphite-800', '--graphite-750', '--graphite-700', '--line-1', '--line-2', '--line-3', '--ink-1', '--ink-2', '--ink-3', '--ink-4', '--blue-300', '--mint-300', '--mint-400', '--mint-500', '--yellow-400', '--red-400', '--red-600', '--text-on-card-muted', '--accent-tint', '--success-tint', '--warning-tint', '--danger-tint', '--danger-hover', '--danger-line', '--danger-ink', '--blue-tint', '--ink-wash', '--selection', '--scrim', '--shadow-overlay', '--shadow-popover', '--shadow-fab', '--shadow-raised', '--shadow-toggle']) assert.ok(token in tokensOf(light), token);
  assert.match(css, /\n:root \{ color-scheme: dark; \}/, 'dark stays the default');
  assert.doesNotMatch(css, /\.task-time-input \{[^}]*color-scheme: dark/, 'no field forces dark');
});

test('L: light text and accents keep at least 4.5:1 on light surfaces', () => {
  const t = tokensOf(block(':root[data-theme="light"]'));
  for (const fg of ['--ink-1', '--ink-2', '--ink-3', '--blue-300', '--mint-400', '--yellow-400', '--red-400', '--text-on-card-muted']) {
    for (const bg of ['--graphite-900', '--graphite-850', '--graphite-800']) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
  }
  assert.ok(contrast('#FFFFFF', t['--red-600']) >= 4.5, 'white on the danger button');
  assert.ok(contrast(t['--graphite-900'], t['--mint-400']) >= 4.5, 'text on mint');
});

test('L: the status bar strip stays dark in both themes, because the phone draws light status icons there', () => {
  assert.match(css, /\n  --status-strip: #0F1114;/);
  assert.match(css, /body::before \{ content: ""; position: fixed; inset: 0 0 auto; height: env\(safe-area-inset-top\); background: var\(--status-strip\);/);
  assert.ok(!('--status-strip' in tokensOf(block(':root[data-theme="light"]'))));
});

test('L: the theme is a device choice applied before the first paint and on change', () => {
  const storage = {};
  const meta = { content: 'dark', setAttribute(name, value) { this[name] = value; } };
  const root = { dataset: {} };
  const ctx = withI18n({ localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; }, removeItem: key => { delete storage[key]; } }, document: { documentElement: root, querySelector: () => meta } });
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/\n  const THEMES = [^\n]+/)[0]}\n${fn('readTheme')}${fn('applyTheme')}`, ctx);
  assert.equal(ctx.readTheme(), 'dark');
  ctx.applyTheme('light');
  assert.deepEqual([storage.dailoTheme, root.dataset.theme, meta.content], ['light', 'light', 'light']);
  ctx.applyTheme('system');
  assert.deepEqual([storage.dailoTheme, root.dataset.theme, meta.content], ['system', 'system', 'dark light']);
  ctx.applyTheme('dark');
  assert.deepEqual([storage.dailoTheme, root.dataset.theme, meta.content], [undefined, undefined, 'dark']);
  assert.match(fn('init'), /applyTheme\(readTheme\(\)\);/);
  // The head script repeats the same choice before the stylesheet paints anything.
  const html = read('index.html');
  assert.ok(html.indexOf('<script src="js/appearance.js"></script>') < html.indexOf('<link rel="stylesheet" href="css/styles.css" />'));
  assert.ok(read('sw.js').includes("'js/appearance.js',"));
  const early = { dataset: {} };
  vm.runInNewContext(read('js/appearance.js'), { localStorage: { getItem: key => ({ dailoTheme: 'light', dailoTextSize: 'large' })[key] ?? null }, document: { documentElement: early, querySelector: () => meta } });
  assert.deepEqual([early.dataset.theme, early.dataset.textSize, meta.content], ['light', 'large', 'light']);
});

test('L: Settings → Opšte → "Tema": Tamna, Svetla or Prati sistem, only on this device', () => {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const html = adapter.renderRoute({ type: 'settings' }, {
    state: { tasks: [], projects: [], habits: [], notes: [], resources: [], settings: { backupStatus: {} } }, esc: value => String(value ?? ''), pageHeader: title => `<h1>${title}</h1>`,
    shortcutError: () => '', shortcutLabels: {}, notificationButtonLabel: () => 'Enable', release: { APP_VERSION: 'x' }, environmentInfo: () => ({ standalone: false, userAgent: '' }),
    notificationSettings: () => null, readAutoBackup: () => ({ enabled: false }), installPrompt: () => false, readTextSize: () => 'normal', readTheme: () => 'system', nowIso: () => '2026-10-12T08:00:00.000Z',
  });
  assert.match(html, /<div class="settings-row"><label class="settings-label" for="theme"><strong>Theme<\/strong><span>Only on this device\.<\/span><\/label><select class="input" id="theme"><option value="dark">Dark<\/option><option value="light">Light<\/option><option value="system" selected>Follow the system<\/option><\/select><\/div>/);
  assert.match(app, /if \(event\.target\.id === 'theme'\) \{ applyTheme\(event\.target\.value\); render\(\); return; \}/);
  for (const [en, value] of [['Theme', 'Tema'], ['Dark', 'Tamna'], ['Light', 'Svetla'], ['Follow the system', 'Prati sistem']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.match(read('docs/superpowers/specs/2026-10-08-redesign-decisions.md'), /M6 reopened \(2026-10-12\)/);
});

test('R39 is released as 2.0.0-alpha.65', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.65');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.65';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.65');
});
