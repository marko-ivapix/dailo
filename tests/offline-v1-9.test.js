const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const Release = require('../js/release.js');

const html = read('index.html');
const localRefs = source => [...source.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(ref => !/^(?:https?:|mailto:|#|data:)/.test(ref));
const cssUrls = (file) => [...read(file).matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));

test('no CDN stylesheet, script or preconnect remains in index.html', () => {
  assert.doesNotMatch(html, /https?:\/\//, 'every asset is local so the app starts offline');
  for (const ref of localRefs(html)) assert.ok(exists(ref), `${ref} exists`);
});

test('fonts are self-hosted variable woff2 files covering Latin and Serbian Latin', () => {
  assert.match(html, /<link rel="stylesheet" href="vendor\/fonts\/fonts\.css" \/>/);
  const css = read('vendor/fonts/fonts.css');
  for (const family of ['Geist', 'Space Grotesk']) {
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map(match => match[1]).filter(body => body.includes(`font-family: '${family}';`));
    assert.equal(faces.length, 2, `${family} has latin and latin-ext faces`);
    assert.ok(faces.some(body => /unicode-range: U\+0000-00FF/.test(body)), `${family} latin`);
    assert.ok(faces.some(body => /unicode-range: U\+0100-02BA/.test(body)), `${family} latin-ext (č ć đ š ž)`);
  }
  for (const url of cssUrls('vendor/fonts/fonts.css')) {
    assert.match(url, /\.woff2$/);
    assert.ok(exists(url), `${url} exists`);
  }
  for (const license of ['vendor/fonts/LICENSE-Geist.txt', 'vendor/fonts/LICENSE-SpaceGrotesk.txt']) assert.match(read(license), /SIL Open Font License/);
});

test('Phosphor icons are vendored with local woff2 only, and every icon the app names exists', () => {
  const regular = read('vendor/phosphor/regular.css');
  const fill = read('vendor/phosphor/fill.css');
  for (const file of ['vendor/phosphor/regular.css', 'vendor/phosphor/fill.css']) {
    const urls = cssUrls(file);
    assert.equal(urls.length, 1, `${file} declares a single font source`);
    assert.match(urls[0], /\.woff2$/);
    assert.ok(exists(urls[0]), `${urls[0]} exists`);
  }
  assert.match(read('vendor/phosphor/LICENSE'), /MIT License/);
  const sources = ['index.html', ...fs.readdirSync(path.join(root, 'js')).map(file => `js/${file}`)].map(read).join('\n');
  const used = new Set([...sources.matchAll(/\bph-[a-z0-9-]+/g)].map(match => match[0]).filter(name => name !== 'ph-fill' && !name.endsWith('-')));
  assert.ok(used.size > 50, 'icon names were found');
  const missing = [...used].filter(name => !regular.includes(`.ph.${name}:before`) && !fill.includes(`.ph-fill.${name}:before`));
  assert.deepEqual(missing, []);
});

function shellFilesExpected() {
  const files = new Set(['index.html']);
  for (const ref of localRefs(html)) {
    files.add(ref);
    if (ref.endsWith('.css')) for (const url of cssUrls(ref)) files.add(url);
  }
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons) files.add(icon.src);
  return [...files].sort();
}

function loadWorker() {
  const listeners = {};
  const cacheStore = new Map([['dailo-shell-1.0.0', new Map()], ['unrelated-cache', new Map()]]);
  const calls = { skipWaiting: 0, claim: 0, deleted: [], added: null };
  const scope = 'https://example.test/dailo/';
  const caches = {
    open: async name => {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      return { addAll: async files => { calls.added = { name, files }; for (const file of files) cacheStore.get(name).set(new URL(file, scope).href, `cached:${file}`); } };
    },
    keys: async () => [...cacheStore.keys()],
    delete: async name => { calls.deleted.push(name); return cacheStore.delete(name); },
    match: async url => { for (const cache of cacheStore.values()) if (cache.has(url)) return cache.get(url); return undefined; },
  };
  const self = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    registration: { scope },
    location: new URL('sw.js', scope),
    clients: { claim: async () => { calls.claim += 1; } },
    skipWaiting: () => { calls.skipWaiting += 1; },
  };
  vm.runInNewContext(read('sw.js'), { self, caches, URL, fetch: async request => `network:${request.url}`, Promise, console });
  const dispatch = async (type, data) => {
    const waits = [];
    let response;
    listeners[type]({ ...data, waitUntil: promise => waits.push(promise), respondWith: value => { response = value; } });
    await Promise.all(waits);
    return response === undefined ? undefined : await response;
  };
  return { listeners, calls, dispatch, scope };
}

test('service worker precaches exactly the runtime shell under a versioned cache', async () => {
  const sw = read('sw.js');
  assert.match(sw, new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`), 'sw.js version equals APP_VERSION');
  const worker = loadWorker();
  await worker.dispatch('install', {});
  assert.equal(worker.calls.added.name, `dailo-shell-${Release.APP_VERSION}`);
  assert.deepEqual([...worker.calls.added.files].sort(), shellFilesExpected());
  for (const file of worker.calls.added.files) assert.ok(exists(file), `${file} exists`);
  await worker.dispatch('activate', {});
  assert.deepEqual(worker.calls.deleted, ['dailo-shell-1.0.0'], 'only older Dailo shells are removed');
  assert.equal(worker.calls.claim, 1);
});

test('service worker serves the shell and app page from cache and leaves everything else to the network', async () => {
  const worker = loadWorker();
  await worker.dispatch('install', {});
  const get = (url, mode = 'no-cors', method = 'GET') => worker.dispatch('fetch', { request: { url: new URL(url, worker.scope).href, mode, method } });
  assert.equal(await get('js/core.js'), 'cached:js/core.js');
  assert.equal(await get('css/styles.css?v=2'), 'cached:css/styles.css', 'query strings do not bypass the shell');
  assert.equal(await get('./', 'navigate'), 'cached:index.html');
  assert.equal(await get('index.html#today', 'navigate'), 'cached:index.html');
  assert.equal(await get('README.md', 'navigate'), undefined, 'other pages under the scope are not replaced by the app');
  assert.equal(await get('Dailo-v1.9-distributable.zip', 'navigate'), undefined, 'downloads go to the network');
  assert.equal(await get('docs/claude/README.md'), undefined);
  assert.equal(await get('https://other.example/x.js'), undefined, 'cross-origin requests are untouched');
  assert.equal(await get('js/core.js', 'no-cors', 'POST'), undefined, 'non-GET requests are untouched');
});

test('a waiting worker activates only when the page asks after the user chooses to refresh', async () => {
  const worker = loadWorker();
  await worker.dispatch('message', { data: { type: 'other' } });
  assert.equal(worker.calls.skipWaiting, 0);
  await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
  assert.equal(worker.calls.skipWaiting, 1);
  assert.doesNotMatch(read('sw.js').replace(/self\.addEventListener\('message'[\s\S]*?\n\}\);/, ''), /skipWaiting/, 'skipWaiting appears only in the message handler');

  const app = read('js/app.js');
  const register = app.slice(app.indexOf('  function registerServiceWorker('), app.indexOf('\n  }\n', app.indexOf('  function registerServiceWorker(')));
  assert.match(register, /location\.protocol === 'https:'/);
  assert.match(register, /'localhost'/);
  assert.match(register, /serviceWorker\.register\('sw\.js'\)/);
  const skipPosts = [...app.matchAll(/postMessage\(\{ type: 'SKIP_WAITING' \}\)/g)];
  assert.equal(skipPosts.length, 1, 'one place asks the worker to activate');
  const applyUpdate = app.slice(app.indexOf('  function applyAppUpdate('), app.indexOf('\n  }\n', app.indexOf('  function applyAppUpdate(')));
  assert.match(applyUpdate, /postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(app, /action === 'apply-app-update'\) applyAppUpdate\(\)/);
  assert.match(app, /data-action="apply-app-update"/);
});
