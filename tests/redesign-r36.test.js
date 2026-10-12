// Redesign R36: the third design pass, additions C, G and K (capture and triage).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r36-capture.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const css = read('css/styles.css');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];
const plain = value => JSON.parse(JSON.stringify(value));
const TODAY = Core.dateOnly();

test('C: Quick Add has "Dodaj i nastavi" beside "Dodaj zadatak"', () => {
  const quick = fn('renderQuickModal');
  assert.match(quick, /<button class="btn btn-secondary quick-add-continue" type="button" data-action="create-task-continue">\$\{tr\('Add and continue'\)\}<\/button><button class="btn btn-primary quick-add-button" type="button" data-action="create-task">/);
  assert.match(app, /else if \(action === 'create-task-continue'\) createTask\(true\);/);
  assert.ok(sr.includes('"Add and continue": "Dodaj i nastavi"'));
});

test('C: a new task says where it went, and "Otvori" opens it', () => {
  const ctx = withI18n({ I18n, Core, getProject: id => (id === 'p' ? { name: 'Selidba' } : null), relativeDateLabel: date => (date === Core.addDays(TODAY, 1) ? 'Sutra' : `R(${date})`) });
  vm.createContext(ctx);
  vm.runInContext(`${constLine('lowerFirst')}\n${fn('addedMessage')}`, ctx);
  assert.equal(ctx.addedMessage({ isInbox: true }), 'Added to Inbox');
  assert.equal(ctx.addedMessage({ plannedDate: TODAY }), 'Added to Today');
  assert.equal(ctx.addedMessage({ plannedDate: Core.addDays(TODAY, 1) }), 'Added for sutra');
  assert.equal(ctx.addedMessage({ projectId: 'p' }), 'Added to Selidba');
  assert.equal(ctx.addedMessage({}), 'Added to Anytime');
  assert.match(fn('createTask'), /setToastMessage\(addedMessage\(task\), \{ label: msg\('Open it'\), taskId: task\.id \}\);/);
  assert.match(fn('renderToast'), /toastLink \? `<button class="toast-action" type="button" data-action="toast-open-task" data-task-id="\$\{esc\(toastLink\.taskId\)\}">\$\{esc\(tr\(toastLink\.label\)\)\}<\/button>` : ''/);
  assert.match(app, /else if \(action === 'toast-open-task'\) \{ const id = el\.dataset\.taskId; setToastMessage\(null\); openTaskDetail\(id\); \}/);
  for (const [en, value] of [['Added to Inbox', 'Dodato u Inbox'], ['Added for {date}', 'Dodato za {date}'], ['Added to {place}', 'Dodato u {place}'], ['Added to Anytime', 'Dodato u Kad stignem'], ['Open it', 'Otvori']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('C: Inbox has its own add row; Enter files the title in Inbox and keeps the row ready', () => {
  assert.match(fn('renderInbox'), /const addRow = `<div class="inbox-add"><input id="inbox-add-title" class="input" type="text" maxlength="500" autocomplete="off" enterkeyhint="done" placeholder="\$\{tr\('Add to Inbox…'\)\}" aria-label="\$\{tr\('Add to Inbox'\)\}"><button class="btn-icon" type="button" data-action="inbox-add" aria-label="\$\{tr\('Add'\)\}"><i class="ph ph-plus" aria-hidden="true"><\/i><\/button><\/div>`;/);
  const calls = [];
  const ctx = withI18n({
    Core, state: { tasks: [] }, calls, nowIso: () => '2026-10-12T08:00:00.000Z', uid: kind => `${kind}-${calls.length}`, nextOrder: () => 4,
    parseQuickAddTitle: (title, plan) => ({ title: title.replace(' #kuca', ''), tagIds: title.includes('#kuca') ? ['t'] : [], priority: null, plan }),
    saveState: () => calls.push(['save']), render: () => calls.push(['render']), requestAnimationFrame: run => run(), $: () => ({ focus: () => calls.push(['focus']) }),
  });
  vm.createContext(ctx);
  vm.runInContext(`${fn('newTaskRecord')}\n${fn('addToInbox')}`, ctx);
  assert.equal(ctx.addToInbox('   '), false);
  assert.equal(ctx.addToInbox('Mleko #kuca'), true);
  const task = ctx.state.tasks[0];
  assert.deepEqual([task.title, task.isInbox, task.inboxOrder, plain(task.tagIds), task.plannedDate, task.priority], ['Mleko', true, 4, ['t'], null, 'none']);
  assert.deepEqual(calls.map(call => call[0]), ['save', 'render', 'focus']);
  assert.match(app, /if \(event\.key === 'Enter' && event\.target\.id === 'inbox-add-title'\) \{ event\.preventDefault\(\); addToInbox\(event\.target\.value\); return; \}/);
});

test('C: holding the "+" opens a new task at once', () => {
  assert.match(read('index.html'), /<button id="mobile-quick-add-toggle" class="mobile-quick-add-toggle" type="button" data-action="toggle-mobile-quick-add" data-long-press="quick-add-task"/);
  // R59: where a tap on the "+" already adds directly, holding it opens the menu instead (tests/plus-r59.test.js).
  assert.match(fn('runLongPress'), /if \(el\.dataset\.longPress === 'quick-add-task'\) \{ haptic\('tick'\); if \(quickAddDirect\(\)\) \{ setMobileQuickAddOpen\(true\); return; \} setMobileQuickAddOpen\(false\); const context = routeQuickAddContext\(\); if \(context\) openQuickAdd\(context\); else setToastMessage\(tr\('Restore the project to add tasks\.'\)\); return; \}/);
});

test('G: triage offers "Datum…" and "Otvori" for a task', () => {
  const triage = fn('renderInboxTriage');
  assert.match(triage, /\['inbox-today', 'inbox-tomorrow', 'inbox-anytime', 'inbox-date', 'inbox-project'\]\.map\(\(action, index\) => button\(action, \[tr\('Today'\), tr\('Tomorrow'\), tr\('Anytime'\), tr\('Date…'\), tr\('Project…'\)\]\[index\], `data-task-id="\$\{esc\(id\)\}"`\)\)\.join\(''\) \+ button\('inbox-triage-open', tr\('Open it'\), attrs\)/);
  assert.match(app, /else if \(action === 'inbox-date'\) openPlanPicker\(el, \{ type: 'task', taskId: el\.dataset\.taskId \}\);/);
  assert.ok(sr.includes('"Date…": "Datum…"'));
});

test('G: the date sheet offers "Večeras" (before 20:00) and "Vikend"; the reminder sheet offers "Za 1 h"', () => {
  assert.equal(Core.weekendDate('2026-10-12'), '2026-10-17', 'Monday → Saturday');
  assert.equal(Core.weekendDate('2026-10-17'), '2026-10-17', 'Saturday → today');
  assert.equal(Core.weekendDate('2026-10-18'), '2026-10-24', 'Sunday → next Saturday');
  const sheet = fn('dateSheetHtml');
  assert.match(sheet, /const evening = kind === 'plan' && new Date\(\)\.getHours\(\) < 20 \? \[\[tr\('Tonight'\), today, '20:00'\]\] : \[\];/);
  assert.match(sheet, /: \[\[tr\('Today'\), today\], \.\.\.evening, \[tr\('Tomorrow'\), Core\.addDays\(today, 1\)\], \[tr\('Weekend'\), Core\.weekendDate\(today\)\], \[tr\('Start of next week'\), nextMonday\(today\)\]\];/);
  assert.match(sheet, /data-date="\$\{value\}"\$\{at \? ` data-time="\$\{at\}"` : ''\}/);
  assert.match(app, /dateSheet\.date = button\.dataset\.date;\n\s+if \(button\.dataset\.time\) dateSheet\.time = button\.dataset\.time;/);
  assert.match(fn('openReminderPicker'), /const soon = parts\(Math\.ceil\(\(Date\.now\(\) \+ 3600000\) \/ 300000\) \* 300000\);/);
  assert.match(fn('openReminderPicker'), /presets = \[\[tr\('In 1 hour'\), soon\], \.\.\.presets\]/);
  for (const [en, value] of [['Tonight', 'Večeras'], ['Weekend', 'Vikend'], ['In 1 hour', 'Za 1 h']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('K: a one-time hint on Danas explains the gestures on touch screens', () => {
  const storage = {};
  const ctx = withI18n({ I18n, localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; } }, nowIso: () => 'now', window: { matchMedia: () => ({ matches: true }) } });
  vm.createContext(ctx);
  vm.runInContext(`${fn('gestureHint')}\n${fn('dismissGestureHint')}`, ctx);
  assert.match(ctx.gestureHint(true), /<section class="gesture-hint" role="note"><i class="ph ph-hand-swipe-right gesture-hint-icon" aria-hidden="true"><\/i><p>Swipe a task right to complete it, left to pick its date\. Hold a row, then drag it to change the order\.<\/p><button class="btn btn-secondary" type="button" data-action="dismiss-gesture-hint">OK<\/button><\/section>/);
  assert.equal(ctx.gestureHint(false), '', 'only while Danas shows tasks');
  ctx.dismissGestureHint();
  assert.equal(storage.dailoGestureHint, 'now');
  assert.equal(ctx.gestureHint(true), '');
  ctx.window.matchMedia = () => ({ matches: false });
  delete storage.dailoGestureHint;
  assert.equal(ctx.gestureHint(true), '', 'not with a mouse');
  assert.match(fn('renderToday'), /html \+= gestureHint\(overdueRows\.length \+ plannedRows\.length > 0\);/);
  assert.ok(css.includes('.gesture-hint {'));
  assert.ok(sr.includes('"OK": "U redu"'));
});

test('R36 shipped as 2.0.0-alpha.62 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 62);
});
