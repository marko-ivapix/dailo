// R111: the third part of js/app.js moves into a module (plan part 2, "quick-add"). The Quick Add sheet lives in
// js/quick-add-ui.js: opening it, its markup (the title, the preview of what the title sets, the suggestions, the
// selectors, the template chip, a pasted list), its actions and typing, dictation and "Dodaj zadatak". The module takes
// the app's helpers from domainContext() and reads the live state and window through it (app.state, app.modalState,
// app.setModalState). app.js keeps a one-line openQuickAdd for its callers, and routeQuickAddContext, which belongs
// to the "+" button. Nothing changes for the user.
// Spec: docs/superpowers/specs/2026-10-16-r111-quick-add-module.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { APP_FILES, functionSource, contextKeys } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const MOVED = [
  'toggleDictation', 'setDictationState', 'stopDictation', 'openQuickAdd',
  'quickParsePreview', 'quickSuggestHtml', 'renderQuickModal', 'quickPlanLabel', 'quickPlace', 'quickTemplateRow', 'quickTemplateSummary', 'openQuickTemplatePicker', 'applyQuickTemplate', 'clearQuickTemplate',
  'createTask', 'addedMessage', 'syncQuickDraftFromDom', 'parseQuickAddTitle', 'keepInQuickTitle', 'applyQuickSuggestion', 'focusQuickTitleEnd', 'handlePaste', 'createPastedTasks', 'joinPastedLines',
];

function loadModule() {
  let adapter;
  const listeners = [];
  const frames = [];
  const sandbox = withI18n({
    window: { TodoDomainModules: { register: value => { adapter = value; } } },
    document: { addEventListener: (type, handler) => listeners.push({ type, handler }), querySelector: () => null },
    requestAnimationFrame: run => frames.push(run),
  });
  vm.runInNewContext(read('js/quick-add-ui.js'), sandbox);
  return { adapter, listeners, frames };
}

function world() {
  const calls = [];
  const live = { state: { tasks: [], tags: [], projects: [{ id: 'p1', name: 'Sajt' }], areas: [], templates: [], ui: {} }, modalState: null };
  const ctx = {
    get state() { return live.state; }, get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; },
    Core, esc, $: () => null, captureModalReturnFocus() {}, closePopover() {}, renderModal() { calls.push('renderModal'); }, render() { calls.push('render'); }, modalFrame: html => html,
    relativeDateLabel: date => date, durationLabel: minutes => `${minutes} min`, recurrenceLabel: () => 'repeat', getProject: id => live.state.projects.find(item => item.id === id), getArea: () => null, getTag: () => null, priorityLabel: value => value,
    openPopover() {}, uid: prefix => `${prefix}-1`, nowIso: () => '2026-10-16T10:00:00.000Z', copyTemplate: value => JSON.parse(JSON.stringify(value)),
    saveState() { calls.push('save'); return true; }, closeModal() { live.modalState = null; calls.push('close'); }, setToastMessage: message => calls.push(['toast', message]), setUndo() {},
    newTaskRecord: fields => fields, nextOrder: () => 0, syncTemplateEntityGoalLinks() {}, openTaskDetail() {}, lowerFirst: text => text, openProjectPicker() {}, openPlanPicker() {},
  };
  return { ctx, live, calls };
}

test('the Quick Add sheet left app.js for js/quick-add-ui.js; the "+" keeps its own context', () => {
  for (const name of MOVED) {
    assert.equal(functionSource(name).file, 'js/quick-add-ui.js', name);
    assert.doesNotMatch(app, new RegExp(`\\n  function ${name}\\(`), `${name} left app.js`);
  }
  for (const name of ['const SpeechRecognitionImpl', 'const DICTATION_ERRORS', 'let dictation', 'const QUICK_TEMPLATE_FIELDS']) assert.ok(!app.includes(`  ${name} `), `${name} left app.js`);
  assert.equal(functionSource('routeQuickAddContext').file, 'js/app.js', 'the "+" button decides where a new task goes');
  for (const action of ['quick-project-picker', 'quick-plan-picker', 'quick-template', 'quick-template-clear', 'quick-more-options', 'quick-keep', 'quick-suggest', 'quick-paste-tasks', 'quick-paste-one', 'create-task', 'create-task-continue', 'quick-dictate', 'quick-place', 'quick-template-pick']) {
    assert.ok(!app.includes(`action === '${action}'`), `app.js no longer handles ${action}`);
  }
  assert.ok(!app.includes("modalState?.type === 'quick' && target?.id === 'quick-title' && event.key === 'Enter'"), 'Enter in the title is the module\'s');
  assert.ok(!app.includes("document.addEventListener('paste', handlePaste);"), 'the paste listener is the module\'s');
  assert.doesNotMatch(fn('handleInput'), /modalState\?\.type === 'quick'/);
  assert.doesNotMatch(fn('renderModal'), /renderQuickModal/);
});

