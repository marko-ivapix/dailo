// Redesign R47a: the desktop layer, part 1 — the sidebar (K1), widths (K2), the labelled "+" (K12) and keys (K10).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r47-desktop.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const html = read('index.html');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const desktop = css.slice(css.indexOf('/* Redesign R47a'));

test('K1: the page has a sidebar next to the content; the "+" carries a label for wide screens', () => {
  assert.match(html, /<div id="app" class="app-shell">\n    <aside id="desktop-sidebar" class="desktop-sidebar" aria-label="Glavni meni"><\/aside>\n    <main id="main" class="main" tabindex="-1"><\/main>/);
  assert.match(html, /aria-controls="mobile-quick-add-menu"><i class="ph ph-plus" aria-hidden="true"><\/i><span class="quick-add-label" id="quick-add-label">Novi zadatak<\/span><\/button>/);
  assert.match(fn('renderView'), /renderMain\(\);\n    renderMobileBottomNav\(\);\n    renderSidebar\(\);/);
});

test('K1: what the sidebar holds', () => {
  const sidebar = fn('renderSidebar');
  for (const part of [
    'class="sidebar-brand"', 'data-action="toggle-sidebar"', 'class="sidebar-sync"', 'data-action="open-search"',
    "sidebarItem('today', 'ph-sun', tr('Today'), todayCount)", 'data-sidebar-drop="tomorrow"', "tr('Drag here for tomorrow')",
    "sidebarItem('inbox', 'ph-tray', tr('Inbox'), inboxCount, true)", "sidebarItem('tasks', 'ph-list-checks', tr('Tasks'))", "sidebarItem('calendar', 'ph-calendar-blank', tr('Calendar'))", "sidebarItem('habits', 'ph-repeat', tr('Habits'))",
    "sidebarGroup('pinned', tr('Pinned')", "sidebarGroup('projects', tr('Projects')", "sidebarGroup('planning', tr('Planning')", "sidebarGroup('library', tr('Library')", "sidebarGroup('archives', tr('Archives')",
    "sidebarItem('settings', 'ph-gear', tr('Settings'))", "sidebarItem('account', 'ph-user-circle', tr('Account'))",
  ]) assert.ok(sidebar.includes(part), part);
  // Projects are grouped by area with their open counts; folds are remembered on this device.
  assert.match(app, /function sidebarProjectGroups\(\)/);
  assert.match(fn('toggleSidebarFold'), /localStorage\.setItem\('dailoSidebarFolds', JSON\.stringify\(folds\)\)/);
  assert.match(fn('toggleSidebar'), /localStorage\.setItem\('dailoSidebar', collapsed \? 'collapsed' : 'open'\)/);
});

test('K1: projects grouped by area with open counts, archived ones left out', () => {
  const start = app.indexOf('\n  function sidebarProjectGroups(') + 1;
  const body = app.slice(start, app.indexOf('\n  }\n', start) + 4);
  const context = withI18n({
    sortedProjects: () => [{ id: 'p1', name: 'Kuhinja', areaId: 'a1' }, { id: 'p2', name: 'Posao', areaId: null }, { id: 'p3', name: 'Bašta', areaId: 'a1' }, { id: 'p4', name: 'Stari', areaId: 'a9' }],
    sortedAreas: () => [{ id: 'a1', name: 'Kuća', status: 'active' }, { id: 'a9', name: 'Gotovo', status: 'archived' }],
    projectTasks: id => ({ p1: [{ isCompleted: false }, { isCompleted: true }], p2: [], p3: [{ isCompleted: false }, { isCompleted: false }], p4: [{ isCompleted: false }] })[id],
  });
  vm.createContext(context);
  vm.runInContext(body, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.sidebarProjectGroups())), [
    { title: 'Kuća', projects: [{ id: 'p1', name: 'Kuhinja', open: 1 }, { id: 'p3', name: 'Bašta', open: 2 }] },
    { title: 'Gotovo', projects: [{ id: 'p4', name: 'Stari', open: 1 }] },
    { title: 'Without area', projects: [{ id: 'p2', name: 'Posao', open: 0 }] },
  ]);
});

