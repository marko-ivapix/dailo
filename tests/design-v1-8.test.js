const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/styles.css');
const tokens = css.slice(0, css.indexOf('}') + 1);
const layerStart = css.indexOf('V1.8 Quiet Graphite / Swiss Compact\n');
const v18 = layerStart >= 0 ? css.slice(layerStart) : '';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Body of the first rule whose complete selector list is exactly `selector`.
const rule = (source, selector) => source.match(new RegExp(`(?:^|[{}/])\\s*${escape(selector)}\\s*\\{([^}]*)\\}`))?.[1] || '';
// Concatenated bodies of every `@media <query>` block inside a source slice.
const media = (source, query) => {
  let out = '';
  for (let at = source.indexOf(`@media ${query}`); at >= 0; at = source.indexOf(`@media ${query}`, at + 1)) {
    let depth = 0, i = source.indexOf('{', at);
    const start = i + 1;
    for (; i < source.length; i += 1) { if (source[i] === '{') depth += 1; else if (source[i] === '}' && --depth === 0) break; }
    out += source.slice(start, i) + '\n';
  }
  return out;
};

// Phase 1 — design tokens and global density

test('V1.8 defines the Quiet Graphite primitive palette in the top token block', () => {
  for (const [token, value] of [
    ['--graphite-950', '#0B0D10'], ['--graphite-900', '#0F1114'], ['--graphite-850', '#14171B'],
    ['--graphite-800', '#1A1D22'], ['--graphite-750', '#21252B'], ['--graphite-700', '#292E35'],
    ['--line-1', '#22262C'], ['--line-2', '#2D3239'], ['--line-3', '#3C434D'],
    ['--ink-1', '#F3F4F6'], ['--ink-2', '#D5D9DF'], ['--ink-3', '#9199A4'], ['--ink-4', '#6B727D'],
    ['--blue-600', '#0619FE'], ['--blue-500', '#2236FF'], ['--blue-700', '#0013D6'], ['--blue-300', '#8590FF'],
    ['--mint-400', '#30CBAD'], ['--yellow-400', '#F5B942'], ['--red-400', '#FF6464'], ['--red-600', '#D93A3F']
  ]) assert.match(tokens, new RegExp(`${escape(token)}:\\s*${escape(value)};`), token);
});

test('every V1.7 token name survives as an alias so adapters and inline styles keep working', () => {
  for (const token of [
    '--primary', '--primary-hover', '--primary-active', '--primary-focus', '--accent', '--accent-hover', '--accent-active',
    '--bg-primary', '--surface-nav', '--surface-card-primary', '--surface-card-dark', '--surface-interactive', '--surface-hover',
    '--text-primary', '--text-secondary', '--text-muted', '--text-on-card-muted', '--border-subtle', '--border-default', '--border-strong',
    '--success', '--warning', '--danger', '--info', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill',
    '--motion-fast', '--motion-base', '--motion-slow', '--ease-standard', '--ease-enter', '--ease-exit',
    '--sidebar-width', '--sidebar-width-collapsed', '--content-gutter', '--content-max-width', '--control-height', '--task-min-height',
    '--modal-quick-width', '--modal-detail-width', '--focus-ring', '--font-display', '--font-ui'
  ]) assert.match(tokens, new RegExp(`${escape(token)}:`), token);
  assert.match(tokens, /--primary-focus:\s*var\(--blue-300\)/);
  assert.match(tokens, /--danger:\s*var\(--red-400\)/);
  assert.match(tokens, /--danger-fill:\s*var\(--red-600\)/);
});

test('V1.8 geometry uses the tighter Swiss radius scale', () => {
  assert.match(tokens, /--radius-xs:\s*4px/);
  assert.match(tokens, /--radius-sm:\s*6px/);
  assert.match(tokens, /--radius-md:\s*8px/);
  assert.match(tokens, /--radius-lg:\s*12px/);
});

