// R57: the link check for the public pages and the app.
// Internal (always): every href/src in the public pages, the manifest's paths and the pages the app names must exist,
// with their #anchors; addresses on the app's own site (SITE…) must exist here too, since they go live with this commit.
// External (--external, needs the network): every outside address in the pages and the app must answer. 404 and 410
// fail; 403, 429, 5xx and network errors only warn, because sites often refuse robots or are briefly down.
// Usage: node tools/check-links.mjs [--external]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE = 'https://marko-ivapix.github.io/dailo/';
export const PAGES = ['index.html', '404.html', 'privatnost.html', 'uslovi.html', 'uputstvo.html', 'pitanja.html', 'novo.html'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = /^(mailto:|tel:|data:|blob:)/;
// The sync server is configuration, not a page; its API root answers 404.
const NOT_PAGES = /supabase\.co/;
const URL_PATTERN = /https?:\/\/[^\s"'`<>()\\]+/g;

const appScripts = root => fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).sort().map(name => `js/${name}`);
const values = (html, names) => [...html.matchAll(new RegExp(`\\s(?:${names.join('|')})="([^"]*)"`, 'g'))].map(match => match[1]);
const anchors = html => new Set(values(html, ['id', 'name']));

export function findInternalProblems(root = ROOT, { pages = PAGES, manifest = 'manifest.webmanifest', scripts = appScripts(root) } = {}) {
  const problems = [];
  const exists = file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile();
  const report = (file, link, problem) => problems.push({ file, link, problem });
  // A path from the site's root (or from `dir`); `./` and folders mean their index.html.
  const resolve = (dir, target) => {
    const joined = path.posix.normalize(path.posix.join(dir, target));
    return joined === '.' || joined === './' || joined.endsWith('/') ? `${joined === '.' || joined === './' ? '' : joined}index.html` : joined;
  };
  // `shown` is the link as written, when an own-site address is checked as its local path.
  const check = (file, dir, link, ownAnchors, shown = link) => {
    if (/^javascript:/i.test(link)) return report(file, shown, 'a script in a link');
    if (SKIP.test(link) || link.startsWith('//')) return;
    if (/^https?:/i.test(link)) {
      if (!link.startsWith(SITE)) return;
      return check(file, '', link.slice(SITE.length) || './', null, link);
    }
    const [target, anchor = ''] = link.split('#');
    const clean = target.split('?')[0];
    if (!clean) {
      if (anchor && ownAnchors && !ownAnchors.has(anchor)) report(file, shown, 'no such anchor');
      return;
    }
    const resolved = resolve(dir, clean);
    if (resolved.startsWith('..') || !exists(resolved)) return report(file, shown, 'no such file');
    if (anchor && resolved.endsWith('.html') && !anchors(fs.readFileSync(path.join(root, resolved), 'utf8')).has(anchor)) report(file, shown, 'no such anchor');
  };

  for (const page of pages) {
    if (!exists(page)) { report(page, page, 'no such page'); continue; }
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    // A <base href="/…/"> (the 404 page) makes relative links start from the site's root.
    const base = html.match(/<base href="([^"]*)"/)?.[1];
    const dir = base?.startsWith('/') ? '' : path.posix.dirname(page).replace(/^\.$/, '');
    const body = html.replace(/<base [^>]*>/g, '');
    const own = anchors(html);
    for (const link of values(body, ['href', 'src'])) check(page, dir, link, own);
    for (const link of values(body, ['content']).filter(value => value.startsWith(SITE))) check(page, dir, link, own);
  }

  if (manifest && exists(manifest)) {
    const data = JSON.parse(fs.readFileSync(path.join(root, manifest), 'utf8'));
    const paths = [data.start_url, data.scope, data.share_target?.action, ...(data.icons || []).map(icon => icon.src),
      ...(data.shortcuts || []).flatMap(item => [item.url, ...(item.icons || []).map(icon => icon.src)])].filter(Boolean);
    for (const link of paths) check(manifest, '', link, null);
  }

  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), 'utf8');
    for (const match of source.matchAll(/['"`]([a-z0-9][a-z0-9-]*\.html)(#[\w-]+)?['"`]/g)) check(script, '', match[1] + (match[2] || ''), null);
    for (const url of source.match(URL_PATTERN) || []) if (url.startsWith(SITE) && !url.includes('${')) check(script, '', url, null);
  }
  return problems;
}

export function collectExternalLinks(root = ROOT, { pages = PAGES, manifest = 'manifest.webmanifest', scripts = appScripts(root) } = {}) {
  const files = [...pages, manifest, ...scripts].filter(file => file && fs.existsSync(path.join(root, file)));
  const urls = new Set();
  for (const file of files) {
    for (const raw of fs.readFileSync(path.join(root, file), 'utf8').match(URL_PATTERN) || []) {
      const url = raw.replace(/[.,;:]+$/, '');
      if (url.startsWith(SITE) || NOT_PAGES.test(url) || /\$\{|…|\*/.test(url)) continue;
      if (!/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(url)) continue;
      urls.add(url);
    }
  }
  return [...urls].sort();
}

export function classify(status) {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410) return 'broken';
  return 'unsure';
}

const HEADERS = { 'user-agent': `Mozilla/5.0 (compatible; DailoLinkCheck/1.0; +${SITE})`, accept: 'text/html,*/*;q=0.8' };

export async function checkExternal(urls, { fetchImpl = globalThis.fetch, retries = 1, pause = 2000, timeout = 15000 } = {}) {
  const results = [];
  for (const url of urls) {
    let result;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt) await new Promise(done => setTimeout(done, pause));
      try {
        const response = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: HEADERS, signal: AbortSignal.timeout(timeout) });
        await response.body?.cancel?.();
        result = { url, status: response.status, verdict: classify(response.status) };
      } catch (error) {
        result = { url, status: 0, verdict: 'unsure', error: error?.cause?.code || error?.name || String(error) };
      }
      if (result.verdict !== 'unsure') break;
    }
    results.push(result);
  }
  return results;
}

async function main() {
  const problems = findInternalProblems();
  for (const item of problems) console.log(`BROKEN  ${item.file}: ${item.link} (${item.problem})`);
  let broken = problems.length;
  if (process.argv.includes('--external')) {
    const results = await checkExternal(collectExternalLinks());
    for (const item of results) {
      if (item.verdict === 'broken') console.log(`BROKEN  ${item.url} (${item.status})`);
      else if (item.verdict === 'unsure') console.log(`WARN    ${item.url} (${item.status || item.error}): could not confirm`);
    }
    broken += results.filter(item => item.verdict === 'broken').length;
    console.log(`external: ${results.filter(item => item.verdict === 'ok').length}/${results.length} answered`);
  }
  console.log(broken ? `links: ${broken} broken` : 'links: OK');
  process.exitCode = broken ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
