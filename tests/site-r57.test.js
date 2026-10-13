// R57: what the public pages need besides the app — a description and a preview when a link is shared, a Serbian
// 404 page on GitHub Pages, and a link check (internal links in this suite, outside links in .github/workflows/links.yml).
// Spec: docs/superpowers/specs/2026-10-12-r57-site-basics.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Release = require('../js/release.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const SITE = 'https://marko-ivapix.github.io/dailo/';
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"\\s*/?>`))?.[1];
const links = () => import('../tools/check-links.mjs');

test('every public page has a description and a sharing preview with the 1200×630 image', () => {
  const pages = { 'index.html': '', 'privatnost.html': 'privatnost.html', 'uslovi.html': 'uslovi.html', 'uputstvo.html': 'uputstvo.html' };
  for (const [page, address] of Object.entries(pages)) {
    const html = read(page);
    const description = meta(html, 'name', 'description');
    assert.ok(description && description.length >= 50 && description.length <= 160, `${page}: description of 50–160 characters`);
    assert.equal(meta(html, 'property', 'og:description'), description, `${page}: the preview says the same`);
    assert.ok(meta(html, 'property', 'og:title')?.startsWith('Dailo'), `${page}: og:title`);
    assert.equal(meta(html, 'property', 'og:url'), SITE + address, `${page}: og:url`);
    assert.equal(meta(html, 'property', 'og:image'), `${SITE}icons/og-image.png`, `${page}: og:image`);
    assert.equal(meta(html, 'property', 'og:image:width'), '1200');
    assert.equal(meta(html, 'property', 'og:image:height'), '630');
    assert.ok(meta(html, 'property', 'og:image:alt'), `${page}: og:image:alt`);
    assert.equal(meta(html, 'property', 'og:type'), 'website');
    assert.equal(meta(html, 'property', 'og:site_name'), 'Dailo');
    assert.equal(meta(html, 'property', 'og:locale'), 'sr_RS');
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
  }
  const png = fs.readFileSync(path.join(root, 'icons/og-image.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.ok(png.length < 300 * 1024, 'small enough for messengers');
  assert.match(read('tools/generate-icons.py'), /def og_image\(\):/);
});

test('the 404 page: Serbian, not indexed, works at any depth through its base, and leads back to the app', () => {
  const html = read('404.html');
  assert.match(html, /^<!doctype html>\n<html lang="sr-Latn">/);
  assert.match(html, /<base href="\/dailo\/">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<title>Dailo — Stranica nije pronađena<\/title>/);
  assert.match(html, /<a class="back" href="\.\/">Otvori Dailo<\/a>/);
  for (const page of ['uputstvo.html', 'privatnost.html', 'uslovi.html']) assert.ok(html.includes(`href="${page}"`), page);
  assert.doesNotMatch(html, /<script/, 'no script');
  const sw = read('sw.js');
  assert.ok(!sw.includes("'404.html'") && !sw.includes("'icons/og-image.png'"), 'neither is part of the offline app');
});

test('the link check: no broken internal link, anchor or own-site address; it finds planted ones', async () => {
  const { findInternalProblems, SITE: site } = await links();
  assert.equal(site, SITE);
  assert.deepEqual(findInternalProblems(root), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailo-links-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<a href="missing.html">x</a><a href="#nowhere">y</a><a href="guide.html#part">z</a><img src="icons/a.png" alt=""><a href="${SITE}gone.html">w</a><a href="mailto:a@b.c">m</a><a href="javascript:alert(1)">j</a>`);
  fs.writeFileSync(path.join(dir, 'guide.html'), '<h2 id="other">Other</h2>');
  const problems = findInternalProblems(dir, { pages: ['index.html'], manifest: null, scripts: [] });
  assert.deepEqual(problems.map(item => [item.file, item.link]), [
    ['index.html', 'missing.html'], ['index.html', '#nowhere'], ['index.html', 'guide.html#part'], ['index.html', 'icons/a.png'], ['index.html', `${SITE}gone.html`], ['index.html', 'javascript:alert(1)'],
  ]);
});

test('outside links: collected from the pages and the app, own site and the sync server left out; 404 fails, 403 only warns', async () => {
  const { collectExternalLinks, classify, checkExternal } = await links();
  const urls = collectExternalLinks(root);
  // R67: the starter examples no longer link the hiking and camping sites; the book link and the pages' links remain.
  for (const url of ['https://jamesclear.com/atomic-habits', 'https://www.poverenik.rs']) assert.ok(urls.includes(url), url);
  assert.ok(urls.every(url => !url.startsWith(SITE) && !url.includes('supabase.co') && !url.includes('${') && !url.includes('…')));
  assert.deepEqual([200, 301, 404, 410, 403, 429, 500, 0].map(classify), ['ok', 'ok', 'broken', 'broken', 'unsure', 'unsure', 'unsure', 'unsure']);
  const calls = [];
  const fetchImpl = async url => { calls.push(url); if (url.endsWith('/flaky') && calls.filter(item => item === url).length === 1) throw new Error('reset'); return { status: url.endsWith('/gone') ? 404 : 200, body: null }; };
  const results = await checkExternal(['https://a.test/ok', 'https://a.test/gone', 'https://a.test/flaky'], { fetchImpl, retries: 1, pause: 0 });
  assert.deepEqual(results.map(item => [item.url, item.verdict]), [['https://a.test/ok', 'ok'], ['https://a.test/gone', 'broken'], ['https://a.test/flaky', 'ok']]);
});

test('npm run check:links runs it; a weekly workflow checks the outside links', () => {
  assert.equal(JSON.parse(read('package.json')).scripts['check:links'], 'node tools/check-links.mjs');
  const workflow = read('.github/workflows/links.yml');
  assert.match(workflow, /schedule:\n\s+- cron: '/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /run: node tools\/check-links\.mjs --external/);
});

test('R57 shipped as 2.0.0-alpha.84 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 84);
});
