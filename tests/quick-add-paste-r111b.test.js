// R111b: fixes from the review of R111. "Kao jedan zadatak" after a pasted list threw a ReferenceError in the Quick Add
// module, because one `modalState` (a spread, `...modalState.pasteLines`) was not read through the context; R111's
// check for bare names skipped it, since it took the spread's dots for a property access. The plan also said app.js
// calls a moved part through callDomainHook, where it asks the module by name (quickAddAction).
// Spec: docs/superpowers/specs/2026-10-16-r111-quick-add-module.md (section "R111b")
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function loadModule() {
  let adapter;
  const frames = [];
  const sandbox = withI18n({
    window: { TodoDomainModules: { register: value => { adapter = value; } } },
    document: { addEventListener() {}, querySelector: () => null },
    requestAnimationFrame: run => frames.push(run),
  });
  vm.runInNewContext(read('js/quick-add-ui.js'), sandbox);
  return adapter;
}

test('"Kao jedan zadatak" joins the pasted lines into the title in the module', () => {
  const adapter = loadModule();
  const calls = [];
  const live = { state: { tasks: [], tags: [], projects: [], areas: [], templates: [] }, modalState: { type: 'quick', draft: { title: 'Kupi', keepInTitle: [] }, pasteLines: ['mleko', 'hleb'] } };
  const focused = [];
  const ctx = {
    get state() { return live.state; }, get modalState() { return live.modalState; }, setModalState(value) { live.modalState = value; },
    Core, $: selector => (selector === '#quick-title' ? { value: live.modalState.draft.title, focus() { focused.push('title'); }, setSelectionRange() {} } : null),
    renderModal: () => calls.push('renderModal'),
  };
  assert.equal(adapter.handleAction('quick-paste-one', { target: { closest: () => ({ dataset: {} }) } }, ctx), true);
  assert.equal(live.modalState.draft.title, 'Kupi mleko hleb');
  assert.equal(live.modalState.pasteLines, null, 'the list panel closes');
  assert.deepEqual(calls, ['renderModal']);
  assert.deepEqual(focused, ['title']);
});

test('the module reads no bare state or modalState, a spread included', () => {
  const code = read('js/quick-add-ui.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /(?<![\w$'"])(?<![^.]\.)(state|modalState)\b(?!:)/);
});

test('the plan says app.js asks a moved part by name, not through callDomainHook', () => {
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.ok(!plan.includes("goes through `callDomainHook('handleAction', …)` with a named action"));
  assert.ok(!plan.includes("`openQuickAdd` as one line (`callDomainHook('handleAction', 'quick-open', context)`)"));
  assert.ok(plan.includes("asks that module's adapter by name with a named action (as `quickAddAction` does)"));
});

test('R111b shipped as 2.0.0-alpha.141 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 141) >= 141);
});
