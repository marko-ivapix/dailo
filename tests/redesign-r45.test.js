// Redesign R45: the Android "Navike" home-screen widget — today's habits, and a tap on one checks it in.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r45-habits-widget.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const T = '2026-10-12'; // a Monday
const log = (habitId, date, status = 'done', value = null) => ({ id: `${habitId}:${date}`, habitId, date, status, value });
const habit = (id, fields = {}) => ({ id, name: id, status: 'active', routine: 'daily', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01', ...fields });
const habits = [
  habit('Read', { routine: 'night' }),
  habit('Meditate', { routine: 'morning' }),
  habit('Water', { routine: 'morning', trackingType: 'numeric', targetValue: 2, unit: 'l' }),
  habit('Weekend', { frequencyType: 'weekdays', weekdays: [0, 6] }),
  habit('Skipped'),
  habit('Paused', { status: 'paused' }),
];
const logs = { Meditate: [log('Meditate', T)], Water: [log('Water', T, 'missed', 0.5)], Skipped: [log('Skipped', T, 'skipped')] };

test('Core.habitsWidgetSnapshot: today\'s planned habits, open ones first in routine order, done ones last', () => {
  const snap = JSON.parse(JSON.stringify(Core.habitsWidgetSnapshot(habits, logs, T, 'monday')));
  assert.deepEqual(snap, {
    date: T, done: 1, planned: 3, more: 0,
    // R61: each item also says whether the day is marked "not done".
    items: [
      { id: 'Water', name: 'Water', done: false, missed: false, numeric: true, value: 0.5, target: 2, unit: 'l' },
      { id: 'Read', name: 'Read', done: false, missed: false, numeric: false, value: null, target: null, unit: '' },
      { id: 'Meditate', name: 'Meditate', done: true, missed: false, numeric: false, value: null, target: null, unit: '' },
    ],
  }, 'not the weekend habit, the skipped day or the paused habit');
  const many = Array.from({ length: 7 }, (_, index) => habit(`h${index}`));
  const limited = Core.habitsWidgetSnapshot(many, {}, T, 'monday');
  assert.deepEqual([limited.items.length, limited.more, limited.planned], [5, 2, 7]);
});

test('the app hands the widget a "habits" part with the counts and ready-made rows', () => {
  const sent = [];
  const context = withI18n({
    Core, I18n: require('../js/i18n.js'), state: { tasks: [], habits, habitLogCache: logs, settings: {} },
    globalThis: { DailoPlatform: { kind: 'android', widget: { update: snapshot => sent.push(snapshot) } } },
  });
  context.Core = { ...Core, dateOnly: () => T };
  vm.createContext(context);
  vm.runInContext(`${fn('updateWidget')}${fn('habitsWidgetPart')}`, context);
  context.updateWidget();
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].habits)), {
    title: 'Habits', summary: '1 of 3 today',
    items: [{ id: 'Water', done: false, text: '○  Water · 0.5/2 l' }, { id: 'Read', done: false, text: '○  Read' }, { id: 'Meditate', done: true, text: '✓  Meditate' }],
    more: '', empty: 'No habits planned for today', stale: 'Open Dailo for today’s habits',
  });
  assert.equal(sent[0].title, 'Today', 'the "Danas" part stays');
});

