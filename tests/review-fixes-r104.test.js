// R104: fixes from the reviews of R83–R103. Sync keeps applying what arrives when a note (or a resource or task) has
// no link fields: pruning no longer leaves an empty key that the V3 check refuses. A mailto link with a stray "%" no
// longer breaks its note's window. On a habit with an upper limit, Poništi after a quick value and "Poništi
// preskakanje" leave an empty day empty instead of a kept one. Enter while a word is still being composed does not run
// the palette or save the day's note. The archived tasks that arrive through sync are normalized with the live ones
// before anything changes, and a pulled day's note is one short line. A sync paused because the archive could not be
// read says so in Nalog and on the tab's dot.
// Spec: docs/superpowers/specs/2026-10-15-r104-review-fixes.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const NOW = '2026-10-15T10:00:00.000Z';

test('pruning keeps a missing link field missing, so a pulled state with older notes still passes the V3 check', () => {
  const state = {
    version: 3, tags: [], areas: [], goals: [], habits: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {},
    projects: [{ id: 'p1', name: 'P', createdAt: NOW, updatedAt: NOW }],
    tasks: [{ id: 't1', title: 'Older task', isCompleted: false, createdAt: NOW, updatedAt: NOW }],
    notes: [
      { id: 'n1', title: 'Older note', body: '', areaId: null, linkUrls: [], attachmentIds: [], tagIds: [], createdAt: NOW, updatedAt: NOW },
      { id: 'n2', title: 'Linked note', body: '', relatedProjectIds: ['p1', 'gone'], relatedGoalIds: ['gone'], createdAt: NOW, updatedAt: NOW },
    ],
    resources: [{ id: 'r1', title: 'Older resource', type: 'link', url: 'https://example.com', createdAt: NOW, updatedAt: NOW }],
  };
  const pruned = Core.pruneDanglingReferences(state);
  for (const [item, field] of [[pruned.notes[0], 'relatedProjectIds'], [pruned.notes[0], 'relatedGoalIds'], [pruned.resources[0], 'relatedTaskIds'], [pruned.resources[0], 'relatedHabitIds'], [pruned.tasks[0], 'goalIds']]) {
    assert.equal(Object.hasOwn(item, field), false, field);
  }
  assert.deepEqual([pruned.notes[1].relatedProjectIds, pruned.notes[1].relatedGoalIds], [['p1'], []], 'links that exist stay, the others go');
  const migrated = Core.migrateStateV3(Core.settleArrivedReminders(state, pruned, NOW));
  assert.equal(migrated.ok, true, migrated.reason);
});

test('a mailto link with a stray "%" still draws its card; a valid escape is still read', () => {
  const ctx = vm.createContext({ URL });
  vm.runInContext(functionSource('linkHtml', ['js/knowledge.js']).source, ctx);
  assert.match(ctx.linkHtml({ esc }, 'mailto:50%off@example.com'), /<strong>50%off@example\.com<\/strong>/);
  assert.match(ctx.linkHtml({ esc }, 'mailto:ana%2Bposao@example.com'), /<strong>ana\+posao@example\.com<\/strong>/);
});