test('the focus ring is a visible two-step accent ring and survives forced-colors mode', () => {
  assert.match(tokens, /--focus-ring:\s*0 0 0 2px var\(--graphite-900\), 0 0 0 4px var\(--blue-300\)/);
  assert.doesNotMatch(css, /--focus-ring:\s*0 0 0 3px rgba\(6, 25, 254, \.18\)/);
  assert.match(v18, /:focus-visible[^{]*\{[^}]*outline:\s*2px solid transparent/);
});

test('V1.8 layer restyles global controls without introducing blur or glow', () => {
  assert.ok(layerStart > 0, 'V1.8 layer header is present');
  assert.match(rule(v18, '.btn-danger'), /background:\s*var\(--danger-fill\)/);
  assert.match(rule(v18, '.btn'), /border-radius:\s*var\(--radius-sm\)/);
  assert.match(rule(v18, '.page-title'), /font-family:\s*var\(--font-display\)/);
  assert.match(rule(v18, '.section-label'), /color:\s*var\(--ink-3\)/);
  assert.doesNotMatch(css, /backdrop-filter/);
});

// Phase 2 — desktop shell and sidebar

test('the sidebar returns to the 240px / 72px brand geometry', () => {
  assert.match(tokens, /--sidebar-width:\s*240px/);
  assert.match(tokens, /--sidebar-width-collapsed:\s*72px/);
  assert.doesNotMatch(css, /--sidebar-width:\s*220px/);
});

test('sidebar navigation uses a graphite rail with an accent active marker', () => {
  assert.match(rule(v18, '.sidebar'), /background:\s*var\(--graphite-950\)/);
  assert.match(rule(v18, '.sidebar'), /border-right-color:\s*var\(--line-1\)/);
  const marker = rule(v18, '.nav-item.is-active::before, .project-item.is-active::before, .sidebar-action.is-active::before');
  assert.match(marker, /width:\s*2px/);
  assert.match(marker, /background:\s*var\(--blue-300\)/);
  assert.match(rule(v18, '.nav-item.is-active i, .sidebar-action.is-active i'), /color:\s*var\(--blue-300\)/);
  assert.match(rule(v18, '.sidebar-section-title'), /color:\s*var\(--ink-3\)/);
  assert.match(rule(v18, '.nav-badge'), /font-variant-numeric:\s*tabular-nums/);
});

// Phase 3 — mobile navigation and Quick Add

test('the bottom bar is opaque graphite with a 2px accent indicator on the active route', () => {
  assert.match(rule(v18, '.mobile-bottom-nav'), /background:\s*var\(--graphite-950\)/);
  const indicator = rule(v18, '.mobile-bottom-nav-item.is-active::before');
  assert.match(indicator, /height:\s*2px/);
  assert.match(indicator, /background:\s*var\(--blue-300\)/);
  assert.match(rule(v18, '.mobile-bottom-nav-item.is-active'), /background:\s*transparent/);
});

test('Još keeps full-height route rows (the bottom sheet became a screen in redesign R1)', () => {
  assert.match(rule(v18, '.mobile-more-route'), /min-height:\s*46px/);
  assert.doesNotMatch(css, /\.mobile-more-sheet|\.mobile-more-backdrop/);
});

test('Quick Add keeps its 44px floating composition as a rounded-square primary control', () => {
  assert.match(css, /\.mobile-quick-add-option i, \.mobile-quick-add-toggle \{ width: 44px; height: 44px; \}/);
  const toggle = rule(v18, '.mobile-quick-add-toggle');
  assert.match(toggle, /border-radius:\s*12px/);
  assert.match(toggle, /background:\s*var\(--blue-600\)/);
  assert.match(rule(v18, '.mobile-quick-add-option i'), /border-radius:\s*10px/);
  assert.match(css, /\.mobile-quick-add \{[\s\S]*?position: fixed;[\s\S]*?display: grid;/);
});

// Phase 4 — Today and Inbox

test('Today dashboard cards share the hairline panel language and pinned cards keep a visible rail', () => {
  const card = rule(v18, '.content > [data-dashboard-section]');
  assert.match(card, /border:\s*1px solid var\(--line-1\)/);
  assert.match(card, /background:\s*var\(--graphite-850\)/);
  assert.match(rule(v18, '.content > [data-dashboard-section].is-dashboard-pinned'), /box-shadow:\s*inset 2px 0 0 var\(--blue-300\)/);
  assert.match(rule(v18, '.today-context:empty'), /display:\s*none/);
  assert.match(rule(v18, '.today-focus-strip-count'), /font-variant-numeric:\s*tabular-nums/);
});

test('daily actions are compact icon-left tiles that fit one row on desktop and two columns on phones', () => {
  assert.match(rule(v18, '.today-actions-grid'), /grid-template-columns:\s*repeat\(auto-fit, minmax\(128px, 1fr\)\)/);
  assert.match(rule(v18, '.today-action'), /grid-template-columns:\s*20px minmax\(0, 1fr\)/);
  const phone = media(v18, '(max-width: 700px)');
  assert.match(rule(phone, '.today-actions-grid'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rule(phone, '.today-action'), /min-height:\s*44px/);
});

test('task rows complete in mint without turning the 44px phone hit area into a filled square', () => {
  assert.match(rule(v18, '.task-row:hover, .task-row:focus-within'), /background:\s*var\(--graphite-800\)/);
  const done = rule(v18, '.complete-control.is-completed');
  assert.match(done, /background:\s*var\(--mint-400\)/);
  assert.match(done, /color:\s*var\(--graphite-950\)/);
  const phone = media(v18, '(max-width: 700px)');
  assert.match(phone, /\.task-row > \.complete-control\.is-completed[^{]*\{[^}]*background:\s*transparent/);
  assert.match(phone, /\.task-row > \.complete-control\.is-completed::before[^{]*\{[^}]*background:\s*var\(--mint-400\)/);
});

test('milestone check buttons are real controls with a 44px phone hit area', () => {
  assert.match(rule(v18, '.task-check, .check-toggle'), /border-radius:\s*var\(--radius-sm\)/);
  assert.match(rule(media(v18, '(max-width: 700px)'), '.task-check::after, .check-toggle::after'), /inset:\s*-8px/);
});

test('Inbox filters become a segmented control and task metadata no longer needs an inline style', () => {
  const tabs = rule(v18, '.inbox-filter-tabs');
  assert.match(tabs, /background:\s*var\(--graphite-950\)/);
  assert.match(tabs, /border-radius:\s*var\(--radius-md\)/);
  assert.match(rule(v18, '.inbox-filter-tab.is-active'), /border-color:\s*var\(--line-2\)/);
  const tasksUi = read('js/tasks-ui.js');
  assert.match(tasksUi, /<span class="task-meta-project">/);
  assert.doesNotMatch(tasksUi, /style="display:inline-flex;align-items:center;gap:6px"/);
  assert.match(rule(v18, '.task-meta-project'), /display:\s*inline-flex/);
});

// Phase 5 — Task Properties modal and overlays

test('modals are 12px graphite panels with overlay elevation and bottom-sheet grabbers on phones', () => {
  const modal = rule(v18, '.modal');
  assert.match(modal, /border-radius:\s*var\(--radius-lg\)/);
  assert.match(modal, /background:\s*var\(--graphite-850\)/);
  assert.match(modal, /box-shadow:\s*var\(--shadow-overlay\)/);
  const phone = media(v18, '(max-width: 700px)');
  assert.match(phone, /\.modal-backdrop-task-detail-modal \.modal::before[^{]*\{[^}]*width:\s*32px/);
});

test('Task Properties keeps collapsed disclosures and presents grouped key/value rows', () => {
  const tasksUi = read('js/tasks-ui.js');
  for (const name of ['task-properties-disclosure', 'task-schedule-disclosure', 'task-links-notes-disclosure']) {
    assert.match(tasksUi, new RegExp(`<details class="detail-section detail-disclosure ${name}">`));
  }
  assert.match(rule(v18, '.task-properties-summary'), /min-height:\s*32px/);
  assert.match(rule(v18, '.task-properties-summary:hover'), /background:\s*var\(--graphite-800\)/);
  const group = rule(v18, '.task-property-group');
  assert.match(group, /background:\s*var\(--graphite-900\)/);
  assert.match(group, /border-color:\s*var\(--line-1\)/);
  assert.match(rule(v18, '.property-value'), /color:\s*var\(--ink-1\)/);
  assert.match(rule(v18, '.property-chip'), /border-radius:\s*var\(--radius-sm\)/);
});

test('popovers keep focus rings visible and toasts distinguish alerts from confirmations', () => {
  assert.match(rule(v18, '.popover'), /box-shadow:\s*var\(--shadow-popover\)/);
  assert.doesNotMatch(rule(v18, '.popover-option.is-selected'), /box-shadow/);
  assert.match(rule(v18, '.toast'), /inset 2px 0 0 var\(--mint-400\)/);
  assert.match(rule(v18, '.toast[role="alert"]'), /inset 2px 0 0 var\(--warning\)/);
  assert.match(rule(v18, '.toast[role="alert"] .toast-icon'), /color:\s*var\(--warning\)/);
  assert.match(rule(v18, '.search-result:hover, .search-result.is-keyboard'), /background:\s*var\(--graphite-800\)/);
});

// Phase 6 — Calendar

test('Week/Month and template type switches share one segmented control', () => {
  const group = rule(v18, '.list-tabs, .view-tabs');
  assert.match(group, /background:\s*var\(--graphite-950\)/);
  assert.match(group, /border-radius:\s*var\(--radius-md\)/);
  assert.match(rule(v18, '.list-tabs .btn.is-active, .view-tabs .btn.btn-secondary'), /background:\s*var\(--graphite-750\)/);
});

test('calendar items carry type rails: tasks blue, habits mint, goals neutral, milestones yellow', () => {
  assert.match(tokens, /--cal-task:\s*var\(--blue-300\)/);
  assert.match(tokens, /--cal-habit:\s*var\(--mint-400\)/);
  assert.match(tokens, /--cal-goal:\s*var\(--ink-2\)/);
  assert.match(tokens, /--cal-milestone:\s*var\(--yellow-400\)/);
  for (const type of ['task', 'habit', 'goal', 'milestone']) {
    assert.match(v18, new RegExp(`\\.calendar-${type} \\{ --cal-rail: var\\(--cal-${type}\\); \\}`));
  }
  assert.match(rule(v18, '.calendar-item::before'), /background:\s*var\(--cal-rail, var\(--cal-task\)\)/);
  assert.match(rule(v18, '.calendar-timed-block.has-conflict'), /--cal-rail:\s*var\(--warning\)/);
});

test('calendar today/selection markers never hide the keyboard focus ring', () => {
  assert.match(rule(v18, '.calendar-day.is-today'), /box-shadow:\s*inset 0 2px 0 var\(--blue-300\)/);
  assert.match(rule(v18, '.calendar-month-day.is-today > strong'), /background:\s*var\(--blue-600\)/);
  assert.doesNotMatch(rule(v18, '.calendar-month-day.is-selected'), /box-shadow/);
  assert.match(rule(v18, '.calendar-month-day:focus-visible, .calendar-day-heading:focus-visible'), /box-shadow:\s*var\(--focus-ring-inset\)/);
});

// Phase 7 — Goals and Habits

test('Goal and Habit groups are flat bands with a hairline instead of boxed headers', () => {
  const band = rule(v18, '.goal-group-header, .habit-group-header');
  assert.match(band, /border-bottom:\s*1px solid var\(--line-1\)/);
  assert.match(band, /background:\s*transparent/);
  assert.match(rule(v18, '.goal-group-heading .section-label, .habit-group-heading .section-label'), /font-family:\s*var\(--font-display\)/);
});

test('progress bars are 4px accent fills that turn mint for completed goals', () => {
  assert.match(rule(v18, '.goal-progress'), /height:\s*4px/);
  assert.match(rule(v18, '.goal-progress > span, .today-section--goals .goal-progress > span'), /background:\s*var\(--blue-300\)/);
  assert.match(rule(v18, '.goal-open:has(.goal-status--completed) .goal-progress > span'), /background:\s*var\(--mint-400\)/);
  assert.match(rule(v18, '.goal-status--completed, .goal-row .goal-status--completed'), /color:\s*var\(--mint-400\)/);
});

test('state rails on rows are positioned pseudo-elements so hover fills cannot hide them', () => {
  assert.match(rule(v18, '.goal-row.is-overdue::before'), /background:\s*var\(--danger\)/);
  assert.match(rule(v18, '.habit-row--done::before, .habit-row--missed::before'), /background:\s*var\(--mint-400\)/);
  assert.match(rule(v18, '.goal-row.is-overdue::before, .habit-row--done::before, .habit-row--missed::before'), /position:\s*absolute/);
  assert.match(rule(v18, '.habit-row--missed::before'), /background:\s*var\(--danger\)/);
});

test('the monthly tracker keeps its cell geometry and uses token colors per check-in state', () => {
  assert.match(css, /\.habit-day-cell \{ width:20px; height:22px;/);
  assert.match(rule(v18, '.habit-day-cell.is-done::after'), /background:\s*var\(--mint-400\)/);
  assert.match(rule(v18, '.habit-day-cell.is-missed::after'), /background:\s*var\(--danger\)/);
  assert.match(rule(v18, '.habit-day-cell.is-skipped::after'), /background:\s*var\(--warning\)/);
  assert.match(rule(v18, '.habit-day-cell:not(:disabled):hover'), /transform:\s*none/);
  assert.doesNotMatch(v18, /rgba\(107,\s*211,\s*155/);
  assert.match(rule(v18, ':where(.insight-card) > strong'), /font-family:\s*var\(--font-display\)/);
});

// Phase 8 — Areas, Projects, Notes and Resources

test('Area tabs are underline tabs keyed on aria-selected, keeping their tab semantics', () => {
  const areasUi = read('js/areas-ui.js');
  assert.match(areasUi, /role="tablist"/);
  assert.match(areasUi, /role="tab"[^>]*aria-selected=/);
  assert.match(rule(v18, '.area-tabs'), /border-bottom:\s*1px solid var\(--line-1\)/);
  const underline = rule(v18, '.area-tabs button[aria-selected="true"]::after');
  assert.match(underline, /height:\s*2px/);
  assert.match(underline, /background:\s*var\(--blue-300\)/);
});

test('organizational lists share the hairline card and display numerals', () => {
  const card = rule(v18, '.area-row, .archived-project-row, .cleaning-room-card');
  assert.match(card, /border-color:\s*var\(--line-1\)/);
  assert.match(card, /border-radius:\s*var\(--radius-md\)/);
  const stat = rule(v18, '.area-summary strong');
  assert.match(stat, /font-family:\s*var\(--font-display\)/);
  assert.match(stat, /font-variant-numeric:\s*tabular-nums/);
  assert.match(rule(v18, '.tag-dot'), /border-radius:\s*2px/);
});

test('Notes and Resources keep their own rows with accent clips and a filter panel', () => {
  assert.match(read('js/knowledge.js'), /class="goal-row knowledge-row"/);
  assert.match(rule(v18, '.knowledge-clip blockquote'), /border-left:\s*2px solid var\(--blue-300\)/);
  assert.match(rule(v18, '.filter-bar, .knowledge-filters'), /background:\s*var\(--graphite-850\)/);
});

test('attachment drop zones keep hover and drag-over feedback after the V1.8 section background', () => {
  assert.match(rule(v18, '.attachment-drop-zone'), /border-color:\s*var\(--line-3\)/);
  const section = v18.indexOf('.attachments-section .attachment-drop-zone {');
  const hover = v18.indexOf('.attachment-drop-zone:hover, .attachment-drop-zone.is-dragover {');
  assert.ok(section > 0 && hover > section, 'hover/drag-over rule must follow the section background rule');
  assert.match(rule(v18, '.attachment-drop-zone:hover, .attachment-drop-zone.is-dragover'), /background:\s*var\(--accent-tint\)/);
});

// Phase 9 — Templates, Settings and More

test('template rows use the segmented type switch and do not pretend their text is clickable', () => {
  assert.match(read('js/templates-ui.js'), /<div class="view-tabs">/);
  assert.match(rule(v18, '.view-tabs'), /margin-bottom:\s*14px/);
  const text = rule(v18, '[data-template-row] .goal-open');
  assert.match(text, /cursor:\s*default/);
  assert.match(rule(v18, '[data-template-row] .goal-open:hover'), /background:\s*transparent/);
  assert.match(rule(v18, '.template-fields'), /display:\s*grid/);
});

test('Settings cards are hairline panels and the Today cards fieldset drops the browser groove border', () => {
  const card = rule(v18, '.settings-card');
  assert.match(card, /border-color:\s*var\(--line-1\)/);
  assert.match(card, /border-radius:\s*var\(--radius-md\)/);
  assert.match(rule(v18, '.settings-card h2'), /font-size:\s*15px/);
  const fieldset = rule(v18, 'fieldset.settings-row');
  assert.match(fieldset, /margin:\s*0/);
  assert.match(fieldset, /border:\s*0/);
  assert.match(fieldset, /border-top:\s*1px solid var\(--line-1\)/);
});

test('backup and snapshot surfaces use the panel and warning-tint language', () => {
  assert.match(rule(v18, '.backup-summary > div'), /background:\s*var\(--graphite-900\)/);
  assert.match(rule(v18, '.backup-warning'), /background:\s*var\(--warning-tint\)/);
  assert.match(rule(v18, '.snapshot-group'), /border-bottom-color:\s*var\(--line-1\)/);
});

// Phase 10 — empty, loading, error, focus and reduced-motion states

test('the data-loading surface is an announced, busy status with a motion-safe indicator', () => {
  const app = read('js/app.js');
  assert.match(app, /<div class="recovery recovery--loading" role="status" aria-busy="true"><div class="recovery-card"><span class="recovery-spinner" aria-hidden="true"><\/span><h1>\$\{tr\('Preparing your local data…'\)\}<\/h1>/);
  assert.match(rule(v18, '.recovery-spinner'), /animation:\s*v18-spin/);
  assert.match(rule(media(v18, '(prefers-reduced-motion: reduce)'), '.recovery-spinner'), /animation:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \*, \*::before, \*::after \{ animation-duration: 1ms !important;/);
});

test('empty and error states use a quiet mark, opaque warning band and danger rails', () => {
  assert.match(rule(v18, '.empty-state::before'), /width:\s*28px/);
  assert.match(rule(v18, '.empty-state h3'), /font-family:\s*var\(--font-display\)/);
  const band = rule(v18, '.global-warning');
  assert.match(band, /background:\s*color-mix\(in srgb, var\(--danger\) 10%, var\(--graphite-900\)\)/);
  assert.match(band, /box-shadow:\s*inset 2px 0 0 var\(--danger\)/);
  assert.match(rule(v18, '.input.is-error:focus'), /box-shadow:\s*0 0 0 1px var\(--danger\)/);
  assert.match(rule(v18, '.recovery:not(.recovery--loading) .recovery-card'), /box-shadow:\s*inset 0 2px 0 var\(--danger\)/);
});

test('focus stays visible inside clipped and scrolling containers, high contrast and forced colors', () => {
  const inset = rule(v18, '.goal-open:focus-visible, .habit-open:focus-visible, .area-open:focus-visible, .tag-select:focus-visible, .search-result:focus-visible, .mobile-more-route:focus-visible, .inbox-filter-tab:focus-visible, .list-tabs .btn:focus-visible, .view-tabs .btn:focus-visible, .habit-tracker-name:focus-visible, .property-row:focus-visible, .calendar-item-open:focus-visible, .goal-dashboard-spotlight:focus-visible');
  assert.match(inset, /box-shadow:\s*var\(--focus-ring-inset\)/);
  assert.match(media(v18, '(prefers-contrast: more)'), /--line-1:\s*#3C434D/);
  const forced = media(v18, '(forced-colors: active)');
  assert.match(forced, /:focus-visible \{ outline: 2px solid Highlight !important;/);
  assert.match(forced, /forced-color-adjust:\s*none/);
});

test('every class emitted by markup is styled or is a documented semantic hook', () => {
  const hooks = new Set(['daily-review', 'habit-insights', 'habit-properties', 'habit-target-properties', 'task-links-notes-disclosure', 'task-notes-field', 'task-property-group--focus', 'task-property-group--organization', 'task-schedule-disclosure', 'today-section--tasks', 'tomorrow-drop-target']);
  const sources = [...fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => `js/${file}`), 'index.html'];
  const classes = new Set();
  for (const file of sources) {
    for (const match of read(file).matchAll(/class="([^"]*)"/g)) {
      for (const token of match[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-z][a-z0-9-]*[a-z0-9]$/.test(token) && !token.startsWith('ph')) classes.add(token);
    }
  }
  const unstyled = [...classes].filter(name => !hooks.has(name) && !new RegExp(`\\.${escape(name)}(?![a-z0-9-])`).test(css));
  assert.deepEqual(unstyled, []);
});

test('the phone touch-target guard is the final rule and covers V1.8 controls', () => {
  const marker = '/* Keep primary compact actions touchable after all density rules. */';
  const guard = css.slice(css.lastIndexOf(marker));
  assert.ok(css.lastIndexOf(marker) > layerStart, 'guard follows the V1.8 layer');
  // Modernization M7 (audit A-1) also applies the guard to touch screens wider than a phone.
  assert.match(guard, /^\/\* Keep primary compact actions touchable after all density rules\. \*\/\n@media \(max-width: 700px\), \(pointer: coarse\) \{\n[^@]*\n\}\n?$/);
  assert.match(guard, /\.task-actions \.btn-icon,\n  \.subtask-row \.btn-icon \{ width: 44px; height: 44px; min-height: 44px; \}/);
  assert.match(guard, /\.task-row > \.complete-control,\n  \.subtask-row > \.complete-control \{ width: 44px; height: 44px; min-width: 44px; min-height: 44px; \}/);
  assert.match(guard, /\.inbox-filter-tab,\n  \.area-tabs button,\n  \.list-tabs \.btn,\n  \.view-tabs \.btn \{ min-height: 44px; \}/);
});
