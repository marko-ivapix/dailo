// Redesign R22b: the second design audit, fix 10 — one look for segments, folds, empty states, section labels, big
// buttons, Settings rows, the confirm dialog, the journal search and the task window's extra rows.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r22b-one-look.md
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
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const layerStart = css.indexOf('/* Redesign R22b');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const has = (text, label = text) => assert.ok(layer.includes(text), label);

test('the R22b layer comes after R22a', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R22a'));
});

test('segments: the Inbox filter is a row of pills, Zadaci\'s switch is full width, Lista / Raspored is readable', () => {
  const inbox = fn('renderInbox');
  assert.match(inbox, /<div class="sheet-chips inbox-filter-chips" role="group" aria-label="\$\{tr\('Filter Inbox'\)\}">/);
  assert.match(inbox, /<button class="quick-chip\$\{filter === value \? ' is-selected' : ''\}" type="button" aria-pressed="\$\{filter === value\}" data-action="inbox-filter" data-inbox-filter="\$\{value\}">/);
  assert.doesNotMatch(app, /role="tablist"|class="inbox-filter-tab/);
  has('.tasks-view-switch { display: flex; width: 100%; }');
  has('.tasks-view-switch .btn { flex: 1 1 0; }');
  has('.calendar-day-mode .btn { padding: 4px 14px; font-size: var(--text-base); }');
});

test('folds: one button everywhere — the label and count on the left, the caret on the right', () => {
  const ctx = withI18n({ esc });
  vm.createContext(ctx);
  vm.runInContext(fn('foldButton'), ctx);
  assert.equal(ctx.foldButton('goals-fold', 'Paused', 2, true, ' data-fold="paused"'), '<button class="collapsible-trigger" type="button" data-action="goals-fold" data-fold="paused" aria-expanded="true"><span class="left">Paused · 2</span><i class="ph ph-caret-up" aria-hidden="true"></i></button>');
  assert.match(fn('domainContext'), /\n      foldButton,\n/);
  const sources = ['js/app.js', 'js/goals-ui.js', 'js/habits-ui.js', 'js/areas-ui.js', 'js/cleaning-ui.js', 'js/projects-ui.js'];
  const literal = sources.flatMap(file => [...read(file).matchAll(/<button class="collapsible-trigger/g)].map(() => file));
  assert.deepEqual(literal, ['js/app.js'], 'only foldButton writes the markup');
  assert.match(read('js/cleaning-ui.js'), /<button class="quick-chip" type="button" data-action="restore-cleaning-group"/, '"Vrati" is a chip in every fold');
});

test('empty states and section labels share one look; project lists use the usual card', () => {
  has(':is(.area-empty-hint, .area-empty-copy) { margin: 12px 10px; color: var(--ink-3); font-size: var(--text-base); }');
  has('.inbox-empty::before { content: none; }');
  has(':is(.cleaning-section-title, .review-card-title, .inbox-group-label strong, .settings-card h2) { color: var(--ink-3); font-family: var(--font-ui); font-size: var(--text-sm); font-weight: 600; letter-spacing: var(--tracking-label); text-transform: uppercase; }');
  assert.doesNotMatch(app, /<div class="more-card"><button class="project-row"|`<div class="more-card">\$\{/);
  assert.match(app, /<div class="today-card project-list"><button class="project-row" type="button" data-route="project\/none">/);
  assert.match(read('js/areas-ui.js'), /`<div class="today-card project-list">\$\{projects\.map\(project => projectOverviewRow\(project\)\)\.join\(''\)\}<\/div>`/);
});

test('big buttons: 16 px everywhere, and the goal window\'s one fills the footer', () => {
  has('.habit-window-save { font-size: var(--text-lg); }');
  const goals = read('js/goals-ui.js');
  assert.doesNotMatch(goals, /quick-sheet-footer"><span><\/span>\$\{footer\}/);
  assert.match(goals, /class="btn btn-secondary habit-window-save goal-details-complete"/);
});

test('Settings on a phone: a select sits under its label, checkboxes are switches, "Prijavi se" is the main button', () => {
  const narrow = layer.slice(layer.indexOf('@media (max-width: 520px)'));
  assert.match(narrow, /\.settings-row:has\(> select\.input\) \{ flex-direction: column; align-items: stretch; gap: 8px; padding: 10px 0; \}/);
  // R34: the Važno/Hitno rows left the task window in R33, so the switch rule names only Settings rows.
  has('.settings-row > input[type="checkbox"] { appearance: none;');
  has('.settings-row > input[type="checkbox"]:checked { background: var(--blue-600); }');
  // R40: Nalog's main button opens the welcome screen (it replaced "Pošalji kod").
  assert.match(read('js/settings-ui.js'), /<button class="btn btn-primary" type="button" data-action="open-welcome" data-mode="sign-in">/);
});

test('the confirm dialog is a sheet with the red button first and a Serbian word to type', () => {
  const confirm = fn('renderConfirmModal');
  assert.match(confirm, /<div class="modal-inner quick-sheet choice-window confirm-window">/);
  assert.match(confirm, /<div class="sheet-actions"><button class="btn \$\{modalState\.confirmKind === 'primary' \? 'btn-primary' : 'btn-danger'\}" type="button" data-action="confirm-action">/);
  assert.match(confirm, /<label class="sheet-label" for="global-confirm-phrase">/);
  assert.match(confirm, /'quick confirm-modal'\);/);
  assert.doesNotMatch(confirm, /style="|modal-footer/);
  assert.match(app, /const CONFIRM_WORDS = \{ reset: 'RESETUJ', restore: 'VRATI' \};/);
  assert.match(app, /phrase: CONFIRM_WORDS\[reason\],/);
  assert.match(fn('commitGlobalOperation'), /if \(plainWord\(\$\('#global-confirm-phrase'\)\?\.value\) !== plainWord\(CONFIRM_WORDS\[op\.reason\]\)\)/);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fn('plainWord'), ctx);
  assert.equal(ctx.plainWord(' obrisi '), ctx.plainWord('OBRIŠI'), 'case and diacritics do not matter');
});

test('search: the journal field looks like the other search fields; project results stack their text', () => {
  assert.match(read('js/journal-ui.js'), /<label class="sheet-search journal-search"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input id="journal-query" class="input" type="search"/);
  assert.match(app, /<span class="search-result-icon"><span class="project-dot" style="--project-color:\$\{esc\(project\.color\)\}"><\/span><\/span><span class="search-result-text"><span class="search-result-title">/);
});

test('the task window: the project once, "Više opcija" rows like the others, attachments without "drop" on a phone', () => {
  const tasksUi = read('js/tasks-ui.js');
  assert.doesNotMatch(tasksUi, /row\('task-project-picker'/, 'the blue project link under the title is enough');
  // R34: "Više opcija" holds task-window rows since R33, so the old property-row rule is gone.
  assert.doesNotMatch(css, /\.property-row/);
  has('.task-window-attachments .detail-heading { margin: 16px 0 6px; color: var(--ink-3); font-size: var(--text-sm); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }');
  const coarse = layer.slice(layer.indexOf('@media (pointer: coarse)'));
  assert.match(coarse, /\.attachment-drop-zone > span:not\(\.btn\) \{ display: none; \}/);
});

test('R22b shipped as 2.0.0-alpha.46 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 46);
});
