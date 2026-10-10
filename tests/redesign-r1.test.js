// Redesign R1: shell and navigation (G1, G2, M4, Z1/Z3 first version, I1 badge, T1 search icon).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r1-shell.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

test('G1: the bottom bar is Danas, Inbox, Zadaci, Kalendar, Navike, Još', () => {
  const nav = html.match(/<nav id="mobile-bottom-nav"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]), ['today', 'inbox', 'tasks', 'calendar', 'habits', 'more']);
  assert.deepEqual([...nav.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]), ['Danas', 'Inbox', 'Zadaci', 'Kalendar', 'Navike', 'Još']);
  assert.doesNotMatch(html, /mobile-more-sheet-root|open-mobile-more/, 'the Još sheet is gone');
  assert.doesNotMatch(app, /MOBILE_MORE_ROUTES|openMobileMore|trapMobileMoreFocus|mobileMoreOpen/);
});

test('M4: Još is a screen with Zakačeno, Planiranje, Biblioteka, Arhiva and Podešavanja', () => {
  const routes = fn('currentRoute');
  assert.match(routes, /'tasks'/);
  assert.match(routes, /'more'/);
  const more = fn('renderMoreScreen');
  for (const label of ['Pinned', 'Planning', 'Library', 'Archives']) assert.match(more, new RegExp(`tr\\('${label}'\\)`), label);
  for (const route of ['goals', 'areas', 'cleaning', 'review', 'upcoming', 'notes', 'resources', 'tags', 'templates', 'saved-views', 'completed', 'archived', 'settings']) {
    assert.match(more, new RegExp(`'${route}'`), route);
  }
  assert.match(more, /isPinned/, 'pinned areas and saved views');
  assert.match(fn('renderMain'), /route\.type === 'more'\) content = renderMoreScreen\(\)/);
  assert.match(fn('renderMain'), /route\.type === 'tasks'\) content = renderTasksScreen\(\)/);
});

test('the bottom item lights up for nested routes', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/  const BOTTOM_NAV_PARENT = [^\n]+\n/)[0]}${fn('bottomNavRoute')}`, ctx);
  const cases = { today: 'today', inbox: 'inbox', anytime: 'tasks', projects: 'tasks', project: 'tasks', calendar: 'calendar', upcoming: 'calendar', habits: 'habits', habit: 'habits', goals: 'more', goal: 'more', areas: 'more', area: 'more', notes: 'more', note: 'more', resources: 'more', settings: 'more', completed: 'more', archived: 'more', 'saved-view': 'more', more: 'more', tasks: 'tasks' };
  for (const [type, expected] of Object.entries(cases)) assert.equal(ctx.bottomNavRoute({ type }), expected, type);
  assert.match(fn('renderMobileBottomNav'), /bottomNavRoute\(route\)/);
});

test('Z1/Z3: Zadaci has a summary and a Kad stignem / Projekti switch remembered on the device', () => {
  const screen = fn('renderTasksScreen');
  assert.match(screen, /state\.ui\.tasksView === 'projects'/);
  assert.match(screen, /data-action="tasks-view" data-view="\$\{key\}"/);
  assert.match(screen, /tab\('anytime', tr\('Anytime'\)\)\}\$\{tab\('projects', tr\('Projects'\)\)/);
  assert.match(screen, /aria-pressed/);
  assert.match(screen, /data-action="new-project"/);
  assert.match(app, /action === 'tasks-view'\) \{ state\.ui\.tasksView = el\.dataset\.view === 'projects' \? 'projects' : 'anytime'; saveAndRender\(\); \}/);
  assert.match(app, /next\.ui\.tasksView = next\.ui\.tasksView === 'projects' \? 'projects' : 'anytime';/);
  assert.match(sr, /"Anytime": "Kad stignem"/);
  assert.doesNotMatch(sr, /Bilo kada/, 'renamed everywhere');
});

test('the phone shell at every width: no sidebar, a centered column, the bar always shown', () => {
  const layer = css.slice(css.indexOf('/* Redesign R1'));
  assert.ok(css.indexOf('/* Redesign R1') > 0);
  assert.match(layer, /\.sidebar \{ display: none; \}/);
  assert.match(layer, /\.app-shell, \.app-shell\.is-collapsed \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(layer, /\.content:not\(\.calendar-content\) \{ max-width: 760px; margin-inline: auto; \}/);
  assert.match(css, /\n\.mobile-bottom-nav \{\n\s+position: fixed;/, 'the bar is no longer only inside a max-width query');
  assert.doesNotMatch(css, /\.mobile-bottom-nav \{ display: none; \}/);
  assert.match(layer, /\.page-header \[data-action="quick-add"\] \{ display: none; \}/, 'G2: no + in headers');
  assert.match(layer, /\.mobile-bottom-nav-badge \{ background: var\(--graphite-700\);/, 'I1: gray badge');
});

test('T1: the header Search is a magnifier icon with a name', () => {
  assert.match(fn('pageHeader'), /<button class="btn-icon page-search" type="button" data-action="open-search" aria-label="\$\{tr\('Search'\)\}"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><\/button>/);
});

test('R1 shipped as 2.0.0-alpha.5 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.([5-9]|\d{2,})$|^2\.\d+\.\d+/);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
