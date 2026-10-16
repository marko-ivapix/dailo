// R94: Projekti. A project has a status: active (no field), on hold (project.status = 'onHold', "Na čekanju") or
// someday ('someday', "Nekad"). Tasks without a date of a project on hold or for someday stay out of Kad stignem; dated
// tasks still show where their date puts them. Zadaci → Projekti lists the active projects by area and folds the
// others into "Na čekanju" and "Nekad"; the sidebar lists the active ones. The next step of a project is its first
// open task in the project's order: the project row says what it is (or "Nema sledećeg koraka") and the project screen
// marks it. The weekly review gets a "Projekti" step with the active projects that have no next step.
// Data-model spec: docs/superpowers/specs/2026-10-15-r94-project-status.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = (name, files) => functionSource(name, files).source;
const stamp = '2026-10-01T08:00:00.000Z';
const project = (id, fields = {}) => ({ id, name: id, color: '#5362FF', areaId: null, goalIds: [], isArchived: false, archivedAt: null, order: 0, createdAt: stamp, updatedAt: stamp, ...fields });
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: null, projectId: null, areaId: null, tagIds: [], subtasks: [], createdAt: stamp, updatedAt: stamp, ...fields });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('a project is active, on hold or for someday; only the last two are stored', () => {
  assert.deepEqual([{}, { status: 'onHold' }, { status: 'someday' }, { status: 'paused' }, null].map(Core.projectStatus), ['active', 'onHold', 'someday', 'active', 'active']);
  const state = Core.normalizeState(emptyState({ projects: [project('a', { status: 'onHold' }), project('b', { status: 'someday' }), project('c', { status: 'active' }), project('d', { status: 'paused' }), project('e')] }));
  assert.deepEqual(state.projects.map(item => item.status), ['onHold', 'someday', undefined, undefined, undefined]);
  for (const item of state.projects.slice(2)) assert.equal(Object.hasOwn(item, 'status'), false, `${item.id}: active keeps no field`);
});

test('Kad stignem leaves out the undated tasks of projects on hold or for someday', () => {
  const projects = [project('live'), project('wait', { status: 'onHold' }), project('later', { status: 'someday' })];
  const tasks = [task('a', { projectId: 'live' }), task('b', { projectId: 'wait' }), task('c', { projectId: 'later' }), task('d'), task('e', { projectId: 'wait', plannedDate: '2026-10-20' })];
  assert.deepEqual(Core.deriveAnytime(tasks, projects).map(item => item.id), ['a', 'd']);
  assert.deepEqual(Core.deriveAnytime(tasks).map(item => item.id), ['a', 'b', 'c', 'd'], 'without projects it reads as before');
  const screen = fn('renderTasksScreen');
  assert.match(screen, /const later = Core\.deriveAnytime\(tasks, state\.projects\)\.sort\(byProjectOrder\);/);
  assert.match(screen, /const resting = Core\.deriveAnytime\(tasks\)\.length - later\.length;/);
  assert.match(screen, /trn\(resting, '\{count\} task waits in a project on hold or for someday\.', '\{count\} tasks wait in projects on hold or for someday\.'\)/);
  assert.match(fn('renderAnytime'), /const tasks = Core\.deriveAnytime\(state\.tasks, state\.projects\);/);
});

