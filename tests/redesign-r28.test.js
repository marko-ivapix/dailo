// Redesign R28: the Android home-screen widget "Danas" (addition K).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r28-widget.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const exists = file => fs.existsSync(path.join(__dirname, '..', file));
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = '2026-10-11';
const task = (id, extra) => ({ id, title: id.toUpperCase(), isCompleted: false, plannedDate: null, dueDate: null, todayOrder: null, createdAt: '2026-10-01T08:00:00.000Z', ...extra });

test('K: the widget snapshot lists late tasks first, then today\'s plan in order, at most five', () => {
  const state = { tasks: [
    task('late', { dueDate: '2026-10-09' }), task('b', { plannedDate: TODAY, todayOrder: 2 }), task('a', { plannedDate: TODAY, todayOrder: 1, plannedTime: '09:30' }),
    task('c', { plannedDate: TODAY, todayOrder: 3 }), task('d', { plannedDate: TODAY, todayOrder: 4 }), task('e', { plannedDate: TODAY, todayOrder: 5 }),
    task('done', { plannedDate: TODAY, isCompleted: true, completedAt: `${TODAY}T07:00:00.000Z` }), task('later', { plannedDate: '2026-10-12' }),
  ] };
  const snap = Core.widgetSnapshot(state, TODAY);
  assert.deepEqual(snap.items, [{ title: 'LATE', time: null, overdue: true }, { title: 'A', time: '09:30', overdue: false }, { title: 'B', time: null, overdue: false }, { title: 'C', time: null, overdue: false }, { title: 'D', time: null, overdue: false }]);
  assert.deepEqual([snap.date, snap.overdue, snap.planned, snap.more], [TODAY, 1, 5, 1]);
  assert.deepEqual(Core.widgetSnapshot({ tasks: [] }, TODAY), { date: TODAY, overdue: 0, planned: 0, items: [], more: 0 });
});

test('K: the app sends the widget Serbian texts, only on Android', () => {
  const sent = [];
  const ctx = withI18n({ Core: { ...Core, dateOnly: () => TODAY }, state: { tasks: [task('a', { plannedDate: TODAY, plannedTime: '09:30' }), task('late', { dueDate: '2026-10-09' })] } });
  ctx.globalThis = ctx;
  ctx.DailoPlatform = { kind: 'android', widget: { update: snapshot => { sent.push(snapshot); return Promise.resolve(true); } } };
  vm.createContext(ctx);
  vm.runInContext(`${fn('updateWidget')}${fn('habitsWidgetPart')}`, ctx); // R45: the "Navike" part rides along
  ctx.updateWidget();
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), {
    date: TODAY, title: 'Today', summary: '1 planned · 1 late',
    items: [{ text: 'LATE', overdue: true }, { text: '09:30 · A', overdue: false }],
    more: '', empty: 'Nothing planned for today', stale: 'Open Dailo for today’s plan',
    habits: { title: 'Habits', summary: '', items: [], more: '', empty: 'No habits planned for today', stale: 'Open Dailo for today’s habits' },
  });
  ctx.DailoPlatform.kind = 'ios';
  ctx.updateWidget();
  assert.equal(sent.length, 1, 'iOS has no widget yet');
  assert.match(fn('writeDurableMirror'), /updateWidget\(\);/, 'every save that reaches the mirror refreshes the widget');
  assert.match(fn('startPlatform'), /updateWidget\(\);/);
  assert.match(fn('resumeApp'), /updateWidget\(\);/);
});

test('K: the platform hands the snapshot to the app\'s own DailoWidget plugin on Android', async () => {
  const calls = [];
  const make = kind => Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => kind, registerPlugin: name => (name === 'DailoWidget' ? { update: async options => { calls.push(options); } } : {}) }, console });
  assert.equal(await make('android').widget.update({ date: TODAY }), true);
  assert.deepEqual(calls, [{ snapshot: JSON.stringify({ date: TODAY }) }]);
  assert.equal(await make('ios').widget.update({ date: TODAY }), false);
  assert.equal(await Platform.widget.update({ date: TODAY }), false, 'the web has no widget');
});

test('K: Android has the widget provider, its plugin, layout and description', () => {
  const base = 'android/app/src/main/';
  const widget = read(`${base}java/cloud/ivapix/dailo/TodayWidget.java`);
  assert.match(widget, /public class TodayWidget extends AppWidgetProvider/);
  assert.match(widget, /link\(context, "dailo:\/\/today", 1\)/);
  assert.match(widget, /link\(context, "dailo:\/\/new-task", 2\)/);
  assert.match(widget, /PendingIntent\.FLAG_UPDATE_CURRENT \| PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(widget, /today\.equals\(snapshot\.optString\("date"\)\)/, 'a snapshot from another day is not shown as today');
  const plugin = read(`${base}java/cloud/ivapix/dailo/WidgetPlugin.java`);
  assert.match(plugin, /@CapacitorPlugin\(name = "DailoWidget"\)/);
  assert.match(plugin, /TodayWidget\.refreshAll\(getContext\(\)\);/);
  assert.match(read(`${base}java/cloud/ivapix/dailo/MainActivity.java`), /registerPlugin\(WidgetPlugin\.class\);\n\s+asAppLink\(getIntent\(\)\);\n\s+super\.onCreate\(savedInstanceState\);/);
  const manifest = read(`${base}AndroidManifest.xml`);
  assert.match(manifest, /<receiver android:name="\.TodayWidget" android:exported="false" android:label="@string\/widget_name">/);
  assert.match(manifest, /<action android:name="android\.appwidget\.action\.APPWIDGET_UPDATE" \/>/);
  assert.match(manifest, /<meta-data android:name="android\.appwidget\.provider" android:resource="@xml\/widget_today_info" \/>/);
  const info = read(`${base}res/xml/widget_today_info.xml`);
  assert.match(info, /android:initialLayout="@layout\/widget_today"/);
  assert.match(info, /android:updatePeriodMillis="1800000"/);
  const layout = read(`${base}res/layout/widget_today.xml`);
  for (const id of ['widget_root', 'widget_title', 'widget_summary', 'widget_add', 'widget_row_1', 'widget_row_5', 'widget_note']) assert.match(layout, new RegExp(`android:id="@\\+id/${id}"`), id);
  assert.ok(exists(`${base}res/drawable/widget_background.xml`));
  const strings = read(`${base}res/values/strings.xml`);
  assert.match(strings, /<string name="widget_name">Dailo · Danas<\/string>/);
  assert.match(strings, /<string name="widget_open">Otvori Dailo<\/string>/);
});

test('R28 shipped as 2.0.0-alpha.53 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 53);
});
