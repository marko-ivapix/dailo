// R109: Projekti are a screen of their own, as Ciljevi and Oblasti are, and no longer a switch inside Zadaci. #projects
// opens it from Još → Planiranje (with "‹ Još"), from the review and from the computer's sidebar; it lists "Bez
// projekta", the active projects by area and folds those on hold and for someday, with "+ Novi projekat" and a "+"
// button that makes a project. Zadaci keeps the suggestions and "Kad stignem" by project. A project's screen goes back
// to Projekti. No data-model change (ui.tasksView stays valid and is no longer read).
// Spec: docs/superpowers/specs/2026-10-16-r109-projects-screen.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');
const { foldButton } = require('./support/fold.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function projectsScreen(ui = {}) {
  const projects = [
    { id: 'site', name: 'Sajt', areaId: 'work', status: 'active', order: 1 },
    { id: 'trip', name: 'Put', areaId: null, status: 'active', order: 2 },
    { id: 'wait', name: 'Kuhinja', areaId: 'home', status: 'onHold', order: 3 },
    { id: 'later', name: 'Knjiga', areaId: null, status: 'someday', order: 4 },
    { id: 'clean', name: 'Čišćenje', isCleaningRoom: true, order: 5 },
  ];
  const tasks = [{ id: 'loose', title: 'Bez mesta', projectId: null, isInbox: false, isCompleted: false }, { id: 'inbox', title: 'Inbox', projectId: null, isInbox: true, isCompleted: false }];
  const ctx = withI18n({
    state: { projects, areas: [{ id: 'work', name: 'Posao' }, { id: 'home', name: 'Dom' }], tasks, ui }, Core, esc, foldButton,
    listTasks: () => tasks, sortedProjects: () => projects.filter(project => !project.isArchived), sortedAreas: () => ctx.state.areas,
    projectOverviewRow: project => `<row ${project.id}>`,
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}"></header>`,
  });
  vm.createContext(ctx);
  vm.runInContext(fn('renderProjectsScreen'), ctx);
  return ctx.renderProjectsScreen();
}

test('#projects is its own screen under Još: "Bez projekta", the active ones by area, the rest folded, a new project', () => {
  const html = projectsScreen();
  assert.match(html, /^<header title="Projects" subtitle="4 projects" add="false"><\/header>/, 'groups of Redovne obaveze are not counted');
  assert.match(html, /<button class="project-row" type="button" data-route="project\/none">[\s\S]*?No project<\/span><span class="task-meta">1 open<\/span>/);
  assert.match(html, /Posao<\/h2><span class="section-count">1<\/span><\/div><div class="today-card project-list"><row site><\/div>/);
  assert.match(html, /No area<\/h2><span class="section-count">1<\/span><\/div><div class="today-card project-list"><row trip><\/div>/);
  assert.doesNotMatch(html, /<row wait>|<row later>|<row clean>/, 'on hold and someday are folded; Redovne obaveze stay out');
  assert.match(html, /data-action="toggle-projects-resting"[\s\S]*data-fold="projectsOnHoldOpen"[\s\S]*data-action="toggle-projects-resting"[\s\S]*data-fold="projectsSomedayOpen"/);
  assert.match(projectsScreen({ projectsOnHoldOpen: true }), /<row wait>/);
  assert.match(html, /<button class="inline-add" type="button" data-action="new-project"><i class="ph ph-plus"><\/i> New project<\/button>$/);
  assert.match(fn('currentRoute'), /'goals', 'habits', 'templates', 'projects',/);
  assert.match(fn('renderMain'), /else if \(route\.type === 'projects'\) content = renderProjectsScreen\(\);/);
  assert.match(app, /const LIBRARY_ROUTES = \['settings', 'account', 'goals', 'projects', 'areas',/);
  assert.doesNotMatch(fn('render'), /tasksView = 'projects'/, '#projects no longer turns into Zadaci');
});

test('Zadaci has no projects switch: the suggestions and "Kad stignem" by project', () => {
  const screen = fn('renderTasksScreen');
  assert.doesNotMatch(screen, /tasks-view-switch|data-action="tasks-view"|view === 'projects'/);
  assert.match(screen, /let html = pageHeader\(tr\('Tasks'\), trn\(open, '\{count\} open task', '\{count\} open tasks'\), \{ add: false \}\);/);
  assert.doesNotMatch(app, /action === 'tasks-view'/);
  assert.match(fn('routeQuickAddContext'), /if \(route\.type === 'tasks'\) return \{ anytime: true \};/);
});

test('the bottom bar, the "+" button, the review, a project\'s screen and the sidebar treat Projekti like Ciljevi', () => {
  assert.match(app, /const BOTTOM_NAV_PARENT = \{ anytime: 'tasks', upcoming: 'calendar', habit: 'habits' \};/, 'Projekti and a project light up Još');
  assert.match(app, /'#projects': \[msg\('New project'\), \(\) => openProjectModal\(\)\]/);
  assert.match(app, /const TASK_SCREENS = new Set\(\['today', 'inbox', 'tasks', 'calendar', 'upcoming', 'anytime', 'project', 'area', 'tag'\]\);/);
  assert.match(read('js/review-ui.js'), /if \(action === 'review-projects'\) \{ ctx\.navigate\('projects'\); return true; \}/);
  const projectsUi = read('js/projects-ui.js');
  assert.equal((projectsUi.match(/ctx\.backLink\('projects', tr\('Projects'\)\)/g) || []).length, 2, 'a project and "Bez projekta" go back to Projekti');
  assert.doesNotMatch(projectsUi, /ctx\.backLink\('tasks'/);
  assert.match(read('js/sidebar-ui.js'), /sidebarGroup\('planning', tr\('Planning'\), \[sidebarItem\('goals', 'ph-target', tr\('Goals'\)\), sidebarItem\('projects', 'ph-folder', tr\('Projects'\)\), sidebarItem\('cleaning',/);
});

test('the guide and Šta je novo say where Projekti are', () => {
  const guide = read('uputstvo.html');
  assert.ok(guide.includes('U <strong>Još → Projekti</strong> svaki aktivan projekat pokazuje svoj sledeći korak'));
  assert.doesNotMatch(guide, /Zadaci → Projekti/);
  assert.ok(read('novo.html').includes('<li><strong>Projekti su poseban ekran.</strong>'));
});

test('R109 is released as 2.0.0-alpha.138', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.138');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.138';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.138');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['2.0.0-alpha.138', '2.0.0-alpha.138']);
});
