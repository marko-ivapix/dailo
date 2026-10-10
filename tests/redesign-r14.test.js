// Redesign R14: the first phone review (T1, T3, T6 and G2 amended on 2026-10-10).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r14-phone-review.md
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
const index = read('index.html');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const layerStart = css.indexOf('/* Redesign R14');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};
const TODAY = Core.dateOnly();

test('T1: every header stays one row, with the search as a visible button at the top right', () => {
  assert.ok(layerStart > css.indexOf('.page-header { flex-direction: column;'), 'the layer comes after the old phone rule');
  assert.match(rule('.page-header'), /flex-direction: row; align-items: center;/);
  assert.match(rule('.page-header > :first-child'), /flex: 1; min-width: 0;/);
  assert.match(rule('.page-actions'), /width: auto; flex: none; flex-wrap: nowrap;/);
  assert.match(rule('.page-actions .btn'), /flex: none;/);
  const button = rule('.page-actions > .btn-icon');
  for (const part of ['width: 44px', 'height: 44px', 'border: 1px solid var(--line-2)', 'border-radius: 12px', 'background: var(--graphite-850)', 'color: var(--ink-1)']) assert.ok(button.includes(part), part);
  assert.match(fn('pageHeader'), /<div class="page-actions">\s*<button class="btn-icon page-search" type="button" data-action="open-search" aria-label="\$\{tr\('Search'\)\}">/);
});

test('T6: Today no longer shows the weekly review notice; the review stays in Još', () => {
  assert.doesNotMatch(app, /weeklyReviewNotice|data-weekly-review-notice/);
  assert.match(fn('renderToday'), /html \+= backupReminderNotice\(\);\n    \/\/ R14 \(T6 amended\)[^\n]*\n    html \+= callDomainHook\('renderRoute', \{ type: 'journal-notice' \}\) \|\| '';/);
  for (const key of ['Time for the weekly review', 'Start review', 'A few minutes to empty the Inbox, catch up on overdue tasks and look at the week ahead.']) assert.ok(!sr.includes(JSON.stringify(key)), key);
  assert.equal(typeof Core.weeklyReviewDue, 'function', 'Core keeps the rule');
  assert.match(app, /moreRow\('review', 'ph-clipboard-text', tr\('Weekly review'\)\)/);
});

