// Redesign R41: Navike pages through weeks — ‹ a week back (to the first habit's week), › one week ahead, "Ova nedelja".
// Spec: docs/superpowers/specs/2026-10-12-redesign-r41-habit-weeks.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { foldButton } = require('./support/fold.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const habitsUi = read('js/habits-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = Core.dateOnly();
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const log = (habitId, date, status = 'done', value = null) => ({ id: `${habitId}:${date}`, habitId, date, status, value });
const THIS = Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, TODAY, 'monday');
const LAST = Core.addDays(THIS, -7);
const NEXT = Core.addDays(THIS, 7);
const daysOf = start => Array.from({ length: 7 }, (_, index) => Core.addDays(start, index));
const range = start => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long' }).formatRange(Core.parseDateOnly(start), Core.parseDateOnly(Core.addDays(start, 6)));
const dow = Core.parseDateOnly(TODAY).getDay();

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(habitsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  return adapter;
}
function screen(ui = {}, { startDate = '2026-01-01' } = {}) {
  const calls = [];
  const habits = [
    { id: 'm', name: 'Meditate', status: 'active', routine: 'morning', trackingType: 'checkbox', frequencyType: 'daily', startDate },
    { id: 'x', name: 'Tomorrow only', status: 'active', routine: 'daily', trackingType: 'checkbox', frequencyType: 'weekdays', weekdays: [(dow + 1) % 7], startDate },
  ];
  const state = {
    habits, settings: { weekStartsOn: 'monday' },
    habitLogCache: { m: [log('m', TODAY), log('m', Core.addDays(TODAY, -7))] },
    ui: { habitsView: 'day', habitsDay: TODAY, habitTrackerMonth: TODAY.slice(0, 7), ...ui },
  };
  return {
    calls, state, Core, esc, foldButton,
    getHabit: id => habits.find(habit => habit.id === id),
    habitMetrics: () => ({ currentStreak: 1, currentPeriodCount: 0, currentPeriodTarget: 1 }),
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    emptyState: () => '<empty>',
    formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    saveAndRender: () => calls.push('saveAndRender'),
  };
}
const render = ctx => moduleFor().renderRoute({ type: 'habits' }, ctx);
const rings = html => [...html.matchAll(/data-action="habits-ring" data-date="([\d-]+)"([^>]*)>/g)].map(match => [match[1], match[2].includes(' disabled')]);
const act = (ctx, shift) => {
  const el = { dataset: { shift: String(shift) }, closest: () => el };
  return moduleFor().handleAction('habits-week', { target: el }, ctx);
};

test('this week: ‹ week › above the rings, named "Ova nedelja", without the way back', () => {
  const html = render(screen());
  assert.match(html, new RegExp(`^<header title="Habits"[^>]*></header><div class="habits-week-nav"><button class="btn-icon" type="button" data-action="habits-week" data-shift="-1" aria-label="Previous week"><i class="ph ph-caret-left" aria-hidden="true"></i></button><div class="habits-week-range"><strong>${range(THIS)}</strong><span>Current week</span></div><button class="btn-icon" type="button" data-action="habits-week" data-shift="1" aria-label="Next week"><i class="ph ph-caret-right" aria-hidden="true"></i></button></div><div class="habit-rings" role="group" aria-label="This week, done of planned">`));
  assert.deepEqual(rings(html).map(([date]) => date), daysOf(THIS));
  assert.doesNotMatch(html, /habits-week-today/);
});

test('last week: its rings and days, Dan keeps the weekday, the bars follow it and "Ova nedelja" comes back', () => {
  const html = render(screen({ habitsWeekStart: LAST, habitsDay: Core.addDays(TODAY, -7) }));
  assert.match(html, new RegExp(`<div class="habits-week-range"><strong>${range(LAST)}</strong><span>Last week</span></div><button class="habits-week-today" type="button" data-action="habits-week" data-shift="0">Current week</button>`));
  assert.deepEqual(rings(html), daysOf(LAST).map(date => [date, false]), 'every day of last week can be opened');
  assert.match(html, new RegExp(`<div class="habit-rings" role="group" aria-label="${range(LAST)}: done of planned">`));
  assert.match(html, new RegExp(`data-date="${Core.addDays(TODAY, -7)}" aria-label="F:${Core.addDays(TODAY, -7)}, [^"]+" aria-current="date"`), 'the same weekday is selected');
  assert.match(html, new RegExp(`<p class="habits-bars-title">By habit · ${range(LAST)}</p>`));
  // Dan of a day outside the shown week falls back to that week's last day.
  const fallback = render(screen({ habitsWeekStart: LAST, habitsDay: TODAY }));
  assert.match(fallback, new RegExp(`data-date="${Core.addDays(LAST, 6)}" aria-label="[^"]+" aria-current="date"`));
  // An entry from Danas ("Juče nije zabeleženo") on a Monday opens yesterday in last week, without an arrow.
  const yesterday = Core.addDays(THIS, -1);
  assert.deepEqual(rings(render(screen({ habitsDay: yesterday }))).map(([date]) => date), daysOf(LAST));
});

