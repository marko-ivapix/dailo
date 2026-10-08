const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('goal summary caps percent and exposes remaining linked work', () => {
  const summary = Core.goalProgressSummary(
    { progressMode: 'manual', progressType: 'numeric', currentValue: 12, targetValue: 10, taskIds: ['t1'] },
    { tasks: [{ id: 't1', isCompleted: false }], goals: [], habits: [] },
    {},
  );

  assert.equal(summary.percent, 100);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.linkedTasks.open, 1);
});

test('goal history projection sorts progress snapshots without mutating records', () => {
  const state = {
    goalHistory: [
      { id: 'later', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-16T12:00:00Z', data: { to: 80 } },
      { id: 'other', goalId: 'g2', type: 'progressChanged', createdAt: '2026-09-17T12:00:00Z', data: { to: 90 } },
      { id: 'first', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-15T12:00:00Z', data: { to: 40 } },
    ],
  };
  const before = structuredClone(state.goalHistory);

  assert.deepEqual(Core.goalProgressHistory({ id: 'g1' }, state, { start: '2026-09-15', end: '2026-09-16' }), [
    { id: 'first', date: '2026-09-15', percent: 40, type: 'progressChanged' },
    { id: 'later', date: '2026-09-16', percent: 80, type: 'progressChanged' },
  ]);
  assert.deepEqual(state.goalHistory, before);
});

test('goal history keeps same-day snapshots in timestamp order and honors its selected range', () => {
  const state = { goalHistory: [
    { id: 'a-later', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-17T18:00:00Z', data: { to: 80 } },
    { id: 'z-earlier', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-17T08:00:00Z', data: { to: 40 } },
    { id: 'prior', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-10T08:00:00Z', data: { to: 20 } },
  ] };

  assert.deepEqual(Core.goalProgressHistory({ id: 'g1' }, state, { start: '2026-09-17', end: '2026-09-17' }).map(snapshot => snapshot.id), ['z-earlier', 'a-later']);
});

test('Goal history modal exposes an accessible Week or Month range control', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
  const adapters = {};
  const window = { TodoDomainModules: { register: adapter => { adapters[adapter.name] = adapter; } } };
  runInNewContextWithI18n(fs.readFileSync(require.resolve('../js/goals-ui.js'), 'utf8'), { window, requestAnimationFrame: fn => fn() });
  const goal = { id: 'g1', title: 'Goal' };
  let renders = 0;
  const ctx = {
    Core: { ...Core, dateOnly: () => '2026-09-17' }, esc: String, getGoal: () => goal, getProject: () => null,
    modalFrame: value => value, modalState: { type: 'goal-history', goalId: 'g1', events: [{ id: 'old', goalId: 'g1', type: 'progressChanged', createdAt: '2026-08-01T08:00:00Z', data: { to: 10 } }] },
    renderModal: () => { renders++; }, $: () => null,
  };

  const html = adapters.goals.renderRoute({ type: 'modal', modalType: 'goal-history' }, ctx);
  assert.match(html, /<label[^>]*for="goal-history-range"[^>]*>History range/);
  assert.match(html, /data-goal-history-empty>No progress snapshots in this week\./);
  assert.equal(adapters.goals.handleInput({ type: 'change', target: { id: 'goal-history-range', value: 'month' } }, ctx), true);
  assert.equal(ctx.modalState.historyRange, 'month');
  assert.equal(renders, 1);
});