function rowModule() {
  let module;
  runInNewContextWithI18n(read('js/tasks-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  const ctx = { Core, esc: String, getProject: id => (id === 'p' ? { id: 'p', name: 'Posao', color: '#123456' } : null), getArea: id => (id === 'a' ? { id: 'a', name: 'Kuća' } : null), todayDueLabel: date => (date ? `<due ${date}>` : ''), state: { settings: { focusTaskIds: [] } } };
  return task => (options = {}) => module.renderTaskRow({ tagIds: [], ...task }, options.context || 'today', { today: true, ...options }, ctx);
}
const endsWithCheckbox = row => /<button class="complete-control [^"]*" type="button" data-action="toggle-complete"[^>]*>[^<]*(<i class="ph ph-check"><\/i>)?<\/button>\s*<\/article>$/.test(row);

test('T3: a task row is text first, the due label under the title and the checkbox at the far right', () => {
  const row = rowModule();
  const high = row({ id: 't1', title: 'Report', projectId: 'p', plannedTime: '09:30', priority: 'high', dueDate: TODAY })({ draggable: true });
  assert.match(high, /<div class="task-meta"><i class="ph ph-flag task-flag task-flag--high" role="img" aria-label="High priority"><\/i><due [^>]+> · 09:30 · Posao<\/div>/);
  assert.ok(high.indexOf('class="task-main"') < high.indexOf('data-task-compact-actions'), 'the menu after the text');
  assert.ok(high.indexOf('data-task-compact-actions') < high.indexOf('class="complete-control'), 'the checkbox last');
  assert.ok(endsWithCheckbox(high), 'the row ends with the checkbox');
  assert.match(high, /data-inline-today-complete/);
  assert.doesNotMatch(high, /task-side/, 'nothing on the right but the checkbox');
  assert.match(row({ id: 't2', title: 'Clean', areaId: 'a', priority: 'low' })(), /<div class="task-meta">Kuća<\/div>/);
  assert.match(row({ id: 't3', title: 'Call', priority: 'medium' })(), /<div class="task-meta"><i class="ph ph-flag task-flag task-flag--medium" role="img" aria-label="Medium priority"><\/i><\/div>/);
  assert.doesNotMatch(row({ id: 't4', title: 'Plain' })(), /task-meta/);
  const done = row({ id: 't5', title: 'Done', isCompleted: true, dueDate: Core.addDays(TODAY, -1) })({ context: 'completed' });
  assert.doesNotMatch(done, /<due /, 'no due label once done');
  assert.ok(endsWithCheckbox(done));
  const due = row({ id: 't6', title: 'Pay', dueDate: TODAY })();
  assert.match(due, /<div class="task-meta"><due [^>]+><\/div>/);
});

test('T3: Redovne obaveze keeps its own meta and right-side text, before the checkbox', () => {
  const chore = rowModule()({ id: 'c', title: 'Bathroom', priority: 'high', dueDate: TODAY })({ context: 'cleaning', metaText: 'Kupatilo · weekly', sideHtml: '<when>' });
  assert.match(chore, /<div class="task-meta">Kupatilo · weekly<\/div>/);
  assert.match(chore, /<span class="task-side"><when><\/span>/);
  assert.doesNotMatch(chore, /task-flag|<due /);
  assert.ok(chore.indexOf('task-side') < chore.indexOf('class="complete-control') && endsWithCheckbox(chore));
});

test('T3: the row lays out as a flex line, so no older grid column moves the checkbox', () => {
  assert.match(rule('.task-row--today'), /display: flex; align-items: center;/);
  assert.match(rule('.task-row--today > .task-main'), /flex: 1; min-width: 0;/);
  assert.match(rule('.task-row--today > :not(.task-main)'), /flex: none;/);
  assert.match(rule('.task-meta .task-flag'), /margin-right: 4px;/);
  assert.doesNotMatch(css, /\.task-row--today \{ grid-template-columns/, 'the old four-column grid is gone');
});

test('T2a: goal and milestone rows put the due label in the meta line and the target icon on the right', () => {
  const ctx = withI18n({ state: { habitMetrics: {} }, Core: { ...Core, computeGoalProgress: () => ({ percent: 44.6 }) }, esc: String, formatDate: date => `D(${date})` });
  vm.createContext(ctx);
  vm.runInContext(`${fn('todayDueLabel')}${fn('deadlineRow')}`, ctx);
  const goal = { id: 'g1', title: 'Marathon', targetDate: Core.addDays(TODAY, -1) };
  assert.equal(ctx.deadlineRow({ goal }, TODAY), `<article class="today-row deadline-row" data-goal-id="g1"><button class="today-row-main" type="button" data-route="goal/g1"><span class="task-title">Marathon</span><span class="task-meta">Goal · 45% · <span class="task-due is-overdue">Due D(${goal.targetDate})</span></span></button><span class="deadline-icon" aria-hidden="true"><i class="ph ph-target"></i></span></article>`);
  assert.match(ctx.deadlineRow({ goal, milestone: { id: 'm1', title: '10 km', date: TODAY } }, TODAY), /<span class="task-meta">Milestone · Marathon · <span class="task-due is-today">Due today<\/span><\/span><\/button><span class="deadline-icon"/);
  assert.match(rule('.deadline-row'), /grid-template-columns: minmax\(0, 1fr\) 44px;/);
  assert.match(rule('.deadline-icon'), /width: 44px;/);
});

function quickAddElements() {
  const element = () => {
    const classes = new Set();
    return { hidden: true, attrs: {}, classes, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }, hasAttribute(key) { return key in this.attrs; } };
  };
  return { '#mobile-quick-add': element(), '#mobile-quick-add-toggle': element(), '#mobile-quick-add-menu': element(), '#mobile-quick-add-scrim': element() };
}

test('G2: the "+" menu opens over a dimmed scrim, and a tap on the scrim only closes it', () => {
  assert.match(index, /<div id="mobile-quick-add-scrim" class="mobile-quick-add-scrim" hidden><\/div>\n  <div id="mobile-quick-add" class="mobile-quick-add">/);
  const els = quickAddElements();
  const ctx = withI18n({ $: selector => els[selector] || null, quickAddDirect: () => null });
  vm.createContext(ctx);
  vm.runInContext(fn('setMobileQuickAddOpen'), ctx);
  ctx.setMobileQuickAddOpen(true);
  assert.equal(els['#mobile-quick-add-scrim'].hidden, false);
  assert.equal(els['#mobile-quick-add-menu'].hidden, false);
  assert.equal(els['#mobile-quick-add-toggle'].attrs['aria-expanded'], 'true');
  ctx.setMobileQuickAddOpen(false);
  assert.equal(els['#mobile-quick-add-scrim'].hidden, true);
  assert.equal(els['#mobile-quick-add-menu'].hidden, true);
  // The scrim sits outside #mobile-quick-add, so the existing outside-tap rule closes the menu, and it carries no
  // action or route, so the tap stops there.
  assert.match(fn('handleClick'), /const mobileQuickAdd = event\.target\.closest\('#mobile-quick-add'\);\n    if \(!mobileQuickAdd\) setMobileQuickAddOpen\(false\);/);
});

test('G2: the menu lines its icons up above the "+", labels as pills on the left, rising one after another', () => {
  const scrim = rule('.mobile-quick-add-scrim');
  for (const part of ['position: fixed', 'inset: 0', 'z-index: 85', 'background: rgba(5, 6, 8, .68)']) assert.ok(scrim.includes(part), part);
  assert.doesNotMatch(scrim, /blur/, 'Quiet Graphite has no blur (V1.8)');
  assert.match(rule('.mobile-quick-add-scrim[hidden]'), /display: none;/);
  assert.match(rule('.mobile-quick-add-option'), /flex-direction: row;/);
  assert.match(rule('.mobile-quick-add-option span'), /border-radius: 999px;/);
  assert.match(rule('.mobile-quick-add-option i'), /width: 44px; height: 44px;/);
  assert.match(layer, /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*\.mobile-quick-add-menu:not\(\[hidden\]\) \.mobile-quick-add-option \{ animation: quick-add-option-in [^}]+\}[\s\S]*\.mobile-quick-add-option:nth-last-child\(2\) \{ animation-delay: 30ms; \}/);
  assert.match(layer, /@keyframes quick-add-option-in \{ from \{ opacity: 0; transform: translateY\(8px\) scale\(\.96\); \} \}/);
  // The six entries keep their order and actions.
  assert.deepEqual([...index.matchAll(/class="mobile-quick-add-option" type="button" data-action="([^"]+)"(?: data-owner-type="([^"]+)")?/g)].map(match => match[2] || match[1]), ['quick-add', 'new-goal', 'new-habit', 'note', 'resource', 'new-project']);
});

