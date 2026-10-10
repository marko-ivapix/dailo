// Boot smoke test of the real page in jsdom (npm run smoke): index.html with every script, then one full
// user flow — create a task in Quick Add, "close" the app, open it again on the same storage, find the task.
// It catches load-order mistakes and script errors the unit tests cannot see. It is not a browser or device
// check: IndexedDB uses the app's in-memory test database, and layout, fonts and touch are not exercised.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdom from 'jsdom';

const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// Every request is answered from the repository, so the smoke test never touches the network.
const repoFiles = requestInterceptor(request => {
  const file = path.join(root, decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
});

async function boot(storage) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', error => errors.push(String(error?.stack || error).split('\n')[0]));
  virtualConsole.on('jsdomError', error => errors.push(String(error?.message || error)));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://localhost/index.html', runScripts: 'dangerously', resources: { interceptors: [repoFiles] }, pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.__TODO_TEST_MEMORY_DB__ = true;
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      for (const [key, value] of storage) window.localStorage.setItem(key, value);
    },
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  for (let i = 0; i < 300 && !dom.window.TodoApp; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  if (!dom.window.TodoApp) throw new Error(`TodoApp did not start: ${errors.join(' | ')}`);
  await dom.window.TodoApp.ready;
  return { dom, window: dom.window, errors };
}

const keep = window => new Map(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
const fail = message => { console.error(`smoke: FAIL — ${message}`); process.exit(1); };

const first = await boot(new Map());
const { window } = first;
if (!window.TodoApp.state) fail('no state after start');
if (window.DailoPlatform?.kind !== 'web') fail(`platform is ${window.DailoPlatform?.kind}`);
const title = `Smoke ${Date.now()}`;
window.TodoApp.openQuickAdd();
const input = window.document.querySelector('#quick-title');
if (!input) fail('Quick Add did not open');
input.value = title;
input.dispatchEvent(new window.Event('input', { bubbles: true }));
window.document.querySelector('[data-action="create-task"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (!window.TodoApp.state.tasks.some(task => task.title === title)) fail('the task was not created');
// Android Back (M4): it closes the open dialog, then reports nothing left to close.
window.TodoApp.openQuickAdd();
if (!window.document.querySelector('#quick-title')) fail('Quick Add did not reopen');
if (window.TodoApp.handleBackButton() !== true || window.document.querySelector('#quick-title')) fail('Back did not close Quick Add');
if (window.TodoApp.handleBackButton() !== false) fail('Back reported a closed overlay when none was open');
// A-2 (M12): a route change names the page and focuses its heading; a re-render keeps the focused control.
window.location.hash = '#inbox';
await new Promise(resolve => setTimeout(resolve, 50));
const heading = window.document.querySelector('#main .page-title');
if (!/ · Dailo$/.test(window.document.title) || window.document.activeElement !== heading) fail(`route change: title "${window.document.title}", focus ${window.document.activeElement?.tagName}`);
// Redesign R1: "Još" is a screen reached from the bottom bar; its rows open the other screens.
window.document.querySelector('#mobile-bottom-nav [data-route="more"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
const goalsRow = window.document.querySelector('#main .more-row[data-route="goals"]');
if (!goalsRow) fail('the Još screen has no Ciljevi row');
goalsRow.focus();
window.TodoApp.render();
if (!window.document.activeElement?.matches?.('#main .more-row[data-route="goals"]')) fail(`focus was lost on re-render (${window.document.activeElement?.tagName})`);
goalsRow.ownerDocument.querySelector('#main .more-row[data-route="goals"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise(resolve => setTimeout(resolve, 50));
if (window.location.hash !== '#goals' || !window.document.querySelector('#mobile-bottom-nav [data-route="more"]').classList.contains('is-active')) fail('Ciljevi did not open under Još');
window.location.hash = '#tasks';
await new Promise(resolve => setTimeout(resolve, 50));
window.document.querySelector('#main [data-action="tasks-view"][data-view="projects"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
if (window.TodoApp.state.ui.tasksView !== 'projects' || !window.document.querySelector('#main .more-row[data-route^="project/"]')) fail('the Zadaci switch did not show the projects');
window.dispatchEvent(new window.Event('pagehide'));
const saved = keep(window);
first.dom.window.close();

const second = await boot(saved);
const found = second.window.TodoApp.state.tasks.find(task => task.title === title);
if (!found) fail('the task is missing after reopening');
const errors = [...first.errors, ...second.errors];
second.dom.window.close();
if (errors.length) fail(`script errors: ${errors.join(' | ')}`);
console.log(`smoke: OK — started, created "${title}", Back closed Quick Add, route change named the page and focused its heading, Još opened Ciljevi, focus survived a re-render, the Zadaci switch showed the projects, reopened and found it (tasks: ${second.window.TodoApp.state?.tasks?.length ?? 'n/a'})`);
process.exit(0);