test('a tap on a habit row checks it in for today, with Undo; a numeric habit opens its value; links open Navike', async () => {
  const calls = [];
  const cache = { Meditate: [log('Meditate', T)] };
  const context = withI18n({
    Core: { ...Core, dateOnly: () => T }, state: { habitLogCache: cache },
    getHabit: id => habits.find(item => item.id === id),
    navigate: route => calls.push(['navigate', route]),
    openHabitValue: (id, date) => calls.push(['value', id, date]),
    setHabitLog: async (...args) => { calls.push(['log', ...args]); return true; },
    setUndo: (message, undo) => { calls.push(['undo', message]); context.undo = undo; },
    setToastMessage: message => calls.push(['toast', message]),
  });
  vm.createContext(context);
  vm.runInContext(fn('checkInHabitFromLink'), context);
  await context.checkInHabitFromLink('Read');
  assert.deepEqual(calls.splice(0), [['navigate', '#habits'], ['log', 'Read', T, 'done'], ['undo', 'Habit recorded']]);
  await context.undo();
  assert.deepEqual(calls.splice(0), [['log', 'Read', T, 'missed']]);
  await context.checkInHabitFromLink('Water');
  assert.deepEqual(calls.splice(0), [['navigate', '#habits'], ['value', 'Water', T]]);
  await context.checkInHabitFromLink('Meditate');
  assert.deepEqual(calls.splice(0), [['navigate', '#habits'], ['toast', 'Already recorded today: Meditate']]);
  await context.checkInHabitFromLink('Paused');
  assert.deepEqual(calls.splice(0), [['navigate', '#habits']], 'a paused or missing habit only opens Navike');
  const link = fn('handleIncomingLink');
  assert.match(link, /\['new-task', 'today', 'journal', 'share', 'auth', 'habits', 'habit-done'\]\.includes\(target\)/);
  assert.match(link, /else if \(target === 'habit-done'\) checkInHabitFromLink\(link\.searchParams\.get\('id'\) \|\| ''\);/);
  assert.match(fn('setHabitLog'), /render\(\); if \(modalState\?\.type === 'habit-details'\) renderModal\(\); updateWidget\(\); return true;/, 'the widget follows a check-in');
});

test('Android: the HabitsWidget provider, its layout and links, and the plugin refreshes both widgets', () => {
  const base = 'android/app/src/main/';
  const widget = read(`${base}java/cloud/ivapix/dailo/HabitsWidget.java`);
  assert.match(widget, /public class HabitsWidget extends AppWidgetProvider/);
  assert.match(widget, /JSONObject habits = snapshot == null \? null : snapshot\.optJSONObject\("habits"\);/);
  assert.match(widget, /link\(context, "dailo:\/\/habit-done\?id=" \+ Uri\.encode\(item\.optString\("id"\)\), 100 \+ i\)/);
  assert.match(widget, /views\.setOnClickPendingIntent\(R\.id\.habits_root, link\(context, "dailo:\/\/habits", 90\)\);/);
  const layout = read(`${base}res/layout/widget_habits.xml`);
  for (const id of ['habits_root', 'habits_title', 'habits_summary', 'habits_row_1', 'habits_row_5', 'habits_note']) assert.ok(layout.includes(`android:id="@+id/${id}"`), id);
  assert.match(read(`${base}res/xml/widget_habits_info.xml`), /android:initialLayout="@layout\/widget_habits"/);
  const manifest = read(`${base}AndroidManifest.xml`);
  assert.match(manifest, /<receiver android:name="\.HabitsWidget" android:exported="false" android:label="@string\/widget_habits_name">/);
  assert.match(manifest, /<meta-data android:name="android\.appwidget\.provider" android:resource="@xml\/widget_habits_info" \/>/);
  assert.match(read(`${base}res/values/strings.xml`), /<string name="widget_habits_name">Dailo · Navike<\/string>/);
  assert.match(read(`${base}java/cloud/ivapix/dailo/WidgetPlugin.java`), /TodayWidget\.refreshAll\(getContext\(\)\);\n\s+HabitsWidget\.refreshAll\(getContext\(\)\);/);
});

test('Serbian', () => {
  for (const [en, value] of [['No habits planned for today', 'Danas nema planiranih navika'], ['Open Dailo for today’s habits', 'Otvori Dailo za današnje navike'], ['Habit recorded', 'Navika je zabeležena'], ['Already recorded today: {name}', 'Već zabeleženo danas: {name}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R45 shipped as 2.0.0-alpha.71 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 71);
});
