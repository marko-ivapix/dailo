// Modernization M7: mobile quality inside the app and the PWA (audit P-5, A-1, S-2 and the unnamed icon buttons).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/styles.css');
const html = read('index.html');
const app = read('js/app.js');

test('P-5: only a width change closes popovers; the keyboard and browser bars change the height', () => {
  assert.doesNotMatch(app, /addEventListener\('resize', closePopover\)/);
  const start = app.indexOf('  function closePopoverOnWidthChange(');
  assert.ok(start > 0, 'a named resize handler');
  const calls = [];
  const ctx = { window: { innerWidth: 390 }, closePopover: () => calls.push('close') };
  vm.createContext(ctx);
  vm.runInContext(`let popoverWidth = window.innerWidth;\n${app.slice(start, app.indexOf('\n  }\n', start) + 4)}`, ctx);
  ctx.closePopoverOnWidthChange();
  assert.deepEqual(calls, [], 'same width (keyboard opened): the popover stays');
  ctx.window.innerWidth = 844;
  ctx.closePopoverOnWidthChange();
  assert.deepEqual(calls, ['close'], 'rotation: the popover closes');
  ctx.closePopoverOnWidthChange();
  assert.deepEqual(calls, ['close']);
  assert.match(app, /addEventListener\('resize', closePopoverOnWidthChange\)/);
});

test('P-5: heights use the dynamic viewport where the browser supports it', () => {
  assert.match(css.slice(0, css.indexOf('}') + 1), /--viewport-height: 100vh;/, 'the token lives in the top token block');
  assert.match(css, /@supports \(height: 100dvh\) \{ :root \{ --viewport-height: 100dvh; \} \}/);
  const raw = css.replace(/--viewport-height: 100d?vh|\(height: 100dvh\)/g, '').match(/100d?vh/g) || [];
  assert.deepEqual(raw, [], 'every other height goes through --viewport-height');
});

test('P-5: form fields are 16 px on touch screens, so iOS does not zoom into them', () => {
  const block = css.slice(css.indexOf('/* Modernization M7'));
  assert.match(block, /@media \(pointer: coarse\) \{[\s\S]*input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\[type="color"\]\), select, textarea \{ font-size: 16px; \}/);
});

test('A-1: the touch-target guard also applies to touch screens wider than a phone', () => {
  assert.match(css, /\/\* Keep primary compact actions touchable after all density rules\. \*\/\n@media \(max-width: 700px\), \(pointer: coarse\) \{/);
  const block = css.slice(css.indexOf('/* Keep primary compact actions touchable'));
  assert.match(block, /\.sidebar-section-toggle[\s\S]*min-height: 44px/);
});

test('the toast sits above the bottom navigation and the home indicator; the add button moves up while it shows', () => {
  const block = css.slice(css.indexOf('/* Modernization M7'));
  assert.match(block, /@media \(max-width: 1023px\) \{[^}]*\.toast-root \{ bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(block, /body:has\(#toast-root \.toast\) \.mobile-quick-add \{ transform: translateY\(-[0-9]+px\); \}/);
});

test('every icon-only button has an accessible name', () => {
  const files = [...fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => `js/${file}`), 'index.html'];
  const unnamed = [];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/<button\b([^>]*)>(.{0,120}?)<\/button>/gs)) {
      const [, attrs, inner] = match;
      if (/aria-label=|title=/.test(attrs) || inner.replace(/<[^>]+>/g, '').trim()) continue;
      unnamed.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  assert.deepEqual(unnamed, []);
});

test('S-2: a Content Security Policy limits scripts, connections and plug-ins', () => {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/);
  assert.ok(meta, 'CSP meta in index.html');
  const policy = Object.fromEntries(meta[1].split(';').map(part => part.trim()).filter(Boolean).map(part => { const [name, ...values] = part.split(/\s+/); return [name, values]; }));
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['script-src'], ["'self'"], 'no inline scripts, no eval');
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'none'"]);
  assert.ok(policy['connect-src'].includes('https://*.supabase.co'), 'sync can reach Supabase');
  assert.ok(policy['img-src'].includes('blob:'), 'attachment previews');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), 'the policy comes before any resource');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script');
  assert.doesNotMatch(html, /\son[a-z]+="/, 'no inline event handlers');
});