function habitsModule() {
  let adapter;
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  return adapter;
}
function habitScreen(logs) {
  const today = Core.dateOnly();
  const calls = [];
  const habits = [
    { id: 'c', name: 'Coffee', status: 'active', trackingType: 'numeric', targetMode: 'atMost', targetValue: 2, unit: '', frequencyType: 'daily', startDate: '2026-01-01', quickValues: [1] },
    { id: 'm', name: 'Meditate', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' },
  ];
  const ctx = {
    calls, Core, esc, state: { habits, habitLogCache: logs(today), settings: { weekStartsOn: 'monday' }, ui: {} },
    getHabit: id => habits.find(habit => habit.id === id),
    setHabitLog: (...args) => { calls.push(['log', ...args]); return Promise.resolve(true); },
    setUndo: (label, undo) => calls.push(['undo', undo]),
    closePopover: () => calls.push(['close']),
  };
  const module = habitsModule();
  const act = (action, dataset) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
  return { ctx, act, today };
}

test('a habit with an upper limit: Poništi after a quick value, and "Poništi preskakanje", leave an empty day empty', async () => {
  const empty = habitScreen(() => ({ c: [], m: [] }));
  empty.act('habit-quick-value', { habitId: 'c', value: '1' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(empty.ctx.calls[0], ['log', 'c', empty.today, 'done', 1]);
  const undo = empty.ctx.calls.find(call => call[0] === 'undo')[1];
  undo();
  assert.deepEqual(empty.ctx.calls.at(-1), ['log', 'c', empty.today, null], 'no value before: the day is emptied, not kept at 0');
  const valued = habitScreen(today => ({ c: [{ id: `c:${today}`, habitId: 'c', date: today, status: 'done', value: 1 }], m: [] }));
  valued.act('habit-quick-value', { habitId: 'c', value: '1' });
  await new Promise(resolve => setImmediate(resolve));
  valued.ctx.calls.find(call => call[0] === 'undo')[1]();
  assert.deepEqual(valued.ctx.calls.at(-1), ['log', 'c', valued.today, 'done', 1], 'a value before comes back');
  const skipped = habitScreen(today => ({ c: [{ id: `c:${today}`, habitId: 'c', date: today, status: 'skipped', value: null }], m: [{ id: `m:${today}`, habitId: 'm', date: today, status: 'skipped', value: null }] }));
  skipped.act('habit-today-skip', { habitId: 'c', date: skipped.today });
  assert.deepEqual(skipped.ctx.calls.at(-1), ['log', 'c', skipped.today, null], 'a number habit: the skipped day becomes empty');
  skipped.act('habit-today-skip', { habitId: 'm', date: skipped.today });
  assert.deepEqual(skipped.ctx.calls.at(-1), ['log', 'm', skipped.today, 'missed'], 'a yes/no habit keeps R61');
});

test('Enter while a word is being composed neither runs the palette nor saves the day\'s note', () => {
  let palette;
  runInNewContextWithI18n(read('js/palette-ui.js'), { window: { TodoDomainModules: { register: value => { palette = value; } } }, requestAnimationFrame: run => run() });
  const calls = [];
  const ctx = { modalState: { type: 'palette', query: '', selected: 0 }, closeModal: () => calls.push('close'), openQuickAdd: () => calls.push('new-task'), Core, esc, $: () => null };
  const enter = isComposing => palette.handleInput({ type: 'keydown', key: 'Enter', isComposing, target: { id: 'palette-query' }, preventDefault() {} }, ctx);
  assert.equal(enter(true), false);
  assert.deepEqual(calls, []);
  enter(false);
  assert.deepEqual(calls, ['close', 'new-task']);
  const habits = habitsModule();
  let saved = 0;
  const noteCtx = { popoverEl: { querySelector: () => ({ click: () => { saved += 1; } }) } };
  const key = isComposing => habits.handleInput({ type: 'keydown', key: 'Enter', isComposing, target: { id: 'habit-log-note' }, preventDefault() {} }, noteCtx);
  assert.equal(key(true), false);
  assert.equal(saved, 0);
  key(false);
  assert.equal(saved, 1);
});

test('the archived tasks that arrive are normalized with the live ones before anything changes', () => {
  const at = date => new Date(`${date}T12:00:00`).toISOString();
  const archived = { id: 'a', title: 'a', isCompleted: true, completedAt: at('2026-03-01'), projectId: null, areaId: null, tagIds: 'x', goalIds: [], attachmentIds: [], subtasks: [], createdAt: at('2026-01-01'), updatedAt: at('2026-03-01') };
  assert.deepEqual(JSON.parse(JSON.stringify(Core.pruneArchivedTask(archived, { tags: [], areas: [] }))).tagIds, [], 'a list that is not a list reads as empty');
  const apply = functionSource('applySyncResult').source;
  assert.match(apply, /const archivedIds = new Set\(split\.archived\.map\(item => item\.id\)\);/);
  assert.match(apply, /const arrived = split\.archived\.map\(item => Core\.pruneArchivedTask\(item, result\.state\)\);/);
  assert.match(apply, /const merged = normalizeState\(Core\.settleArrivedReminders\(withArchive\(previous\), Core\.pruneDanglingReferences\(\{ \.\.\.result\.state, tasks: \[\.\.\.split\.live, \.\.\.arrived\] \}\), nowIso\(\)\)\);\n\s+state = \{ \.\.\.merged, tasks: merged\.tasks\.filter\(item => !archivedIds\.has\(item\.id\)\) \};\n\s+archivedTasks = merged\.tasks\.filter\(item => archivedIds\.has\(item\.id\)\);/);
  assert.match(apply, /for \(const log of result\.habitLogPuts\) await TodoStorage\.habitLogs\.put\(Object\.hasOwn\(log, 'note'\) \? \{ \.\.\.log, note: Core\.habitLogNote\(log\.note\) \} : log\);/);
});

test('a sync paused because the archive could not be read says so in Nalog and on the tab\'s dot', () => {
  const view = { configured: true, signedIn: true, running: false, lastSyncAt: NOW, lastError: '', archiveError: true, email: 'a@b.c' };
  const ctx = withI18n({ syncView: () => view, globalThis: { navigator: { onLine: true } }, I18n: { locale: () => 'sr-Latn' } });
  vm.createContext(ctx);
  vm.runInContext(functionSource('syncStatus').source, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.syncStatus())), { state: 'error', text: 'Sync failed — see Account.' });
  view.archiveError = false;
  assert.equal(ctx.syncStatus().state, 'ok');
  assert.match(functionSource('syncView').source, /archiveError: archiveFailed/);
  assert.match(read('js/settings-ui.js'), /\$\{sync\.archiveError \? `<br><span class="validation" role="alert">\$\{tr\('Sync is paused: the archived tasks could not be read\. Restart the app\.'\)\}<\/span>` : ''\}/);
  assert.ok(read('js/i18n-sr.js').includes('"Sync is paused: the archived tasks could not be read. Restart the app.": "Sinhronizacija je zaustavljena: arhivirani zadaci nisu mogli da se učitaju. Ponovo pokreni aplikaciju."'));
});

test('R104 is released as 2.0.0-alpha.133', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.133');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.133';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.133');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual([lock.version, lock.packages[''].version], ['2.0.0-alpha.133', '2.0.0-alpha.133']);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs/superpowers/specs/2026-10-15-r104-review-fixes.md')));
});