test('the weekly review finds the active projects without a next step', () => {
  const state = {
    projects: [project('empty'), project('busy'), project('done'), project('wait', { status: 'onHold' }), project('later', { status: 'someday' }), project('old', { isArchived: true }), project('room', { isCleaningRoom: true })],
    tasks: [task('t1', { projectId: 'busy' }), task('t2', { projectId: 'done', isCompleted: true })],
    areas: [], goals: [], habits: [], settings: {},
  };
  const review = Core.deriveWeeklyReview(state, '2026-10-15', 1);
  assert.deepEqual(review.projects.missingNext.map(item => item.id), ['empty', 'done']);
  assert.deepEqual([review.projects.onHold.map(item => item.id), review.projects.someday.map(item => item.id)], [['wait'], ['later']]);
  const ui = read('js/review-ui.js');
  assert.match(ui, /html \+= step\(4, tr\('Projects'\), missing\.length, /);
  assert.match(ui, /row\(ctx, `project\/\$\{item\.id\}`, item\.name \|\| tr\('Untitled'\), tr\('No next step'\)\)/);
  assert.match(ui, /data-action="review-projects"/);
  assert.match(ui, /review\.projects\.onHold\.length \? tr\('On hold: \{count\}', \{ count: review\.projects\.onHold\.length \}\) : ''/, 'only the statuses that have projects');
  // R109: "Pregledaj ih" opens Projekti, a screen of their own.
  assert.match(ui, /if \(action === 'review-projects'\) \{ ctx\.navigate\('projects'\); return true; \}/);
  // R96: goals, habits and areas became one step (5), and the priorities are step 6.
  assert.match(ui, /step\(5, tr\('Goals, habits and areas'\)/);
});

test('backups accept only the two stored statuses; sync carries the field', () => {
  Backup.validateDomain(emptyState({ projects: [project('p', { status: 'someday' })] }), [], []);
  for (const status of ['active', 'paused', 1]) assert.throws(() => Backup.validateDomain(emptyState({ projects: [project('p', { status })] }), [], []), /Invalid backup: project status/);
  assert.equal(Sync.collectRecords(emptyState({ projects: [project('p', { status: 'onHold' })] }), []).get('projects/p').data.status, 'onHold');
});

test('the project screen sets the status and marks the next step', () => {
  const screen = fn('renderProject', ['js/projects-ui.js']);
  assert.match(screen, /const status = ctx\.Core\.projectStatus\(project\);/);
  assert.match(screen, /<div class="view-tabs project-status" role="group" aria-label="\$\{tr\('Project status'\)\}">/);
  assert.match(screen, /data-action="project-status" data-project-id="\$\{esc\(projectId\)\}" data-status="\$\{value\}" aria-pressed="\$\{status === value\}"/);
  assert.match(screen, /\[\['active', tr\('Ongoing'\)\], \['onHold', tr\('On hold'\)\], \['someday', tr\('Someday'\)\]\]/, '"Active" is taken by the neuter "Aktivno"');
  assert.match(screen, /openTasks\.map\(\(task, index\) => renderProjectTaskRow\(task, projectId, \{ draggable: !archived, today: true, hidePlace: true, nextStep: index === 0 && status === 'active' && !archived \}\)\)/);
  assert.match(read('js/tasks-ui.js'), /const next = options\.nextStep \? `<span class="task-next-step">\$\{tr\('Next step'\)\}<\/span>` : '';/);
  assert.match(read('js/projects-ui.js'), /else if \(action === 'project-status'\) ctx\.setProjectStatus\(projectId, element\.dataset\.status\);/);
  const set = fn('setProjectStatus');
  assert.match(set, /if \(!project \|\| project\.isArchived \|\| project\.isCleaningRoom \|\| !\['active', 'onHold', 'someday'\]\.includes\(status\) \|\| Core\.projectStatus\(project\) === status\) return;/);
  assert.match(set, /if \(status === 'active'\) delete project\.status; else project\.status = status;/);
  assert.match(read('js/app.js'), /openProjectModal, saveProjectModal, archiveProject, restoreProject, deleteProject, setProjectStatus,/);
});

test('Projekti fold the projects on hold and for someday; rows say the next step; the sidebar keeps the active ones', () => {
  // R109: the projects left Zadaci for a screen of their own.
  const screen = fn('renderProjectsScreen');
  assert.match(screen, /const active = projects\.filter\(project => Core\.projectStatus\(project\) === 'active'\);/);
  assert.match(screen, /for \(const \[status, label, key\] of \[\['onHold', tr\('On hold'\), 'projectsOnHoldOpen'\], \['someday', tr\('Someday'\), 'projectsSomedayOpen'\]\]\)/);
  assert.match(screen, /foldButton\('toggle-projects-resting', label, list\.length, open, ` data-fold="\$\{key\}"`\)/);
  assert.match(read('js/app.js'), /else if \(action === 'toggle-projects-resting'\) \{ const key = el\.dataset\.fold === 'projectsSomedayOpen' \? 'projectsSomedayOpen' : 'projectsOnHoldOpen'; state\.ui\[key\] = state\.ui\[key\] !== true; saveAndRender\(\); \}/);
  const row = fn('projectOverviewRow');
  assert.match(row, /const step = projectTasks\(project\.id\)\[0\];/);
  assert.match(row, /status !== 'active' \? `<span class="project-row-next">\$\{esc\(status === 'onHold' \? tr\('On hold'\) : tr\('Someday'\)\)\}<\/span>`/);
  assert.match(row, /step \? `<span class="project-row-next">\$\{esc\(tr\('Next: \{task\}', \{ task: step\.title \}\)\)\}<\/span>` : `<span class="project-row-next is-missing">\$\{tr\('No next step'\)\}<\/span>`/);
  assert.match(read('js/sidebar-ui.js'), /const projects = ctx\.sortedProjects\(\)\.filter\(project => !project\.isCleaningRoom && ctx\.Core\.projectStatus\(project\) === 'active'\);/);
  const css = read('css/styles.css');
  for (const rule of ['.project-status {', '.project-status .btn {', '.project-row-next {', '.project-row-next.is-missing {', '.task-next-step {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide explains the status and the next step', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Project status', 'Status projekta'], ['Ongoing', 'Aktivan'], ['On hold', 'Na čekanju'], ['Someday', 'Nekad'], ['Next step', 'Sledeći korak'],
    ['Next: {task}', 'Sledeće: {task}'], ['No next step', 'Nema sledećeg koraka'],
    ['Its tasks without a date stay out of Anytime until it is active again.', 'Njegovi zadaci bez datuma nisu u „Kad stignem“ dok ponovo ne bude aktivan.'],
    ['Every active project has a next step.', 'Svaki aktivan projekat ima sledeći korak.'], ['Look through them', 'Pregledaj ih'],
    ['On hold: {count}', 'Na čekanju: {count}'], ['Someday: {count}', 'Nekad: {count}'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(sr.includes('"{count} tasks wait in projects on hold or for someday.": { one: "{count} zadatak čeka u projektu na čekanju ili za nekad.", few: "{count} zadatka čekaju u projektima na čekanju ili za nekad.", other: "{count} zadataka čeka u projektima na čekanju ili za nekad." }'));
  assert.ok(read('uputstvo.html').includes('Projekat može biti <strong>Aktivan</strong>, <strong>Na čekanju</strong> ili za <strong>Nekad</strong> (biraš na vrhu projekta). Zadaci bez datuma iz projekata koji nisu aktivni ne stoje u „Kad stignem“. <strong>Sledeći korak</strong> projekta je njegov prvi otvoren zadatak: pomeri zadatak na vrh i on postaje sledeći.'));
});

test('R94 shipped as 2.0.0-alpha.121 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 121) >= 121);
});
