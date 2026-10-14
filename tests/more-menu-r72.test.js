// R72: Još → Planiranje is Ciljevi, Projekti, Redovne obaveze and Oblasti, in that order. Šabloni leave the menu, and
// Nedeljni pregled takes their place in Biblioteka. The wide-screen sidebar follows. Its Planning group has no
// Projekti, because the projects have their own group there.
// Spec: docs/superpowers/specs/2026-10-14-r72-more-menu.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const routesIn = html => [...html.matchAll(/data-route="([\w-]+)"/g)].map(match => match[1]);

function moreScreen(state) {
  const context = withI18n({
    state, Core: { weeklyReviewLog: () => [], weeklyReviewDue: () => false, dateOnly: () => '2026-10-14' },
    sortedAreas: () => [], isOpenRepeating: task => Boolean(task.recurrence) && !task.isCompleted, formatDate: value => value,
    syncView: () => ({ configured: false }), pageHeader: title => `<h1>${title}</h1>`,
    esc: value => String(value),
  });
  vm.createContext(context);
  vm.runInContext(`${functionSource('moreRow').source}\n${functionSource('renderMoreScreen').source}\nthis.renderMoreScreen = renderMoreScreen;`, context);
  return context.renderMoreScreen();
}

const base = {
  goals: [{ status: 'active' }], areas: [{ status: 'active' }], notes: [], journal: [], resources: [], tags: [], templates: [{}], savedViews: [],
  tasks: [{ recurrence: { frequency: 'weekly' }, isCompleted: false }],
  projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'old', isArchived: true }, { id: 'kitchen', isCleaningRoom: true }],
  settings: {},
};

test('Još: Planiranje is Ciljevi, Projekti, Redovne obaveze, Oblasti; Biblioteka has Nedeljni pregled where Šabloni were', () => {
  const html = moreScreen(base);
  const groups = [...html.matchAll(/<h2 class="more-group-title">([^<]+)<\/h2><div class="more-card more-tiles">(.*?)<\/div><\/section>/g)].map(match => [match[1], routesIn(match[2])]);
  assert.deepEqual(JSON.parse(JSON.stringify(groups)), [
    ['Planning', ['goals', 'projects', 'cleaning', 'areas']],
    ['Library', ['notes', 'journal', 'resources', 'tags', 'review', 'saved-views']],
    ['Archives', ['completed', 'archived']],
  ]);
  assert.doesNotMatch(html, /data-route="templates"/, 'Šabloni are no longer in the menu');
  assert.match(html, /data-route="projects"><i class="ph ph-folder more-row-icon" aria-hidden="true"><\/i><span class="more-row-value">2<\/span><span class="more-row-label">Projects<\/span>/, 'the open projects, without archived ones and Redovne obaveze groups');
});

test('the Projekti tile opens Zadaci → Projekti; templates still work from the windows', () => {
  assert.match(read('js/app.js'), /if \(location\.hash === '#projects' && state\?\.ui\) \{ state\.ui\.tasksView = 'projects'; history\.replaceState\(null, '', '#tasks'\); \}/);
  assert.match(read('js/app.js'), /data-pop-action="save-template"/, '"Sačuvaj kao šablon" stays in the menus');
  assert.match(read('js/app.js'), /data-action="from-template"/, '"Iz šablona" stays in the windows');
});

test('the wide-screen sidebar follows: Planning without Projekti, Library with Nedeljni pregled, no Šabloni', () => {
  let module = null;
  const context = withI18n({ window: {}, location: { hash: '#today' }, localStorage: { getItem: () => null }, document: { documentElement: { dataset: {} } }, Intl, Date, JSON, Math, parseInt, Object, Array, String, Set });
  context.window.TodoI18n = context.TodoI18n;
  context.window.TodoDomainModules = { register: value => { module = value; } };
  vm.createContext(context);
  vm.runInContext(read('js/sidebar-ui.js'), context);
  const html = module.renderRoute({ type: 'sidebar' }, {
    state: { savedViews: [], notes: [] }, Core, esc: String, currentRoute: () => ({ type: 'today' }), bottomNavRoute: () => 'today',
    listTasks: () => [], activeInboxRecords: () => [], syncView: () => ({ configured: false }), sortedAreas: () => [], sortedProjects: () => [], projectTasks: () => [],
  });
  const group = key => routesIn(html.match(new RegExp(`data-group="${key}"[^>]*>.*?</section>`))[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(group('planning'))), ['goals', 'cleaning', 'areas']);
  assert.deepEqual(JSON.parse(JSON.stringify(group('library'))), ['notes', 'journal', 'resources', 'tags', 'review', 'saved-views']);
  assert.doesNotMatch(html, /data-route="templates"/);
});

test('R72 is released as 2.0.0-alpha.99', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.99');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.99';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.99');
});
