const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const tasks = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
const areas = fs.readFileSync(require.resolve('../js/areas-ui.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('icon-only task and subtask controls expose item-specific accessible names', () => {
  assert.match(tasks, /data-action="task-menu"[\s\S]*?aria-label="Task actions/);
  assert.match(tasks, /data-action="toggle-subtask"[\s\S]*?aria-label="\$\{[\s\S]*?\} subtask/);
  assert.match(tasks, /data-action="delete-subtask"[\s\S]*?aria-label="Delete subtask/);
  assert.match(app, /data-action="quick-delete-subtask"[\s\S]*?aria-label="Delete subtask/);
});

test('dialogs use visible headings as accessible names and modal focus hooks', () => {
  assert.match(app, /function modalFrame\([\s\S]*?aria-labelledby/);
  assert.match(app, /function captureModalReturnFocus\(/);
  assert.match(app, /function restoreModalReturnFocus\(/);
  assert.match(app, /function trapPopoverFocus\(/);
  assert.match(app, /el\.setAttribute\('role', 'dialog'\)/);
  assert.match(app, /popoverEl\.setAttribute\('aria-labelledby',/);
});

test('Areas tabs expose tab semantics, panel relationship, and arrow-key navigation', () => {
  assert.match(areas, /role="tablist"/);
  assert.match(areas, /role="tab"/);
  assert.match(areas, /aria-selected=/);
  assert.match(areas, /aria-controls="areas-panel"/);
  assert.match(areas, /id="areas-panel"[\s\S]*role="tabpanel"/);
  assert.match(app, /function handleAreaTabKeydown\(/);
  assert.match(app, /ArrowRight|ArrowLeft/);
});

test('aria-live is limited to status/toast output instead of the application shell', () => {
  assert.doesNotMatch(html, /<div id="app"[^>]*aria-live=/);
  assert.match(html, /id="toast-root"[^>]*aria-live="assertive"/);
  assert.match(html, /id="global-status"[^>]*aria-live="polite"/);
});

test('primary compact mobile controls retain 44px touch targets', () => {
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.modal \.btn-icon,[\s\S]*?\.task-actions \.btn-icon,[\s\S]*?min-height: 44px/);
});