test('next week: inactive rings, no further arrow, Dan says it has not started, Nedelja shows what is planned', () => {
  const html = render(screen({ habitsWeekStart: NEXT }));
  assert.match(html, /<span>Next week<\/span><\/div><button class="habits-week-today"[^>]*>Current week<\/button><button class="btn-icon" type="button" data-action="habits-week" data-shift="1" aria-label="Next week" disabled>/);
  assert.ok(rings(html).every(([, off]) => off), 'no day of next week can be opened');
  assert.match(html, /<p class="today-empty">This week has not started yet\. The Week view shows what is planned\.<\/p>/);
  assert.match(html, /<p class="habits-bars-title">By habit · this week<\/p>/, 'the bars stay on this week');
  const week = render(screen({ habitsWeekStart: NEXT, habitsView: 'week' }));
  const cells = id => [...week.matchAll(new RegExp(`class="habit-cell is-(\\w+)[^"]*" type="button" data-action="habit-today-toggle" data-habit-id="${id}" data-date="([\\d-]+)"`, 'g'))].map(match => [match[2], match[1]]);
  assert.deepEqual(cells('m'), daysOf(NEXT).map(date => [date, 'future']));
  assert.deepEqual(cells('x'), daysOf(NEXT).map(date => [date, Core.parseDateOnly(date).getDay() === (dow + 1) % 7 ? 'future' : 'unscheduled']), 'a day the habit is not planned on shows the dash');
  assert.doesNotMatch(week, /habits-week-title/, 'the range is in the bar above, not repeated over the table');
});

test('the way back ends at the week the first active habit started; a stored week outside the range is clamped', () => {
  const fresh = render(screen({}, { startDate: TODAY }));
  assert.match(fresh, /data-shift="-1" aria-label="Previous week" disabled>/);
  assert.deepEqual(rings(render(screen({ habitsWeekStart: Core.addDays(THIS, 70) }))).map(([date]) => date), daysOf(NEXT));
  assert.deepEqual(rings(render(screen({ habitsWeekStart: LAST }, { startDate: TODAY }))).map(([date]) => date), daysOf(THIS));
});

test('the arrows move a week and keep the weekday; "Ova nedelja" and the arrows stop at the ends', () => {
  const ctx = screen();
  assert.equal(act(ctx, -1), true);
  assert.deepEqual([ctx.state.ui.habitsWeekStart, ctx.state.ui.habitsDay], [LAST, Core.addDays(TODAY, -7)]);
  act(ctx, 1);
  assert.deepEqual([ctx.state.ui.habitsWeekStart, ctx.state.ui.habitsDay], [null, TODAY], 'back on this week');
  act(ctx, 1);
  assert.deepEqual([ctx.state.ui.habitsWeekStart, ctx.state.ui.habitsDay], [NEXT, TODAY], 'next week has no day to select yet');
  act(ctx, 1);
  assert.equal(ctx.state.ui.habitsWeekStart, NEXT, 'no further than next week');
  act(ctx, -1);
  assert.deepEqual([ctx.state.ui.habitsWeekStart, ctx.state.ui.habitsDay], [null, TODAY]);
  act(ctx, -1); act(ctx, -1);
  act(ctx, 0);
  assert.deepEqual([ctx.state.ui.habitsWeekStart, ctx.state.ui.habitsDay], [null, TODAY], '"Ova nedelja"');
  const fresh = screen({}, { startDate: TODAY });
  act(fresh, -1);
  assert.equal(fresh.state.ui.habitsWeekStart, undefined, 'no week before the first habit');
  assert.ok(ctx.calls.length >= 5);
});

test('opening Navike starts on this week (or the week of the day it was opened on)', () => {
  assert.match(fn('enterHabitsRoute'), /habitsView: 'day', habitsDay: habitsEntryDay \|\| Core\.dateOnly\(\), habitsWeekStart: null,/);
});

test('style and Serbian', () => {
  assert.match(css, /\.habits-week-nav \{ display: flex; align-items: center; gap: 4px;/);
  assert.match(css, /\.habits-week-today \{[^}]*min-height: 44px;[^}]*border-radius: var\(--radius-pill\);/);
  assert.doesNotMatch(css, /\.habits-week-title/);
  for (const [en, value] of [['Current week', 'Ova nedelja'], ['Last week', 'Prošla nedelja'], ['Next week', 'Sledeća nedelja'], ['Previous week', 'Prethodna nedelja'], ['{range}: done of planned', '{range}: urađeno od planiranog'], ['By habit · {range}', 'Po navici · {range}'], ['This week has not started yet. The Week view shows what is planned.', 'Ova nedelja još nije počela. Prikaz Nedelja pokazuje šta je planirano.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R41 is released as 2.0.0-alpha.67', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.67');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.67';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.67');
});
