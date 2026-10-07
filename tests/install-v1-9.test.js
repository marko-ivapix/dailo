const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function renderSettings(standalone) {
  let adapter;
  vm.runInNewContext(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
    environmentInfo: () => ({ userAgent: 'iPhone', standalone }),
  });
}

test('web app manifest makes Dailo installable as a standalone Serbian app under any sub-path', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Dailo');
  assert.equal(manifest.short_name, 'Dailo');
  assert.equal(manifest.lang, 'sr-Latn');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0F1114');
  assert.equal(manifest.theme_color, '#0F1114');
  const bySize = Object.fromEntries(manifest.icons.map(icon => [`${icon.sizes}:${icon.purpose || 'any'}`, icon]));
  for (const key of ['192x192:any', '512x512:any', '512x512:maskable']) {
    const icon = bySize[key];
    assert.ok(icon, `manifest declares ${key}`);
    assert.equal(icon.type, 'image/png');
    assert.doesNotMatch(icon.src, /^\//, 'icon paths are relative for GitHub Pages');
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(icon.src), { width, height });
  }
});

test('index.html declares the manifest, icons, iOS standalone meta and a safe-area viewport', () => {
  const html = read('index.html');
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Dailo" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" \/>/);
  assert.match(html, /<meta name="theme-color" content="#0F1114" \/>/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest" \/>/);
  const touchIcon = html.match(/<link rel="apple-touch-icon" href="([^"]+)" \/>/);
  assert.ok(touchIcon, 'apple-touch-icon link');
  assert.deepEqual(pngSize(touchIcon[1]), { width: 180, height: 180 });
  const svgIcon = html.match(/<link rel="icon" href="([^"]+\.svg)" type="image\/svg\+xml" \/>/);
  assert.ok(svgIcon && fs.existsSync(path.join(root, svgIcon[1])), 'SVG favicon exists');
  assert.match(read(svgIcon[1]), /^<svg [^>]*viewBox="0 0 30 30"/);
});

test('standalone layout keeps content and sticky bars below the iOS status bar', () => {
  const css = read('css/styles.css');
  const layer = css.slice(css.indexOf('V1.9 Beta-ready additions'));
  assert.match(layer, /\.app-shell \{ padding-top: env\(safe-area-inset-top\); \}/);
  assert.match(layer, /\.sidebar, \.global-warning, \.v17-sticky-context \{ top: env\(safe-area-inset-top\); \}/);
  assert.match(layer, /@media \(max-width: 700px\) \{\n  \.modal \{ max-height: calc\(100vh - 24px - env\(safe-area-inset-top\)\); \}/, 'phone sheets stay below the status bar');
});

test('Settings explains how to install, or confirms the app is installed', () => {
  const browser = renderSettings(false);
  assert.match(browser, /data-install-status="browser"/);
  assert.match(browser, /Add to Home Screen/);
  assert.match(browser, /kept separately/);
  const installed = renderSettings(true);
  assert.match(installed, /data-install-status="installed"/);
  assert.doesNotMatch(installed, /Add to Home Screen/);
});
