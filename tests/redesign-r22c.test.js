// Redesign R22c: the second design audit, fix 12 and the low items — accessibility, wording and leftovers.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r22c-accessibility.md
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
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const layerStart = css.indexOf('/* Redesign R22c');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const has = text => assert.ok(layer.includes(text), text);

test('the R22c layer comes after R22b', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R22b'));
});

test('a sheet redrawn in place keeps its accessible name', () => {
  assert.match(fn('labelSheet'), /title\.id = title\.id \|\| `popover-title-\$\{\+\+sheetTitleCount\}`;\n\s+el\.setAttribute\('aria-labelledby', title\.id\);/);
  assert.match(fn('refreshSheet'), /decorateSheet\(popoverEl\);\n\s+labelSheet\(popoverEl\);/);
  assert.match(fn('openPopover'), /labelSheet\(el\);/);
});

test('chips are no longer nested inside the row\'s button', () => {
  const tasksUi = read('js/tasks-ui.js');
  // R91: a Calendar row there for its deadline puts the hourglass before the title.
  // R94: a project's next step leads the meta line; R95: a chore's bar follows it.
  assert.match(tasksUi, /<div class="task-main-wrap"><div class="task-main" data-action="open-task" data-task-id="\$\{esc\(task\.id\)\}" role="button" tabindex="0"><div class="task-title">\$\{options\.dueItem \? '<i class="ph ph-hourglass-medium task-due-icon" aria-hidden="true"><\/i>' : ''\}\$\{esc\(task\.title\)\}<\/div>\$\{next \|\| meta \? `<div class="task-meta">\$\{next\}\$\{meta\}<\/div>` : ''\}\$\{bar\}<\/div>\$\{addToday\}<\/div>/);
  has('.task-row--today > .task-main-wrap { flex: 1 1 auto; min-width: 0; }');
});

test('every color swatch is named, tag dots have a name, the note window has a heading', () => {
  const ctx = withI18n({ PROJECT_COLORS: ['#5362FF', '#30CBAD'] });
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/const COLOR_NAMES = [^\n]+/)[0]}\n${fn('colorName')}`, ctx);
  assert.equal(ctx.colorName('#5362ff'), 'Blue');
  assert.equal(ctx.colorName('#123456'), '#123456');
  assert.match(fn('domainContext'), /\n      colorName,\n/);
  const sources = { 'js/app.js': app, 'js/areas-ui.js': read('js/areas-ui.js'), 'js/projects-ui.js': read('js/projects-ui.js') };
  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /aria-label="\$\{tr\('Select color'\)\}"|aria-label="\$\{tr\('Select (area|project) color'\)\}"/, file);
  }
  assert.equal((app.match(/aria-label="\$\{esc\(tr\('Color: \{name\}', \{ name: colorName\(c\) \}\)\)\}"/g) || []).length, 3, 'tag window and the two inline forms');
  assert.match(sources['js/areas-ui.js'], /aria-label="\$\{esc\(tr\('Color: \{name\}', \{ name: ctx\.colorName\(color\) \}\)\)\}"/);
  assert.match(sources['js/projects-ui.js'], /aria-label="\$\{esc\(tr\('Color: \{name\}', \{ name: ctx\.colorName\(color\) \}\)\)\}"/);
  assert.match(read('js/knowledge.js'), /<span class="knowledge-tag-dot" style="--tag-color:\$\{esc\(tag\.color\)\}" role="img" aria-label="\$\{esc\(tr\('Tag: \{name\}', \{ name: tag\.name \}\)\)\}"><\/span>/);
  assert.match(read('js/knowledge.js'), /<h2 class="task-window-kind">/);
  for (const [en, value] of [['Color: {name}', 'Boja: {name}'], ['Tag: {name}', 'Oznaka: {name}'], ['Blue', 'Plava']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('a missed day is clearly red in the week table and its legend', () => {
  has('.habit-cell.is-missed::before { border-color: var(--danger); }');
  has('.habit-cell-swatch.is-missed { border-color: var(--danger); }');
});

test('focus stays on the control after a window redraws', () => {
  const render = fn('renderModal');
  assert.match(render, /const focused = root\.dataset\.modalType === modalState\.type \? focusDescriptor\(document\.activeElement, '#modal-root'\) : null;/);
  assert.match(render, /root\.dataset\.modalType = modalState\.type;/);
  assert.match(render, /if \(focused && !root\.contains\(document\.activeElement\)\) \$\(focused\)\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(fn('focusDescriptor'), /function focusDescriptor\(element, regions = '#main, #mobile-bottom-nav, #desktop-sidebar'\)/); // R47a
});

test('wording: one name for finishing a goal, "Više opcija", the ellipsis, "Završeni zadaci" on the tile', () => {
  assert.doesNotMatch(read('js/goals-ui.js'), /tr\('Mark completed'\)/);
  assert.ok(sr.includes('"More settings": "Više opcija"'));
  for (const line of sr.split('\n').filter(text => /": "/.test(text))) assert.doesNotMatch(line.split('": "')[1], /\.\.\./, line);
  assert.match(app, /moreRow\('completed', 'ph-check-circle', tr\('Completed tasks'\),/);
});

test('leftovers: #projects opens Projekti, long titles wrap, the habit chart text is readable', () => {
  assert.doesNotMatch(read('js/projects-ui.js'), /function renderProjects\(|route\.type === 'projects'/);
  // R109: #projects is a screen of its own again (app.js renderProjectsScreen), no longer Zadaci → Projekti.
  assert.doesNotMatch(fn('render'), /tasksView = 'projects'/);
  assert.match(fn('renderMain'), /else if \(route\.type === 'projects'\) content = renderProjectsScreen\(\);/);
  has('.page-title { overflow-wrap: anywhere; }');
  has('.habits-chart-axis { font-size: var(--text-xs); }');
});

test('R22c shipped as 2.0.0-alpha.47 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 47);
});
