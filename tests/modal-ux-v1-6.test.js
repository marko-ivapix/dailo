const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tasksUi = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('task editor keeps optional sections collapsed and exposes compact essentials', () => {
  assert.match(tasksUi, /class="task-quick-properties"/);
  assert.match(tasksUi, /<details class="detail-section detail-disclosure task-properties-disclosure">/);
  assert.match(tasksUi, /<details class="detail-section detail-disclosure task-schedule-disclosure">/);
  assert.match(tasksUi, /<details class="detail-section detail-disclosure task-links-notes-disclosure">/);
  assert.doesNotMatch(tasksUi, /<details[^>]+task-properties-disclosure[^>]+open/);
  assert.doesNotMatch(tasksUi, /<details[^>]+task-schedule-disclosure[^>]+open/);
  assert.doesNotMatch(tasksUi, /<details[^>]+task-links-notes-disclosure[^>]+open/);
  assert.match(tasksUi, /class="detail-section task-notes-field"/);
  assert.match(tasksUi, /id="detail-notes" class="detail-notes"/);
  assert.match(tasksUi, /data-action="task-tags-picker" data-task-id=/);
  assert.match(tasksUi, /aria-labelledby="task-modal-title"/);
  assert.match(tasksUi, /'task-detail-modal'/);
});

test('mobile quick add offers all supported item types and modal sheets have mobile layout hooks', () => {
  for (const type of ['Task', 'Goal', 'Habit', 'Note', 'Resource', 'Project']) assert.match(html, new RegExp(`>${type}<`));
  assert.match(app, /const frameClass = cls \? ` modal-backdrop-\$\{cls\}`/);
  assert.match(app, /modalState\.draft\.moreOpen \? \(\$\('#quick-notes'\)/);
  assert.match(app, /aria-label=\"Dailo dialog\"/);
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
  assert.match(html, /id="mobile-bottom-nav" class="mobile-bottom-nav"/);
  for (const route of ['today', 'inbox', 'calendar', 'goals', 'habits']) assert.match(html, new RegExp(`data-route="${route}"`));
  assert.match(css, /\.mobile-bottom-nav \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 1023px\) \{[\s\S]*?\.mobile-bottom-nav \{[\s\S]*?position: fixed;[\s\S]*?display: grid;/);
  assert.match(app, /function renderMobileBottomNav\(\)/);
});
