// Redesign R34: the third design pass, cleanup (findings 19 and 38).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r34-cleanup.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/styles.css');
const app = read('js/app.js');
const runtime = [...fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => `js/${file}`), 'index.html'];
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

// The stylesheet without comments, and without the :root token blocks (top level or inside a media query).
const plainCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
const outsideRoot = plainCss.replace(/:root(?:\[[^\]]*\])?(?::not\([^)]*\))?\s*\{[^}]*\}/g, '');

test('38: every class the stylesheet styles is emitted by a runtime file', () => {
  // Words of the runtime files without their comments; a class built as "prefix-${…}" or 'prefix-' + … counts for
  // every class that starts with that prefix.
  const sources = runtime.map(read).join('\n').replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/([\s{;])\/\*[^\n]*?\*\//g, '$1').replace(/(^|\s)\/\/.*$/gm, '$1');
  const words = new Set(sources.match(/[A-Za-z_][\w-]*/g));
  const prefixes = [...sources.matchAll(/([A-Za-z_][\w-]*-)\$\{/g), ...sources.matchAll(/['"`]([A-Za-z_][\w-]*-)['"`]\s*\+/g)].map(match => match[1]);
  const outer = selector => { let depth = 0, out = ''; for (const ch of selector) { if (ch === '(') depth += 1; if (!depth) out += ch; if (ch === ')') depth -= 1; } return out; };
  const selectors = [...plainCss.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).filter(selector => !selector.startsWith('@'));
  const classes = new Set(selectors.flatMap(selector => [...outer(selector).matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1])));
  const dead = [...classes].filter(name => !/^\d/.test(name) && !words.has(name) && !prefixes.some(prefix => name.startsWith(prefix)));
  assert.deepEqual(dead, [], 'classes no runtime file emits');
});

test('38: the old rows, the sidebar helpers and actions nothing sends are gone', () => {
  const all = runtime.map(read).join('\n');
  for (const gone of ['function renderGoalRow', 'function renderHabitRow', 'function habitProgressLabel', 'function navItem', 'function deleteHabit', 'function reorderProjects', 'function toLocalDateTimeValue', 'function restoreImportedBackup', 'function setPlan(', 'function setDue(']) assert.ok(!all.includes(gone), gone);
  for (const action of ['habit-checkin', 'habit-quick-add', 'toggle-focus-task', 'open-focus-task', 'quick-due-picker', 'set-plan', 'calendar-new-goal', 'restore-backup']) assert.ok(!all.includes(`action === '${action}'`), action);
  assert.match(read('js/tasks-ui.js'), /function renderTaskRow\(task, listContext, options, ctx\) \{\n\s+\/\/ R34[^\n]*\n\s+return renderTodayTaskRow\(task, listContext, options, ctx\);\n\s+\}/);
});

test('38: colors are tokens: no hex or rgb() value outside :root', () => {
  const hex = outsideRoot.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  const rgb = outsideRoot.match(/rgba?\([^)]*\)/g) || [];
  assert.deepEqual([...hex, ...rgb], []);
  for (const [token, value] of [['--on-accent', '#FFFFFF'], ['--on-accent-wash', 'rgba(255, 255, 255, .2)'], ['--on-success', 'var(--graphite-900)'], ['--scrim', 'rgba(5, 6, 8, .66)'], ['--selection', 'rgba(133, 144, 255, .32)'], ['--ink-wash', 'rgba(255, 255, 255, .025)'], ['--blue-tint', 'rgba(83, 98, 255, .08)'], ['--danger-line', '#6A3B3E'], ['--danger-ink', '#FFD0D0'], ['--danger-hover', '#E2454A']]) assert.ok(css.includes(`\n  ${token}: ${value};`), token);
  const selfReferences = [...css.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\)/g)].filter(match => match[1] === match[2]).map(match => match[1]);
  assert.deepEqual(selfReferences, [], 'no token is defined as itself');
  // One scrim for windows, sheets and the "+" menu.
  for (const rule of ['.modal-backdrop {', '.sheet-backdrop {', '.mobile-quick-add-scrim {']) assert.match(plainCss.slice(plainCss.lastIndexOf(rule)), /^[^}]*background: var\(--scrim\)/, rule);
});

test('38: font sizes come from the type scale; fields stay at 16 px so phones do not zoom', () => {
  assert.deepEqual(outsideRoot.match(/font-size:\s*[\d.]+px/g) || [], []);
  for (const [token, value] of [['--text-3xs', '9px'], ['--text-2xs', '10px'], ['--text-xs', '11px'], ['--text-sm', '12px'], ['--text-meta', '12.5px'], ['--text-md', '13px'], ['--text-base', '14px'], ['--text-body', '15px'], ['--text-lg', '16px'], ['--text-title', '17px'], ['--text-lead', '18px'], ['--text-xl', '20px'], ['--text-heading', '22px'], ['--text-2xl', '24px'], ['--text-page', '26px'], ['--text-display', '28px'], ['--text-hero', '40px'], ['--text-input', '16px']]) assert.match(css, new RegExp(`\\n  ${token}: ${value.replace('.', '\\.')};`), token);
  assert.match(plainCss, /select, textarea \{ font-size: var\(--text-input\); \}/);
});

test('38: sheets share one radius token and heights follow the dynamic viewport', () => {
  assert.match(css, /\n  --radius-sheet: 18px;/);
  assert.doesNotMatch(outsideRoot, /border-radius: 18px/);
  assert.deepEqual(outsideRoot.match(/[\d.]+vh\b/g) || [], [], 'heights use --viewport-height (100dvh where supported)');
});

test('19: the density setting applies on wide screens only and is not written inline', () => {
  const main = fn('renderMain');
  assert.doesNotMatch(main, /style\.setProperty\('--(content-gutter|control-height|task-min-height)'/);
  assert.match(main, /document\.documentElement\.dataset\.density = state\.settings\.compactDensity === false \? 'comfortable' : 'compact';/);
  assert.match(css, /@media \(min-width: 1024px\) \{\n  :root\[data-density="comfortable"\] \{ --content-gutter: 24px; --control-height: 38px; --task-min-height: 52px; \}\n  :root\[data-density="compact"\] \{ --content-gutter: 20px; --control-height: 32px; --task-min-height: 44px; \}\n\}/);
  // Phones and tablets keep the compact sizes they always had: no narrow-screen :root overrides them.
  assert.match(plainCss, /\n:root \{\n  --content-gutter: 20px;\n  --control-height: 32px;\n  --task-min-height: 44px;/);
  assert.doesNotMatch(plainCss, /  :root \{ --content-gutter: (12|16|24)px;/);
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const html = adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { backupStatus: {} } }, esc: value => String(value ?? ''), pageHeader: title => `<h1>${title}</h1>`, shortcutError: () => '', shortcutLabels: {},
    notificationButtonLabel: () => 'Enable', release: { APP_VERSION: 'x' }, environmentInfo: () => ({ standalone: false, userAgent: '' }),
    notificationSettings: () => null, readAutoBackup: () => ({ enabled: false }), installPrompt: () => false,
  });
  assert.match(html, /<div class="settings-row settings-wide-only"><label class="settings-label" for="preference-density">/);
  assert.match(css, /@media \(max-width: 1023px\) \{ \.settings-wide-only \{ display: none; \} \}/);
});

test('R34 is released as 2.0.0-alpha.60', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.60');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.60';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.60');
});


