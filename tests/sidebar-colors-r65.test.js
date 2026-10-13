// R65: in the sidebar of a wide screen, each project's folder sits on the color chosen for that project. A light color
// gets a dark folder, so it stays readable. The "Projekti" heading stands out from the other group titles.
// Spec: docs/superpowers/specs/2026-10-13-r65-sidebar-project-colors.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function sidebar(projects) {
  let module = null;
  const context = withI18n({
    window: {}, location: { hash: '#today' }, localStorage: { getItem: () => null },
    document: { documentElement: { dataset: {} } }, Intl, Date, JSON, Math, parseInt, Object, Array, String, Set,
  });
  context.window.TodoI18n = context.TodoI18n;
  context.window.TodoDomainModules = { register: value => { module = value; } };
  vm.createContext(context);
  vm.runInContext(read('js/sidebar-ui.js'), context);
  const ctx = {
    state: { savedViews: [], notes: [] }, Core, esc, currentRoute: () => ({ type: 'today' }), bottomNavRoute: () => 'today',
    listTasks: () => [], activeInboxRecords: () => [], syncView: () => ({ configured: false }),
    sortedAreas: () => [], sortedProjects: () => projects, projectTasks: () => [],
  };
  return module.renderRoute({ type: 'sidebar' }, ctx);
}

test('each project\'s folder sits on its own color; a light color gets a dark folder', () => {
  const html = sidebar([
    { id: 'p1', name: 'Sređivanje doma', color: '#5362FF' },
    { id: 'p2', name: 'Selidba', color: '#F5B942' },
    { id: 'p3', name: 'Stari', color: 'url(x)' },
  ]);
  assert.match(html, /<button class="sidebar-item" type="button" data-route="project\/p1" title="Sređivanje doma"><span class="sidebar-project-icon" style="--project-color:#5362FF"><i class="ph ph-folder" aria-hidden="true"><\/i><\/span><span class="sidebar-label">Sređivanje doma<\/span><\/button>/);
  assert.match(html, /data-route="project\/p2" title="Selidba"><span class="sidebar-project-icon is-light" style="--project-color:#F5B942">/);
  assert.match(html, /data-route="project\/p3" title="Stari"><span class="sidebar-project-icon" style="--project-color:#5362FF">/, 'an unsafe color falls back to the default blue');
  assert.match(html, /data-route="today"[^>]*><i class="ph ph-sun" aria-hidden="true"><\/i>/, 'other items keep their plain icon');
});

test('white or dark: whichever reads better on the color, for every project color', () => {
  const colors = read('js/app.js').match(/const PROJECT_COLORS = \[([^\]]+)\]/)[1].match(/#[0-9A-F]{6}/gi);
  const html = sidebar(colors.map((color, index) => ({ id: `p${index}`, name: `P${index}`, color })));
  const light = colors.filter(color => html.includes(`sidebar-project-icon is-light" style="--project-color:${color}"`));
  assert.deepEqual(light, ['#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'], 'only the blue keeps a white folder');
  assert.match(sidebar([{ id: 'x', name: 'X', color: '#fff' }]), /sidebar-project-icon is-light/, 'short colors too');
});

test('"Projekti" stands out from the other group titles', () => {
  assert.match(sidebar([{ id: 'p1', name: 'A', color: '#5362FF' }]), /<section class="sidebar-group is-projects"><h2 class="sidebar-group-title"><span class="sidebar-label">Projects<\/span><\/h2>/);
  const css = read('css/styles.css');
  const block = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));
  for (const rule of [
    '.sidebar-project-icon { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: var(--radius-sm); background: var(--project-color); color: var(--on-accent); }',
    '.sidebar-project-icon .ph { font-size: var(--text-sm); }',
    '.sidebar-project-icon.is-light { color: var(--on-light-accent); }',
    '.sidebar-group.is-projects > .sidebar-group-title { color: var(--ink-1); font-size: var(--text-sm); font-weight: 700; }',
  ]) assert.ok(block.includes(rule), rule);
  assert.match(css, /:root \{[^}]*--on-light-accent: #14171B;/);
});

test('R65 is released as 2.0.0-alpha.92', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.92');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.92';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.92');
});