test('app.js keeps the glue: openQuickAdd, the dictation stop, the template and the draft', () => {
  // Straight to the Quick Add module: the other modules' handleAction expects a click (the smoke test found it).
  assert.match(app, /\n  \/\/ R111: [^\n]+\n(?:  \/\/ [^\n]+\n)*  const quickAddAction = \(action, payload = null\) => window\.TodoDomainModules\?\.getAdapters\(\)\.find\(adapter => adapter\.name === 'quick-add'\)\?\.handleAction\(action, payload, domainContext\(\)\);\n  const openQuickAdd = \(context = \{\}\) => quickAddAction\('quick-open', context\);\n/);
  assert.match(fn('closeModal'), /^  function closeModal\(\) \{\n    quickAddAction\('quick-stop-dictation'\);\n/);
  assert.match(fn('useTemplate'), /if \(template\.type === 'task'\) \{ openQuickAdd\(\); quickAddAction\('quick-template-apply', \{ templateId: template\.id \}\); renderModal\(\); return; \}/);
  assert.match(fn('openTemplatePicker'), /if\(modalState\.type==='quick'\)quickAddAction\('quick-sync-draft'\);/);
  assert.match(app, /\n      \/\/ R111: what js\/quick-add-ui\.js needs\.\n      getTag, lowerFirst, newTaskRecord, nextOrder, openTaskDetail, syncTemplateEntityGoalLinks, openProjectPicker,\n/);
});

test('the module registers as "quick-add" and takes only what the context gives', () => {
  const module = read('js/quick-add-ui.js');
  assert.match(module, /window\.TodoDomainModules\?\.register\(\{\n    name: 'quick-add',\n    attach,\n    renderRoute,\n    handleAction,\n    handleInput,\n  \}\);/);
  // R112: js/account-ui.js has a use() too and sorts first, so the lookup names the file.
  const taken = functionSource('use', ['js/quick-add-ui.js']).source.match(/\(\{ ([^}]+) \} = ctx\);/)[1].split(', ');
  assert.ok(taken.includes('openProjectPicker') && taken.length > 25, 'Quick Add\'s own helpers');
  const keys = contextKeys();
  for (const name of taken) assert.ok(keys.has(name), `domainContext gives ${name}`);
  // The live state and window are read through the context, never kept.
  // R111b: only a single dot is a property access; a spread (`...modalState`) is a bare name too.
  assert.doesNotMatch(module.replace(/\/\/[^\n]*/g, ''), /(?<![\w$'"])(?<![^.]\.)(state|modalState)\b(?!:)/, 'only app.state and app.modalState');
});

test('in the module: open, draw, type, Enter and paste work as before', () => {
  const { adapter, listeners, frames } = loadModule();
  const { ctx, live, calls } = world();
  adapter.attach(ctx);
  assert.deepEqual(listeners.map(item => item.type), ['paste']);
  assert.equal(adapter.handleAction('quick-open', { today: true }, ctx), true);
  assert.equal(live.modalState.type, 'quick');
  assert.equal(live.modalState.draft.plannedDate, Core.dateOnly());
  assert.deepEqual(calls, ['renderModal']);
  assert.equal(frames.length, 1, 'the title gets the focus after the frame');
  const html = adapter.renderRoute({ type: 'modal', modalType: 'quick' }, ctx);
  assert.match(html, /<input id="quick-title" class="quick-title-input" type="text" maxlength="500"/);
  assert.match(html, /data-action="create-task">Add task<\/button>/);
  assert.equal(adapter.renderRoute({ type: 'today' }, ctx), undefined, 'other routes are not the module\'s');
  const title = { id: 'quick-title', value: 'Ponuda +Sajt sutra' };
  assert.equal(adapter.handleInput({ type: 'input', target: title }, ctx), true);
  assert.equal(live.modalState.draft.title, 'Ponuda +Sajt sutra');
  assert.equal(adapter.handleInput({ type: 'change', target: title }, ctx), undefined, 'only typing updates the preview');
  let prevented = false;
  assert.equal(adapter.handleInput({ type: 'keydown', key: 'Enter', shiftKey: false, target: title, preventDefault() { prevented = true; } }, ctx), true);
  assert.equal(prevented, true);
  assert.equal(live.state.tasks.length, 1);
  assert.deepEqual([live.state.tasks[0].title, live.state.tasks[0].projectId, live.state.tasks[0].plannedDate], ['Ponuda', 'p1', Core.addDays(Core.dateOnly(), 1)]);
  assert.equal(live.modalState, null, 'Enter closes the sheet');
  assert.equal(adapter.handleAction('quick-stop-dictation', null, ctx), true);
  assert.equal(adapter.handleAction('quick-place', { target: { closest: () => ({ dataset: { place: 'inbox' } }) } }, ctx), undefined, 'without the sheet the place sheet does nothing');
  assert.equal(adapter.handleAction('some-other-action', null, ctx), undefined);
});

test('the module loads after js/drag-ui.js, is precached, the tests read it as part of the app, and the plan says so', () => {
  // R112: js/account-ui.js comes next, still before app.js.
  const html = read('index.html');
  assert.match(html, /<script src="js\/drag-ui\.js"><\/script>\n  <script src="js\/quick-add-ui\.js"><\/script>\n/);
  assert.ok(html.indexOf('src="js/quick-add-ui.js"') < html.indexOf('src="js/app.js"'));
  assert.match(read('sw.js'), /'js\/drag-ui\.js',\n  'js\/quick-add-ui\.js',\n/);
  assert.ok(APP_FILES.indexOf('js/quick-add-ui.js') === 2 && APP_FILES.at(-1) === 'js/app.js', APP_FILES.join());
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R111 \| [^\n]+ \| `js\/quick-add-ui\.js` \| `2\.0\.0-alpha\.140` \|/);
  // The R110 review: the general recipe names the optional entries too.
  assert.ok(plan.includes('`window.TodoDomainModules?.register({ name, renderRoute, handleAction, handleInput, attach })`'));
  assert.ok(plan.includes("or in a module's optional `attach(ctx)`"));
});

test('R111 shipped as 2.0.0-alpha.140 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 140) >= 140);
});