test('R14 shipped as 2.0.0-alpha.35 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 35);
});

test('I5: Inbox chips are visible pills under the title and keep a 44 px touch height', () => {
  const inbox = rowModule()({ id: 'i', title: 'Check plugin update', dueDate: Core.addDays(TODAY, -1) })({ context: 'inbox', inbox: true });
  assert.match(inbox, /<div class="task-main"[^>]*><div class="task-title">Check plugin update<\/div><div class="task-meta"><due [^>]+><\/div><div class="quick-actions">/);
  assert.ok(endsWithCheckbox(inbox), 'the checkbox stays at the far right');
  const chip = rule('.task-row--today .quick-chip');
  for (const part of ['position: relative', 'isolation: isolate', 'min-height: 44px', 'font-size: 13px']) assert.ok(chip.includes(part), part);
  const pill = rule('.task-row--today .quick-chip::before');
  for (const part of ['inset: 6px 0', 'z-index: -1', 'border: 1px solid var(--line-2)', 'border-radius: 999px', 'background: var(--graphite-800)']) assert.ok(pill.includes(part), part);
});

test('the task window opens without the keyboard, and its title field always has a border', () => {
  const open = fn('openTaskDetail');
  assert.match(open, /requestAnimationFrame\(\(\) => \$\('#modal-root \[data-action="close-modal"\]'\)\?\.focus\(\)\);/);
  assert.doesNotMatch(open, /detail-title/);
  assert.match(rule('.task-window-title'), /border: 1px solid var\(--line-2\);/);
  assert.match(rule('.task-window-title:focus'), /border-color: var\(--blue-300\);/);
});
