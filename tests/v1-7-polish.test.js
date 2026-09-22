const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('V1.7 documentation identifies the stabilization release and its manual browser boundary', () => {
  const agents = read('AGENTS.md');
  const readme = read('README.md');
  const overview = read('PROJECT_OVERVIEW.md');
  const claude = read('docs/claude/README.md');
  assert.match(agents, /Dailo To Do App V1\.7/);
  assert.match(readme, /V1\.7 .*highlights/);
  assert.match(readme, /manual-pending|Manual browser acceptance remains pending/);
  assert.match(overview, /V1\.7/);
  assert.match(claude, /V1\.7/);
});

test('V1.7 responsive polish has explicit compact surface hooks', () => {
  const css = read('css/styles.css');
  assert.match(css, /\.v17-mobile-filter/);
  assert.match(css, /\.v17-knowledge-list/);
  assert.match(css, /\.v17-day-detail/);
  assert.match(css, /\.v17-sticky-context/);
  assert.match(css, /\.v17-empty-state/);
  assert.match(css, /:focus-visible/);
});

test('V1.7 retains Search semantics and explicitly has no bulk actions', () => {
  const agents = read('AGENTS.md');
  const readme = read('README.md');
  const overview = read('PROJECT_OVERVIEW.md');
  const rules = read('docs/claude/WORKING_RULES.md');
  for (const doc of [agents, readme, overview, rules]) {
    assert.match(doc, /Search/);
    assert.match(doc, /bulk/i);
  }
  assert.doesNotMatch(read('index.html'), /bulk-(select|action)|select-all/i);
});

test('V1.7 route documentation covers compact mobile destinations', () => {
  const app = read('js/app.js');
  const overview = read('PROJECT_OVERVIEW.md');
  for (const route of ['today', 'inbox', 'calendar', 'goals', 'habits', 'notes', 'resources', 'areas']) {
    assert.match(app, new RegExp(`['"]${route}['"]`));
    assert.match(overview, new RegExp(route[0].toUpperCase() + route.slice(1), 'i'));
  }
});
