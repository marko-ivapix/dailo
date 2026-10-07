const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

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

test('weekly target analytics includes the complete week at a visible month boundary', () => {
  const analytics = Core.habitAnalytics({ id: 'h', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-08-30' }, [
    '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  ].map(date => ({ habitId: 'h', date, status: 'done' })), {
    today: '2026-09-17',
    dates: Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
  });

  assert.deepEqual(analytics.weeklySeries[0], { key: '2026-08-31', percent: 100, completed: 4, target: 4 });
  assert.equal(analytics.completionPercent, 33);
  assert.equal(analytics.monthlySeries[0].date, '2026-09-01');
});

test('analytics retains recorded pre-today pause-boundary logs as historical evidence', () => {
  const habit = { id: 'h', frequencyType: 'daily', startDate: '2026-09-14', pauseIntervals: [{ startDate: '2026-09-16' }] };
  const logs = [{ habitId: 'h', date: '2026-09-14', status: 'done' }, { habitId: 'h', date: '2026-09-16', status: 'done' }];
  const analytics = Core.habitAnalytics(habit, logs, { today: '2026-09-17', dates: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'] });

  assert.equal(analytics.completionPercent, 67);
  assert.deepEqual(analytics.monthlySeries.map(point => [point.date, point.status]), [
    ['2026-09-14', 'done'], ['2026-09-15', 'missed'], ['2026-09-16', 'done'],
  ]);
});

test('habit detail renders a compact read-only analytics summary, chart, and heatmap', () => {
  const adapters = {};
  const window = { TodoDomainModules: { register: adapter => { adapters[adapter.name] = adapter; } } };
  runInNewContextWithI18n(fs.readFileSync(require.resolve('../js/habits-ui.js'), 'utf8'), { window, requestAnimationFrame: fn => fn() });
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