test('K1, K2: on wide screens the sidebar replaces the bottom bar; it folds to icons; "‹ Još" is not needed', () => {
  assert.match(css, /@media \(max-width: 1023px\) \{ \.desktop-sidebar \{ display: none; \} \}/);
  assert.match(desktop, /@media \(min-width: 1024px\) \{\n  \.app-shell \{ display: grid; grid-template-columns: var\(--sidebar-width\) minmax\(0, 1fr\); \}/);
  assert.match(desktop, /  \.mobile-bottom-nav \{ display: none; \}/);
  assert.match(desktop, /  :root\[data-sidebar="collapsed"\] \{ --sidebar-width: 60px; \}/);
  assert.match(desktop, /  \.screen-topbar:has\(> \.screen-back\[data-route="more"\]\) \{ display: none; \}/);
  assert.match(css, /\n  --sidebar-width: 264px;/);
});

test('K12: on a wide screen the "+" adds a task where nothing else belongs, and its label says what it adds', () => {
  const context = withI18n({ location: { hash: '#today' }, wide: false, matchMedia: () => ({ matches: context.wide }), openQuickAdd: () => 'quick' });
  vm.createContext(context);
  vm.runInContext(`const QUICK_ADD_DIRECT = { '#habits': ['New habit', () => 'habit'] };\n${app.match(/\n  const DESKTOP_NEW_TASK = [^\n]+/)[0]}\n${app.match(/\n  const wideScreen = [^\n]+/)[0]}\n${app.match(/\n  const quickAddDirect = [^\n]+/)[0]}`, context);
  assert.equal(vm.runInContext('quickAddDirect()', context), null, 'the phone opens the menu');
  context.wide = true;
  assert.equal(vm.runInContext('quickAddDirect()[0]', context), 'New task');
  assert.equal(vm.runInContext('quickAddDirect()[1]()', context), 'quick');
  context.location.hash = '#habits';
  assert.equal(vm.runInContext('quickAddDirect()[0]', context), 'New habit');
  assert.match(fn('syncQuickAddToggle'), /const label = \$\('#quick-add-label'\);\n    if \(label\) label\.textContent = tr\(quickAddDirect\(\)\?\.\[0\] \|\| msg\('New task'\)\);/);
  assert.match(desktop, /  \.quick-add-label \{ display: inline; \}/);
  assert.match(css, /\.quick-add-label \{ display: none; \}/);
});

test('K10: 1–5 open the main screens, [ folds the sidebar; ← → and T move the calendar', () => {
  const keys = fn('handleKeydown');
  assert.match(app, /const DESKTOP_KEYS = Object\.freeze\(\{ 1: 'today', 2: 'inbox', 3: 'tasks', 4: 'calendar', 5: 'habits' \}\);/);
  assert.match(keys, /if \(!event\.ctrlKey && !event\.metaKey && !event\.altKey && DESKTOP_KEYS\[event\.key\]\) \{ event\.preventDefault\(\); navigate\(DESKTOP_KEYS\[event\.key\]\); return; \}/);
  assert.match(keys, /if \(event\.key === '\[' && !event\.ctrlKey && !event\.metaKey && !event\.altKey && wideScreen\(\)\) \{ event\.preventDefault\(\); toggleSidebar\(\); return; \}/);
  assert.match(keys, /if \(currentRoute\(\)\.type === 'calendar' && !event\.ctrlKey && !event\.metaKey && !event\.altKey && !event\.shiftKey\) \{\n        if \(event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'\) \{ event\.preventDefault\(\); navigateCalendar\(event\.key === 'ArrowLeft' \? -1 : 1\); return; \}\n        if \(event\.key\.toLowerCase\(\) === 't'\) \{ event\.preventDefault\(\); calendarToday\(\); return; \}\n      \}/);
});

test('Serbian', () => {
  for (const [en, value] of [['Drag here for tomorrow', 'Prevuci ovde za sutra'], ['Without area', 'Bez oblasti'], ['Fold the sidebar', 'Skupi bočni meni'], ['Unfold the sidebar', 'Raširi bočni meni'], ['Synced {time}', 'Sinhronizovano {time}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R47a shipped as 2.0.0-alpha.73 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 73);
});
