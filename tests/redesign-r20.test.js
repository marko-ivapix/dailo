// Redesign R20: the second design audit, items 1–6 — sheets, chips, sticky footers, dates under the title, two bugs.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r20-sheets-chips.md
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
const layerStart = css.indexOf('/* Redesign R20');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};
const JS = ['js/app.js', 'js/areas-ui.js', 'js/goals-ui.js', 'js/habits-ui.js', 'js/saved-views-ui.js', 'js/knowledge.js', 'js/projects-ui.js'];

test('the R20 layer comes after R19', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R19'), 'appended after the R19 layer');
});

test('1: every option in a bottom sheet is 48 px tall with 15 px text', () => {
  const option = rule('.popover--sheet .popover-option');
  assert.match(option, /min-height: 48px;/);
  assert.match(option, /font-size: 15px;/);
});

test('2: a ⋯ menu is a sheet with the item\'s name as its title and the options in one card', () => {
  const ctx = withI18n({ esc });
  vm.createContext(ctx);
  vm.runInContext(fn('menuSheet'), ctx);
  assert.equal(ctx.menuSheet('Buy <milk>', '<button>x</button>'), '<div class="popover-title">Buy &lt;milk></div><div class="sheet-card sheet-menu"><button>x</button></div>');
  assert.match(fn('domainContext'), /\n      menuSheet,\n/);
  for (const [file, name] of [['js/app.js', 'openTaskMenu'], ['js/app.js', 'openTagMenu'], ['js/app.js', 'openAttachmentMenu'], ['js/areas-ui.js', 'openAreaMenu'], ['js/goals-ui.js', 'openGoalMenu'], ['js/habits-ui.js', 'openHabitMenu'], ['js/saved-views-ui.js', 'openMenu'], ['js/projects-ui.js', 'openProjectMenu']]) {
    const source = read(file);
    const start = source.search(new RegExp(`function ${name}\\(`));
    assert.ok(start >= 0, `${file} ${name}`);
    const body = source.slice(start, source.indexOf('\n  }\n', start));
    assert.match(body, /menuSheet\(/, `${name} builds its sheet with menuSheet`);
  }
  assert.match(read('js/knowledge.js'), /context\.openPopover\(el, context\.menuSheet\(/, 'the note and resource menu too');
});

test('2: delete rows use the danger class instead of an inline color', () => {
  for (const file of [...JS, 'js/settings-ui.js', 'js/templates-ui.js']) assert.doesNotMatch(read(file), /style="color:var\(--danger\)"/, file);
  assert.match(rule('.popover-option.is-danger'), /color: var\(--danger\);/);
  assert.match(rule('.sheet-menu .popover-separator'), /margin: 2px 8px;/);
  assert.match(fn('openTaskMenu'), /class="popover-option is-danger" type="button" data-pop-action="task-delete"/);
});

test('3: every chip is a pill inside its 44 px touch height, the selected one filled with the accent', () => {
  const chip = rule('.quick-chip');
  for (const part of ['position: relative', 'isolation: isolate', 'display: inline-flex', 'min-height: 44px', 'padding: 0 14px', 'border: 0', 'background: none', 'color: var(--ink-2)', 'font-size: 14px']) assert.ok(chip.includes(part), part);
  const pill = rule('.quick-chip::before');
  for (const part of ['inset: 4px 0', 'z-index: -1', 'border: 1px solid var(--line-2)', 'border-radius: 999px', 'background: var(--graphite-850)']) assert.ok(pill.includes(part), part);
  assert.match(rule('.quick-chip.is-selected'), /color: #fff;/);
  assert.match(rule('.quick-chip.is-selected::before'), /border-color: var\(--blue-600\); background: var\(--blue-600\);/);
  assert.match(rule('.quick-chip:disabled'), /opacity: \.5;/);
});

test('4: Inbox items that are not tasks line up with the task rows: no icon, the same pills', () => {
  const record = fn('renderInboxRecord');
  assert.doesNotMatch(record, /inbox-item-icon/);
  assert.match(rule('.inbox-item-row'), /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(rule('.inbox-item-chips'), /grid-column: 1 \/ -1;/);
  assert.match(rule('.inbox-item-chips .quick-chip::before'), /inset: 6px 0;[^}]*background: var\(--graphite-800\);/);
});

test('5: the Save button stays at the bottom of a long sheet or window', () => {
  const footer = rule(':is(.sheet-footer, .quick-sheet-footer)');
  for (const part of ['position: sticky', 'bottom: 0', 'z-index: 2', 'background: linear-gradient(to bottom, transparent, var(--graphite-850) 30%)']) assert.ok(footer.includes(part), part);
});

test('6: Redovne obaveze and step 3 of Nedeljni pregled put the date under the title', () => {
  const tasksUi = read('js/tasks-ui.js');
  assert.doesNotMatch(tasksUi, /task-side|sideHtml/);
  assert.match(tasksUi, /options\.metaText != null \? \[options\.metaLead, esc\(options\.metaText\)\]\.filter\(Boolean\)\.join\(' · '\)/);
  assert.match(app, /renderChoreRow\(task, options = \{\}\) \{ return taskRow\(task, 'cleaning', \{ today: true, metaText: options\.metaText, metaLead: options\.metaLead \}\); \},/);
  assert.match(read('js/cleaning-ui.js'), /ctx\.renderChoreRow\(task, \{ metaText, metaLead: task\.isCompleted \? '' : when\(task\) \}\)/);
  assert.match(rule('.review-day-row'), /display: grid; justify-items: start; gap: 2px;/);
});

test('6: the chore row reads the date first in the meta line and ends with its checkbox', () => {
  const ctx = {
    esc, getProject: () => null, getArea: () => null,
    Core: { dateOnly: () => '2026-10-11' }, todayDueLabel: () => '',
  };
  const source = read('js/tasks-ui.js');
  const render = new Function('tr', 'trn', 'msg', `${source.slice(source.indexOf('function renderTodayTaskRow'), source.indexOf('\n  function renderTaskRow'))}; return renderTodayTaskRow;`)(text => text, text => text, text => text);
  const html = render({ id: 'c', title: 'Bathroom', priority: 'none' }, 'cleaning', { metaText: 'Kupatilo · weekly', metaLead: '<span class="task-due is-today">Today</span>' }, ctx);
  assert.match(html, /<div class="task-meta"><span class="task-due is-today">Today<\/span> · Kupatilo · weekly<\/div>/);
  assert.match(html.trim(), /<\/button>\s*<\/article>$/);
});

test('7: "Prijavi se" in the phone app\'s transfer notice opens Nalog', () => {
  assert.match(fn('transferNotice'), /data-route="account">\$\{tr\('Sign in'\)\}/);
  assert.doesNotMatch(fn('transferNotice'), /data-route="settings"/);
});

test('8: "Iz šablona" is a chip under the window title, only when templates of that type exist', () => {
  const render = fn('renderModal');
  assert.doesNotMatch(render, /insertAdjacentHTML\('afterbegin',`<button class="btn btn-ghost" type="button" data-action="from-template"/);
  assert.match(render, /state\.templates\.some\(template => template\.type === modalState\.type\)/);
  assert.match(render, /\$\('\.modal-header', root\)\?\.insertAdjacentHTML\('afterend', `<div class="quick-template-row"><button class="quick-chip" type="button" data-action="from-template"><i class="ph ph-copy" aria-hidden="true"><\/i>\$\{tr\('From template'\)\}<\/button><\/div>`\)/);
});

test('R20 shipped as 2.0.0-alpha.43 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 43);
});
