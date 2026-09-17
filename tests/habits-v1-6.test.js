const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = require('../js/core.js');

test('daily analytics summarizes eligible completions and excludes future cells', () => {
  const habit = { id: 'daily', frequencyType: 'daily', startDate: '2026-09-14' };
  const logs = [
    { habitId: 'daily', date: '2026-09-14', status: 'done' },
    { habitId: 'daily', date: '2026-09-15', status: 'done' },
    { habitId: 'daily', date: '2026-09-16', status: 'missed' },
    { habitId: 'daily', date: '2026-09-18', status: 'done' },
  ];

  const analytics = Core.habitAnalytics(habit, logs, {
    today: '2026-09-17',
    dates: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
  });

  assert.equal(analytics.completionPercent, 50);
  assert.equal(analytics.checkedToday, false);
  assert.equal(analytics.currentStreak, 0);
  assert.equal(analytics.bestStreak, 2);
  assert.deepEqual(analytics.monthlySeries.map(point => [point.date, point.percent]), [
    ['2026-09-14', 100], ['2026-09-15', 100], ['2026-09-16', 0], ['2026-09-17', 0],
  ]);
});

test('weekly target analytics does not treat visible future cells as misses', () => {
  const analytics = Core.habitAnalytics({ id: 'h', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-14' }, [
    { habitId: 'h', date: '2026-09-14', status: 'done' },
    { habitId: 'h', date: '2026-09-15', status: 'done' },
  ], { today: '2026-09-17', dates: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'] });

  assert.equal(analytics.completionPercent, 50);
  assert.equal(analytics.checkedToday, false);
  assert.deepEqual(analytics.weeklySeries, [{ key: '2026-09-14', percent: 50, completed: 2, target: 4 }]);
  assert.equal(analytics.monthlySeries.at(-1).date, '2026-09-17');
});

test('habit detail renders a compact read-only analytics summary, chart, and heatmap', () => {
  const adapters = {};
  const window = { TodoDomainModules: { register: adapter => { adapters[adapter.name] = adapter; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/habits-ui.js'), 'utf8'), { window, requestAnimationFrame: fn => fn() });
  const habit = { id: 'h', name: 'Read', status: 'active', trackingType: 'checkbox', targetValue: 1, startDate: '2026-09-14', frequencyType: 'daily', routine: 'daily', quickValues: [], minimumTarget: null, idealTarget: null, graceDays: 0 };
  const logs = [{ habitId: 'h', date: '2026-09-14', status: 'done' }, { habitId: 'h', date: '2026-09-15', status: 'done' }];
  const ctx = {
    Core: { ...Core, dateOnly: () => '2026-09-17' }, state: { habits: [habit], areas: [], goals: [], habitLogCache: { h: logs }, settings: {}, ui: {} },
    esc: value => String(value ?? '').replace(/</g, '&lt;'), getHabit: () => habit, getArea: () => null,
    pageHeader: () => '', habitMetrics: item => Core.deriveHabitMetrics(item, logs, '2026-09-17'),
    habitFrequencyLabel: () => 'Daily', habitProgressLabel: () => '0 / 1',
  };

  const html = adapters.habits.renderRoute({ type: 'habit', id: 'h' }, ctx);

  assert.match(html, /data-habit-analytics/);
  assert.match(html, /data-habit-analytics-chart/);
  assert.match(html, /data-habit-analytics-heatmap/);
  assert.deepEqual(logs, [{ habitId: 'h', date: '2026-09-14', status: 'done' }, { habitId: 'h', date: '2026-09-15', status: 'done' }]);
});
