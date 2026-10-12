// R59: the floating "+" adds what the screen is about. On the task screens (Danas, Inbox, Zadaci, Kalendar, a
// project, an area, a tag) it opens a new task there at once; Navike, Ciljevi, Oblasti, Redovne obaveze, Beleške,
// Oznake and the others already add their own item. Holding the "+" opens the menu with every type instead.
// Spec: docs/superpowers/specs/2026-10-12-r59-plus-per-screen.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const line = name => { const match = app.match(new RegExp(`\\n  const ${name} = [^\\n]+\\n`)); assert.ok(match, name); return match[0]; };

function harness(hash, { wide = false } = {}) {
  const calls = [];
  const type = hash.replace(/^#/, '').split('/')[0] || 'today';
  const id = hash.includes('/') ? hash.split('/')[1] : undefined;
  const context = {
    location: { hash }, state: {}, msg: text => text, tr: text => text, Object, Set,
    currentRoute: () => ({ type, id }),
    routeQuickAddContext: () => ({ route: type, id }),
    openQuickAdd: ctx => calls.push(['quick-add', ctx]), setToastMessage: text => calls.push(['toast', text]),
    openGoalModal: () => calls.push(['goal']), openHabitModal: () => calls.push(['habit']), openKnowledgeWindow: kind => calls.push([kind]), openTagModal: () => calls.push(['tag']),
    callDomainHook: (hook, action) => calls.push([action]), $: () => null,
    globalThis: { matchMedia: () => ({ matches: wide }) },
  };
  vm.createContext(context);
  vm.runInContext(['QUICK_ADD_DIRECT', 'TASK_SCREENS', 'NEW_TASK_HERE', 'DESKTOP_NEW_TASK', 'wideScreen', 'quickAddDirect'].map(line).join('') + '\nthis.quickAddDirect = quickAddDirect;', context);
  return { direct: () => context.quickAddDirect(), calls };
}

test('on every task screen the "+" opens a new task there, with that screen\'s context', () => {
  for (const hash of ['', '#today', '#inbox', '#tasks', '#calendar', '#project/p1', '#project/none', '#area/a1', '#tag/t1']) {
    const h = harness(hash);
    const direct = h.direct();
    assert.ok(direct, `${hash || '(start)'} adds directly`);
    assert.equal(direct[0], 'New task', hash);
    direct[1]();
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [['quick-add', { route: (hash.replace(/^#/, '').split('/')[0] || 'today'), ...(hash.includes('/') ? { id: hash.split('/')[1] } : {}) }]], hash);
  }
});

test('the other screens keep their own item; screens without one keep the menu', () => {
  assert.equal(harness('#habits').direct()[0], 'New habit');
  assert.equal(harness('#goals').direct()[0], 'New goal');
  assert.equal(harness('#areas').direct()[0], 'New area');
  assert.equal(harness('#cleaning').direct()[0], 'New recurring task');
  assert.equal(harness('#notes').direct()[0], 'New note');
  assert.equal(harness('#tags').direct()[0], 'New tag');
  for (const hash of ['#more', '#settings', '#account', '#review', '#completed', '#archived']) assert.equal(harness(hash).direct(), null, `${hash} keeps the menu`);
  assert.equal(harness('#more', { wide: true }).direct()[0], 'New task', 'a wide screen never opens the menu (R47a)');
});

test('a tag screen files the new task with that tag', () => {
  assert.match(functionSource('routeQuickAddContext').source, /if \(route\.type === 'tag'\) return getTag\(route\.id\) \? \{ tagIds: \[route\.id\] \} : \{\};/);
  assert.match(functionSource('openQuickAdd').source, /tagIds: \[\.\.\.\(context\.tagIds \|\| \[\]\)\], priority: 'none'/);
});

test('holding the "+" opens the menu where a tap adds directly; a tap on the open menu\'s "+" closes it', () => {
  assert.match(functionSource('runLongPress').source, /if \(el\.dataset\.longPress === 'quick-add-task'\) \{ haptic\('tick'\); if \(quickAddDirect\(\)\) \{ setMobileQuickAddOpen\(true\); return; \}/);
  assert.match(app, /if \(action === 'toggle-mobile-quick-add'\) \{ if \(el\.getAttribute\('aria-expanded'\) === 'true'\) \{ setMobileQuickAddOpen\(false\); return; \} const direct = quickAddDirect\(\);/);
  assert.match(read('index.html'), /data-long-press="quick-add-task"/);
});

test('R59 shipped as 2.0.0-alpha.86 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 86);
});
