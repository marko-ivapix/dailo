// Redesign R10e: Završeni zadaci and Arhivirani projekti (S9, S10, M6's move of "Obriši završene zadatke").
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10e-completed-archived.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = Core.dateOnly();
const YESTERDAY = Core.addDays(TODAY, -1);
const at = (date, time = '10:00') => new Date(`${date}T${time}:00`).toISOString();

function completedContext(extra = {}) {
  const calls = [];
  const state = {
    tasks: [
      { id: 'c1', title: 'Report', projectId: 'p1', isCompleted: true, completedAt: at(TODAY, '09:00') },
      { id: 'c2', title: 'Call', projectId: null, isCompleted: true, completedAt: at(TODAY, '11:00') },
      { id: 'c3', title: 'Old', projectId: 'p2', isCompleted: true, completedAt: at(Core.addDays(TODAY, -40)) },
      { id: 'c4', title: 'Yesterday', projectId: 'p1', isCompleted: true, completedAt: at(YESTERDAY) },
      { id: 'o1', title: 'Open', isCompleted: false },
    ],
    projects: [{ id: 'p1', name: 'Site', color: '#4f8cff' }, { id: 'p2', name: 'Past', color: '#2fbf71', isArchived: true }],
    ui: { completedProjectFilter: '', completedPeriod: 0 },
    ...extra.state,
  };
  const ctx = {
    calls, state, Core, esc,
    allProjects: () => state.projects,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`,
    taskRow: (task, context, options) => `<row ${task.id} ${context}${options?.today ? ' today' : ''}>`,
    relativeDateLabel: date => (date === TODAY ? 'Today' : date === YESTERDAY ? 'Yesterday' : `L:${date}`),
    formatDate: date => `D:${date}`,
    nowIso: () => new Date().toISOString(),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(['renderCompleted', 'openCompletedProjectSheet'].map(fn).join('\n'), ctx);
  return ctx;
}

test('S9: "Završeni zadaci" has chips, groups by completion day with Today rows, and the clear row at the bottom', () => {
  const ctx = completedContext();
  const html = ctx.renderCompleted();
  assert.match(html, /^<header title="Completed tasks" subtitle="4 tasks"><\/header><div class="sheet-chips completed-chips"><button class="quick-chip" type="button" data-action="completed-project">All projects <i class="ph ph-caret-down" aria-hidden="true"><\/i><\/button><button class="quick-chip is-selected" type="button" data-action="completed-period" data-value="0" aria-pressed="true">All time<\/button><button class="quick-chip" type="button" data-action="completed-period" data-value="7" aria-pressed="false">7 days<\/button><button class="quick-chip" type="button" data-action="completed-period" data-value="30" aria-pressed="false">30 days<\/button><\/div>/);
  const groups = [...html.matchAll(/<section class="section completed-group"><div class="section-header"><h2 class="section-label">([^<]+)<\/h2><\/div><div class="task-list today-card">((?:<row [^>]+>)+)<\/div><\/section>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(groups.map(group => group[0]), [`Today · D:${TODAY} · 2`, `Yesterday · D:${YESTERDAY} · 1`, `L:${Core.addDays(TODAY, -40)} · 1`]);
  assert.equal(groups[0][1], '<row c2 completed today><row c1 completed today>');
  assert.match(html, /<div class="today-card completed-clear"><button class="completed-clear-row" type="button" data-action="clear-completed"><i class="ph ph-trash" aria-hidden="true"><\/i><span class="completed-clear-main"><span class="task-title">Clear completed tasks<\/span><span class="task-meta">Permanently delete all completed tasks and their attachments\.<\/span><\/span><\/button><\/div>$/);
  assert.doesNotMatch(html, /<select|filter-bar/);
  // Filtered by a project and a period
  ctx.state.ui.completedProjectFilter = 'p1';
  ctx.state.ui.completedPeriod = 7;
  const filtered = ctx.renderCompleted();
  assert.match(filtered, /subtitle="2 tasks"[\s\S]*data-action="completed-project">Site <i/);
  assert.match(filtered, /<button class="quick-chip is-selected" type="button" data-action="completed-period" data-value="7" aria-pressed="true">7 days<\/button>/);
  ctx.state.ui.completedProjectFilter = 'p2';
  assert.match(ctx.renderCompleted(), /<empty No completed tasks match these filters\. \| Try a different project or time period\.><div class="today-card completed-clear">/);
  assert.doesNotMatch(completedContext({ state: { tasks: [{ id: 'o1', isCompleted: false }] } }).renderCompleted(), /clear-completed/, 'no clear row without completed tasks');
  // The project sheet lists archived projects with a note
  ctx.openCompletedProjectSheet({});
  assert.deepEqual([...ctx.calls.at(-1)[1].matchAll(/data-pop-action="completed-set-project" data-value="(\w*)"><span class="sheet-option-label">([^<]+)</g)].map(match => match.slice(1)), [['', 'All projects'], ['p1', 'Site'], ['p2', 'Past (archived)']]);
});

test('S9: the actions set the filters; reopening a task offers Undo', () => {
  assert.match(app, /else if \(action === 'completed-project'\) openCompletedProjectSheet\(el\);/);
  assert.match(app, /else if \(action === 'completed-period'\) \{ state\.ui\.completedPeriod = \[0, 7, 30\]\.includes\(Number\(el\.dataset\.value\)\) \? Number\(el\.dataset\.value\) : 0; saveAndRender\(\); \}/);
  assert.match(app, /else if \(action === 'completed-set-project'\) \{ state\.ui\.completedProjectFilter = getProject\(button\.dataset\.value\) \? button\.dataset\.value : ''; closePopover\(\); saveAndRender\(\); \}/);
  const toggle = fn('toggleComplete');
  assert.match(toggle, /if \(task\.isCompleted\) \{\n\s+task\.isCompleted = false; task\.completedAt = null;\n\s+task\.updatedAt = nowIso\(\); saveState\(\); render\(\); if \(modalState\?\.type === 'task'\) renderModal\(\);\n\s+setUndo\(msg\('Task restored'\), \(\) => \{/);
  assert.match(toggle, /Object\.assign\(current, \{ isCompleted: true, completedAt: previous\.completedAt, updatedAt: nowIso\(\) \}\);/);
  assert.doesNotMatch(app, /completed-project-filter|completed-period-filter/);
  assert.doesNotMatch(read('js/settings-ui.js'), /clear-completed/, 'M6: the clear row left Settings');
});

test('S10: archived projects are one card with "Vrati"; restoring offers Undo', () => {
  let adapter;
  runInNewContextWithI18n(read('js/projects-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  const projects = [{ id: 'p1', name: 'Old site', color: '#4f8cff', areaId: 'a1', isArchived: true }, { id: 'p2', name: 'Loose', color: '#2fbf71', isArchived: true }, { id: 'p3', name: 'Live', color: '#e5484d' }];
  const ctx = {
    esc, state: { areas: [{ id: 'a1', name: 'Work' }] },
    allProjects: () => projects,
    projectTasks: id => (id === 'p1' ? [{ id: 'x' }, { id: 'y' }] : []),
    getArea: id => ({ a1: { id: 'a1', name: 'Work' } })[id] || null,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`,
  };
  const html = adapter.renderRoute({ type: 'archived' }, ctx);
  assert.equal(html, '<header title="Archived Projects" subtitle="2 archived projects"></header><div class="today-card archived-list"><div class="today-row archived-project-item"><span class="project-dot" style="--project-color:#4f8cff" aria-hidden="true"></span><button class="today-row-main" type="button" data-route="project/p1"><span class="task-title">Old site</span><span class="task-meta">Work · 2 open</span></button><button class="quick-chip" type="button" data-action="restore-project" data-project-id="p1">Restore</button></div><div class="today-row archived-project-item"><span class="project-dot" style="--project-color:#2fbf71" aria-hidden="true"></span><button class="today-row-main" type="button" data-route="project/p2"><span class="task-title">Loose</span><span class="task-meta">0 open</span></button><button class="quick-chip" type="button" data-action="restore-project" data-project-id="p2">Restore</button></div></div>');
  projects.forEach(project => { project.isArchived = false; });
  assert.equal(adapter.renderRoute({ type: 'archived' }, ctx), '<header title="Archived Projects" subtitle="0 archived projects"></header><empty No archived projects. | Archived projects stay here until you restore them.>');
  const restore = fn('restoreProject');
  assert.match(restore, /const previous = \{ isArchived: project\.isArchived, archivedAt: project\.archivedAt \};/);
  assert.match(restore, /setUndo\(msg\('Project restored'\), \(\) => \{ const current = getProject\(projectId\); if \(!current\) return; Object\.assign\(current, previous, \{ updatedAt: nowIso\(\) \}\); saveState\(\); render\(\); \}\);/);
});

test('the R10e layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10e'));
  assert.ok(layer.length > 20, 'R10e layer');
  for (const selector of ['.completed-chips', '.completed-group', '.completed-clear-row', '.archived-project-item']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Completed tasks', 'Završeni zadaci'], ['7 days', '7 dana'], ['30 days', '30 dana'], ['Task restored', 'Zadatak je vraćen'], ['{name} (archived)', '{name} (arhiviran)'], ['Archived projects stay here until you restore them.', 'Arhivirani projekti ostaju ovde dok ih ne vratiš.'], ['Permanently delete all completed tasks and their attachments.', 'Trajno briše sve završene zadatke i njihove priloge.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R10e shipped as 2.0.0-alpha.23 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 23);
});
