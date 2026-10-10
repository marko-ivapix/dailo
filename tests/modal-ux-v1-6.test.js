const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tasksUi = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

// Redesign R3 (E1): Planiranje and Organizacija rows replace the chips and the three disclosures; only
// "Više opcija" stays folded.
test('task editor keeps optional sections collapsed and exposes compact essentials', () => {
  assert.match(tasksUi, /<h3 class="task-window-group">\$\{tr\('Planning'\)\}<\/h3>/);
  assert.match(tasksUi, /<h3 class="task-window-group">\$\{tr\('Organization'\)\}<\/h3>/);
  assert.match(tasksUi, /<details class="task-window-more">/);
  assert.doesNotMatch(tasksUi, /<details[^>]+task-window-more[^>]+open/);
  assert.doesNotMatch(tasksUi, /task-quick-properties|task-properties-disclosure|task-schedule-disclosure|task-links-notes-disclosure/);
  assert.match(tasksUi, /id="detail-notes" class="detail-notes"/);
  assert.match(tasksUi, /row\('task-tags-picker', 'ph-tag', tr\('Tags'\)/);
  assert.match(tasksUi, /aria-labelledby="task-modal-title"/);
  assert.match(tasksUi, /'task-detail-modal'/);
});

test('mobile quick add offers all supported item types and modal sheets have mobile layout hooks', () => {
  // index.html is translated directly (Serbian-only UI): Task, Goal, Habit, Note, Resource, Project.
  for (const type of ['Zadatak', 'Cilj', 'Navika', 'Beleška', 'Resurs', 'Projekat']) assert.match(html, new RegExp(`>${type}<`));
  assert.match(app, /const frameClass = cls \? ` modal-backdrop-\$\{cls\}`/);
  // Redesign R4: Quick Add's "Više opcija" saves the task and opens its window instead of an inline panel.
  assert.match(app, /else if \(action === 'quick-more-options'\) createTask\(false, true\);/);
  assert.match(app, /aria-label="\$\{tr\('Dailo dialog'\)\}"/);
  assert.match(css, /\.modal-backdrop-task-detail-modal/);
  assert.match(css, /\.task-detail-modal \.modal-header \.complete-control[^}]*width: 44px/);
  assert.match(css, /\.modal-backdrop-quick/);
  assert.match(css, /\.mobile-quick-add-option i, \.mobile-quick-add-toggle \{ width: 44px; height: 44px; \}/);
});

test('Quick Add stays visible on desktop and keeps the same floating menu composition', () => {
  assert.match(css, /\.mobile-quick-add \{[\s\S]*?position: fixed;[\s\S]*?display: grid;/);
  assert.doesNotMatch(css, /\.mobile-quick-add \{ display: none; \}/);
  assert.match(css, /\.mobile-quick-add-menu \{ display: grid; justify-items: end;/);
  assert.match(css, /\.mobile-quick-add-option \{[\s\S]*?flex-direction: row-reverse;/);
});

test('mobile navigation provides the primary destinations at the bottom', () => {
  // Redesign R1 (G1): the bar is shown at every width and Zadaci replaces Ciljevi.
  assert.match(html, /id="mobile-bottom-nav" class="mobile-bottom-nav"/);
  for (const route of ['today', 'inbox', 'tasks', 'calendar', 'habits', 'more']) assert.match(html, new RegExp(`data-route="${route}"`));
  assert.match(css, /\n\.mobile-bottom-nav \{[\s\S]*?position: fixed;[\s\S]*?display: grid;/);
  assert.match(app, /function renderMobileBottomNav\(\)/);
  assert.match(css, /\.main \{ padding-bottom: calc\(88px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(css, /\.mobile-quick-add \{ bottom: calc\(74px \+ env\(safe-area-inset-bottom\)\); \}/);
});
