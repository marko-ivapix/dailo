const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const tasks = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
const areas = fs.readFileSync(require.resolve('../js/areas-ui.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');

test('icon-only task and subtask controls expose item-specific accessible names', () => {
  assert.match(tasks, /data-action="task-menu"[\s\S]*?aria-label="\$\{tr\('Task actions'\)\}"/);
  assert.match(tasks, /data-action="toggle-subtask"[\s\S]*?aria-label="\$\{subtask\.isCompleted \? tr\('Mark subtask incomplete'\) : tr\('Complete subtask'\)\}"/);
  assert.match(tasks, /data-action="delete-subtask"[\s\S]*?aria-label="\$\{tr\('Delete subtask'\)\}"/);
  // Redesign R4: Quick Add no longer edits subtasks; they are added in the task window ("Više opcija").
  assert.doesNotMatch(app, /quick-delete-subtask/);
});

test('dialogs use visible headings as accessible names and modal focus hooks', () => {
  assert.match(app, /function modalFrame\([\s\S]*?aria-labelledby/);
  assert.match(app, /function captureModalReturnFocus\(/);
  assert.match(app, /function restoreModalReturnFocus\(/);
  assert.match(app, /function trapPopoverFocus\(/);
  assert.match(app, /el\.setAttribute\('role', 'dialog'\)/);
  assert.match(app, /popoverEl\.setAttribute\('aria-labelledby',/);
});

// Redesign R10a (S1): the Sve / Aktivno / Arhivirano tabs left. Archived areas fold behind a button that reports its
// state, and the area window's color and icon choices report theirs.
test('Oblasti folds archived areas behind aria-expanded; the area window choices expose aria-pressed', () => {
  assert.doesNotMatch(areas, /role="tablist"|handleAreaTabKeydown/);
  assert.doesNotMatch(app, /handleAreaTabKeydown/);
  assert.match(areas, /data-action="areas-fold" aria-expanded="\$\{open\}"/);
  assert.match(areas, /data-action="select-area-color"[^`]*aria-pressed="\$\{color === d\.color\}"/);
  assert.match(areas, /data-action="select-area-icon"[^`]*aria-pressed="\$\{icon === d\.icon\}"/);
});

test('aria-live is limited to status/toast output instead of the application shell', () => {
  assert.doesNotMatch(html, /<div id="app"[^>]*aria-live=/);
  assert.match(html, /id="toast-root"[^>]*aria-live="assertive"/);
  assert.match(html, /id="global-status"[^>]*aria-live="polite"/);
});

test('primary compact mobile controls retain 44px touch targets', () => {
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.modal \.btn-icon,[\s\S]*?\.task-actions \.btn-icon,[\s\S]*?min-height: 44px/);
  assert.match(css, /Keep primary compact actions touchable after all density rules[\s\S]*?\.task-actions \.btn-icon,[\s\S]*?min-height: 44px/);
});

// Redesign R3: the reminder sheet re-renders in place (refreshSheet) with its title, and a swapped sheet gets its
// grabber, title and X back (decorateSheet); focus goes to the first useful control, not the X.
test('popover headings stay labelled after repeat and reminder content swaps', () => {
  assert.match(app, /function setPopoverContent\(html\)/);
  assert.match(app, /return `<div class="popover-title">\$\{tr\('Reminder'\)\}<\/div>/);
  assert.match(app, /refreshSheet\(reminderSheetHtml\(\)/);
  // R11b: the repeat editor replaced the custom-repeat form; it swaps its content with refreshSheet like the
  // reminder sheet, and the inline "New tag" form still swaps through setPopoverContent.
  assert.match(app, /return `<div class="popover-title">\$\{tr\('Repeat'\)\}<\/div>/);
  assert.match(app, /refreshSheet\(repeatSheetHtml\(\)/);
  assert.match(app, /setPopoverContent\(`<div class="popover-title">\$\{tr\('New tag'\)\}/);
  assert.match(app, /popoverEl\.innerHTML = html;\n    decorateSheet\(popoverEl\);/);
  assert.match(app, /setPopoverContent[\s\S]*?requestAnimationFrame\(\(\) => \(popoverEl && sheetInitialFocus\(popoverEl\)\)\?\.focus\(\)\)/);
  assert.match(app, /closePopover\(\)[\s\S]*?openerIsActive[\s\S]*?focusRoot\?\.querySelector\(returnFocus\.selector\)/);
  assert.match(app, /function popoverFocusTarget\(/);
  assert.match(app, /popoverReturnFocus = popoverFocusTarget\(anchor\)/);
  assert.match(app, /const activeModal = \$\('#modal-root \.modal'\)/);
  assert.match(app, /returnFocus\?\.modal[\s\S]*?activeModal \|\| document/);
});
