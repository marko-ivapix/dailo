const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = require('../js/core.js');
const appSource = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');

function functionSource(name, nextName) {
  return appSource.slice(appSource.indexOf(`  ${name}`), appSource.indexOf(`  ${nextName}`));
}

function habitApp({ saveResults = [true], refresh = async () => {} } = {}) {
  const habit = {
    id: 'habit', name: 'Habit', status: 'active', trackingType: 'checkbox',
    frequencyType: 'daily', startDate: '2026-09-01', updatedAt: 'before',
  };
  const records = new Map();
  const errors = [];
  let saves = 0;
  const ctx = {
    Core: { ...Core, dateOnly: () => '2026-09-22' },
    state: { habits: [habit], goals: [], settings: {}, habitLogCache: {} },
    TodoStorage: {
      habitLogs: {
        async put(record) { records.set(record.id, structuredClone(record)); },
        async deleteMany(ids) { ids.forEach(id => records.delete(id)); },
      },
    },
    getHabit: id => id === habit.id ? habit : null,
    captureGoalProgress: () => new Map(),
    evaluateGoalProgressChanges() {},
    evaluateHabitBoundaries: async () => {},
    refreshHabitMetrics: refresh,
    saveState: () => saveResults[Math.min(saves++, saveResults.length - 1)],
    reportStorageFailure: error => errors.push(error),
    render() {},
    nowIso: () => '2026-09-22T12:00:00.000Z',
    structuredClone,
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource('async function setHabitLog(', 'async function evaluateHabitBoundaries('), ctx);
  return { ctx, habit, records, errors, get saves() { return saves; } };
}

test('habit check-in does not mutate IndexedDB when canonical save is stale', async () => {
  const app = habitApp({ saveResults: [false] });

  const result = await app.ctx.setHabitLog('habit', '2026-09-22');

  assert.equal(result, null);
  assert.equal(app.records.size, 0);
  assert.equal(app.habit.updatedAt, 'before');
  assert.equal(app.saves, 1);
});

test('habit check-in rolls native log and metadata back when the native transaction fails', async () => {
  let refreshCalls = 0;
  const app = habitApp({
    saveResults: [true, true],
    refresh: async () => { if (++refreshCalls === 1) throw new Error('metrics failed'); },
  });

  const result = await app.ctx.setHabitLog('habit', '2026-09-22');

  assert.equal(result, null);
  assert.equal(app.records.size, 0);
  assert.equal(app.habit.updatedAt, 'before');
  assert.equal(app.saves, 2);
  assert.equal(app.errors.length, 1);
});

test('mobile More sheet suppresses global shortcuts behind its modal overlay', () => {
  let searches = 0;
  const ctx = {
    globalOperation: null, mobileMoreOpen: true, modalState: null, popoverEl: null,
    goalPropertyEditor: null, habitPropertyEditor: null,
    state: { settings: { shortcuts: { search: 'Ctrl/Cmd+K' } } },
    SHORTCUT_DEFAULTS: { search: 'Ctrl/Cmd+K' }, Core,
    handleAreaTabKeydown: () => false, trapMobileMoreFocus() {}, trapPopoverFocus() {},
    callDomainHook: () => undefined, openSearch: () => { searches++; }, openQuickAdd() {}, navigate() {},
    $: () => null,
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource('function handleKeydown(', 'function handleAreaTabKeydown('), ctx);
  const event = {
    key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    repeat: false, isComposing: false, preventDefault() {},
    target: { closest: () => null, isContentEditable: false },
  };

  ctx.handleKeydown(event);

  assert.equal(searches, 0);
});
