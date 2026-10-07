const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const Core = require('../js/core.js');
const appSource = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');

function functionSource(name, nextName) {
  return appSource.slice(appSource.indexOf(`  ${name}`), appSource.indexOf(`  ${nextName}`));
}

function habitApp({ saveResults = [true], refresh = async () => {}, afterSave = null, afterPut = null, afterGet = null, beforeDelete = null } = {}) {
  const habit = {
    id: 'habit', name: 'Habit', status: 'active', trackingType: 'checkbox',
    frequencyType: 'daily', startDate: '2026-09-01', updatedAt: 'before',
  };
  const records = new Map();
  const errors = [];
  let saves = 0;
  let raw = 'owned';
  const ctx = {
    Core: { ...Core, dateOnly: () => '2026-09-22' },
    state: { habits: [habit], goals: [], settings: {}, habitLogCache: {} },
    TodoStorage: {
      habitLogs: {
        async put(record) { records.set(record.id, structuredClone(record)); await afterPut?.({ record, records, setRaw: value => { raw = value; } }); },
        async putIfCurrent(record, expected) {
          assert.deepEqual(records.get(record.id) || null, expected || null);
          records.set(record.id, structuredClone(record));
          await afterPut?.({ record, records, setRaw: value => { raw = value; } });
        },
        async get(id) {
          const result = structuredClone(records.get(id));
          await afterGet?.({ id, records });
          return result;
        },
        async deleteIfCurrent(id, expected) {
          await beforeDelete?.({ id, expected, records });
          if (JSON.stringify(records.get(id) || null) !== JSON.stringify(expected)) throw new Error('Habit log changed in another context.');
          records.delete(id);
        },
        async deleteMany(ids) { ids.forEach(id => records.delete(id)); },
      },
    },
    getHabit: id => id === habit.id ? habit : null,
    captureGoalProgress: () => new Map(),
    evaluateGoalProgressChanges() {},
    evaluateHabitBoundaries: async () => {},
    refreshHabitMetrics: refresh,
    saveState: () => {
      const result = saveResults[Math.min(saves++, saveResults.length - 1)];
      afterSave?.({ result, saves, setRaw: value => { raw = value; } });
      return result;
    },
    reportStorageFailure: error => errors.push(error),
    render() {},
    nowIso: () => '2026-09-22T12:00:00.000Z',
    canonicalRaw: 'owned', localStorage: { getItem: () => raw }, STORAGE_KEY: 'todoAppData',
    structuredClone,
  };
  vm.createContext(withI18n(ctx));
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

test('habit check-in stops before IndexedDB when another tab takes canonical ownership after pre-save', async () => {
  const app = habitApp({ afterSave: ({ saves, setRaw }) => { if (saves === 1) setRaw('newer-tab'); } });

  const result = await app.ctx.setHabitLog('habit', '2026-09-22');

  assert.equal(result, null);
  assert.equal(app.records.size, 0);
  assert.equal(app.habit.updatedAt, 'before');
});

test('stale habit rollback never overwrites a newer competing native log', async () => {
  const competing = { id: 'habit:2026-09-22', habitId: 'habit', date: '2026-09-22', status: 'missed', value: null, createdAt: 'competitor', updatedAt: 'competitor' };
  const app = habitApp({
    afterPut: async ({ record, records, setRaw }) => {
      setRaw('newer-tab');
      records.set(record.id, structuredClone(competing));
    },
  });

  const result = await app.ctx.setHabitLog('habit', '2026-09-22');

  assert.equal(result, null);
  assert.deepEqual(app.records.get(competing.id), competing);
  assert.equal(app.habit.updatedAt, 'before');
});

test('Habit rollback atomically preserves a competing log written between read and delete', async () => {
  const competing = { id: 'habit:2026-09-22', habitId: 'habit', date: '2026-09-22', status: 'missed', value: null, createdAt: 'competitor', updatedAt: 'competitor' };
  const installCompeting = ({ records }) => records.set(competing.id, structuredClone(competing));
  let refreshCalls = 0;
  const app = habitApp({
    refresh: async () => { if (++refreshCalls === 1) throw new Error('metrics failed'); },
    afterGet: installCompeting,
    beforeDelete: installCompeting,
  });

  const result = await app.ctx.setHabitLog('habit', '2026-09-22');

  assert.equal(result, null);
  assert.deepEqual(app.records.get(competing.id), competing);
  assert.equal(app.habit.updatedAt, 'before');
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
  vm.createContext(withI18n(ctx));
  vm.runInContext(functionSource('function handleKeydown(', 'function handleAreaTabKeydown('), ctx);
  const event = {
    key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    repeat: false, isComposing: false, preventDefault() {},
    target: { closest: () => null, isContentEditable: false },
  };

  ctx.handleKeydown(event);

  assert.equal(searches, 0);
});
