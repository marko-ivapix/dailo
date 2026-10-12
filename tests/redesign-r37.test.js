// Redesign R37: the third design pass, additions D, F and J (habits, calendar, settings).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r37-habits-calendar-settings.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const I18n = require('../js/i18n.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const habitsUi = read('js/habits-ui.js');
const calendarUi = read('js/calendar-ui.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));
const has = (en, value) => assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);

test('D: a numeric habit on Danas has one-tap quick values that add at once with Poništi', () => {
  assert.match(habitsUi, /const quick = numeric && !date \? \(habit\.quickValues \|\| \[\]\)\.slice\(0, 2\)\.map\(value => `<button class="quick-chip habit-quick-value" type="button" data-action="habit-quick-value" data-habit-id="\$\{esc\(habit\.id\)\}" data-value="\$\{esc\(value\)\}" aria-label="\$\{esc\(tr\('Add \{value\} to \{habit\}', \{ value: number\(value\), habit: habit\.name \}\)\)\}">\+\$\{esc\(number\(value\)\)\}<\/button>`\)\.join\(''\) : '';/);
  assert.match(habitsUi, /\$\{main\}\$\{quick\}\$\{check\}/);
  const action = habitsUi.slice(habitsUi.indexOf("if (action === 'habit-quick-value')"));
  assert.match(action, /^if \(action === 'habit-quick-value'\) \{\n\s+const habit = getHabit\(el\.dataset\.habitId\); if \(!habit \|\| habit\.trackingType !== 'numeric'\) return true;\n\s+const previous = dayLog\(habit\.id\);\n\s+const total = Math\.round\(\(Number\(previous\?\.value \|\| 0\) \+ Number\(el\.dataset\.value \|\| 0\)\) \* 1000\) \/ 1000;\n\s+setHabitLog\(habit\.id, today, 'done', total\)\.then\(\(\) => ctx\.setUndo\(msg\('Value added'\), \(\) => setHabitLog\(habit\.id, today, previous\?\.status === 'skipped' \? 'skipped' : 'done', previous \? previous\.value : 0\)\)\)\.catch\(console\.error\);/);
  has('Value added', 'Vrednost dodata');
  has('Add {value} to {habit}', 'Dodaj {value}: {habit}');
  assert.ok(css.includes('.habit-quick-value'));
});

test('D: Nedelja shows how far a numeric day got as a partial arc', () => {
  assert.match(habitsUi, /const fraction = habit\.trackingType === 'numeric' && day\.state !== 'done' && Number\(habit\.targetValue\) > 0 \? Math\.min\(1, Number\(day\.value \|\| 0\) \/ Number\(habit\.targetValue\)\) : 0;/);
  assert.match(habitsUi, /\$\{fraction > 0 \? ` is-partial" style="--fraction:\$\{Math\.round\(fraction \* 100\) \/ 100\}` : ''\}/);
  assert.match(css, /\.habit-cell\.is-partial \{ background: conic-gradient\(var\(--blue-300\) calc\(var\(--fraction\) \* 1turn\), transparent 0\); \}/);
});

test('D: until noon Danas says how many habits yesterday has no record of, and opens yesterday on Navike', () => {
  const yesterday = Core.addDays(Core.dateOnly(), -1);
  const habit = (id, extra = {}) => ({ id, name: id, trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01', status: 'active', ...extra });
  const habits = [habit('a'), habit('b'), habit('c'), habit('paused', { status: 'paused' })];
  const logs = { a: [{ habitId: 'a', date: yesterday, status: 'done', value: null }], c: [{ habitId: 'c', date: yesterday, status: 'skipped', value: null }] };
  assert.equal(Core.habitsMissedOn(habits, logs, yesterday, Core.dateOnly(), 'monday'), 1);
  const ctx = withI18n({ I18n, Core, state: { habits, habitLogCache: logs, settings: {} }, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [`${Core.dateOnly()}T09:00:00`])); } } });
  vm.createContext(ctx);
  vm.runInContext(fn('yesterdayHabitsNote'), ctx);
  assert.equal(ctx.yesterdayHabitsNote(), '<button class="today-habits-yesterday" type="button" data-action="habits-yesterday"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i><span>Not recorded yesterday: 1</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>');
  ctx.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [`${Core.dateOnly()}T13:00:00`])); } };
  assert.equal(ctx.yesterdayHabitsNote(), '', 'only until noon');
  assert.match(fn('renderToday'), /<div class="habit-list today-card">\$\{todayLimited\('habits', habits\.map\(item => renderHabitTodayRow\(item\.habit, item\.status\)\)\)\}<\/div>\$\{yesterdayHabitsNote\(\)\}/);
  assert.match(app, /else if \(action === 'habits-yesterday'\) \{ habitsEntryDay = Core\.addDays\(Core\.dateOnly\(\), -1\); navigate\('habits'\); \}/);
  assert.match(fn('enterHabitsRoute'), /habitsDay: habitsEntryDay \|\| Core\.dateOnly\(\)/);
  has('Not recorded yesterday: {count}', 'Juče nije zabeleženo: {count}');
});

test('F: the calendar shows the coming dates of repeating tasks without storing them', () => {
  const tasks = [
    { id: 'w', title: 'Weekly', plannedDate: '2026-10-12', recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] }, isCompleted: false },
    { id: 'p', title: 'Paused', plannedDate: '2026-10-12', recurrence: { frequency: 'daily', interval: 1, status: 'paused' }, isCompleted: false },
    { id: 'd', title: 'Done', plannedDate: '2026-10-12', recurrence: { frequency: 'daily', interval: 1 }, isCompleted: true },
    { id: 'plain', title: 'Once', plannedDate: '2026-10-13', isCompleted: false },
  ];
  const repeats = Core.calendarRepeats(tasks, '2026-10-12', '2026-11-02');
  assert.deepEqual(Object.keys(repeats), ['2026-10-19', '2026-10-26', '2026-11-02'], 'the stored date itself is not repeated');
  assert.equal(repeats['2026-10-19'][0].task.id, 'w');
  assert.match(calendarUi, /function repeatRows\(ctx, date, repeats\) \{/);
  assert.match(calendarUi, /<button class="today-row calendar-repeat-row" type="button" data-action="open-task" data-task-id="\$\{ctx\.esc\(task\.id\)\}"><i class="ph ph-arrows-clockwise calendar-repeat-icon" aria-hidden="true"><\/i><span class="today-row-main"><span class="task-title">\$\{ctx\.esc\(task\.title\)\}<\/span><span class="task-meta">\$\{ctx\.esc\(\[tr\('Repeats'\), task\.plannedTime\]\.filter\(Boolean\)\.join\(' · '\)\)\}<\/span><\/span><\/button>/);
  assert.match(calendarUi, /\$\{dot\(items, repeats\[date\]\)\}/, 'Mesec marks a day with only repeats');
  assert.match(calendarUi, /const repeats = Core\.calendarRepeats\(source\.tasks, Core\.addDays\(today, 1\), Core\.addDays\(today, UPCOMING_DAYS\)\);/, 'Predstojeće lists them');
  assert.match(css, /\.calendar-dot\.is-repeat \{/);
  has('Repeats', 'Ponavlja se');
});

test('J: text size is a device choice that scales the type scale; fields never go under 16 px', () => {
  assert.match(css, /\n  --text-scale: 1;\n/);
  assert.match(css, /\n  --text-md: calc\(13px \* var\(--text-scale\)\);/);
  assert.match(css, /\n  --text-input: max\(16px, calc\(16px \* var\(--text-scale\)\)\);/);
  assert.match(css, /:root\[data-text-size="small"\] \{ --text-scale: \.92; \}\n:root\[data-text-size="large"\] \{ --text-scale: 1\.12; \}\n:root\[data-text-size="larger"\] \{ --text-scale: 1\.25; \}/);
  const storage = {};
  const root = { dataset: {} };
  const ctx = withI18n({ localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; }, removeItem: key => { delete storage[key]; } }, document: { documentElement: root } });
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/\n  const TEXT_SIZES = [^\n]+/)[0]}\n${fn('readTextSize')}${fn('applyTextSize')}`, ctx);
  assert.equal(ctx.readTextSize(), 'normal');
  ctx.applyTextSize('large');
  assert.equal(storage.dailoTextSize, 'large'); assert.equal(root.dataset.textSize, 'large');
  ctx.applyTextSize('normal');
  assert.equal(storage.dailoTextSize, undefined); assert.equal(root.dataset.textSize, undefined);
  ctx.applyTextSize('huge');
  assert.equal(ctx.readTextSize(), 'normal', 'unknown values fall back');
  has('Text size', 'Veličina teksta'); has('Only on this device.', 'Samo na ovom uređaju.');
});

function settingsHtml(extra = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, Notification: extra.Notification });
  const ctx = {
    state: { tasks: [{}, {}], projects: [{}], habits: [{}], notes: [{}], resources: [], settings: { backupStatus: { lastExport: extra.lastExport ?? null } } },
    esc: value => String(value ?? ''), pageHeader: title => `<h1>${title}</h1>`, shortcutError: () => '', shortcutLabels: {},
    notificationButtonLabel: () => 'Enable', release: { APP_VERSION: 'x' }, environmentInfo: () => ({ standalone: false, userAgent: '' }),
    notificationSettings: () => extra.native || null, readAutoBackup: () => ({ enabled: false }), installPrompt: () => false,
    storagePersistence: () => ({ state: extra.persistence || 'granted' }), readTextSize: () => extra.textSize || 'normal', nowIso: () => '2026-10-12T08:00:00.000Z',
    Core: { backupReminderDays: () => 7 },
  };
  return adapter.renderRoute({ type: 'settings' }, ctx);
}

test('J: Settings has the text size, a test reminder and a data health line', () => {
  const html = settingsHtml({ native: { permission: 'granted' }, lastExport: '2026-10-10T08:00:00.000Z', textSize: 'large' });
  assert.match(html, /<div class="settings-row"><label class="settings-label" for="text-size"><strong>Text size<\/strong><span>Only on this device\.<\/span><\/label><select class="input" id="text-size"><option value="small">Smaller<\/option><option value="normal">Normal<\/option><option value="large" selected>Larger<\/option><option value="larger">Largest<\/option><\/select><\/div>/);
  assert.match(html, /<div class="settings-row"><div class="settings-label"><strong>Test reminder<\/strong><span>A reminder arrives in five seconds, so you can see that notifications work\.<\/span><\/div><button class="btn btn-secondary" type="button" data-action="test-reminder">Send<\/button><\/div>/);
  assert.match(html, /<div class="settings-row settings-health is-ok"><div class="settings-label"><strong>Data health<\/strong><span>2 tasks · 1 project · 1 habit · 1 note or resource · backup 2 days ago<\/span><\/div><\/div>/);
  assert.match(settingsHtml({ lastExport: null }), /settings-health is-warning[\s\S]*no backup yet/);
  assert.match(settingsHtml({ lastExport: '2026-10-10T08:00:00.000Z', persistence: 'denied' }), /settings-health is-warning/, 'storage that can be cleared is a warning');
  assert.match(css, /\.settings-health\.is-warning strong \{ color: var\(--warning\); \}/);
  has('Data health', 'Stanje podataka'); has('Test reminder', 'Probni podsetnik'); has('Send', 'Pošalji');
});

test('J: the test reminder arrives in five seconds and reconcile leaves it alone', async () => {
  const scheduled = []; const cancelled = [];
  const plugin = {
    checkPermissions: async () => ({ display: 'granted' }), checkExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
    schedule: async ({ notifications }) => { scheduled.push(...notifications); }, cancel: async ({ notifications }) => { cancelled.push(...notifications); },
    getPending: async () => ({ notifications: scheduled.map(item => ({ id: item.id, schedule: { at: item.schedule.at.toISOString() }, extra: item.extra })) }),
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'LocalNotifications' ? plugin : {}) }, console });
  const result = await platform.notifications.test({ title: 'Dailo', body: 'Test', seconds: 5 });
  assert.equal(result.status, 'ok');
  assert.equal(scheduled[0].extra.test, true);
  assert.ok(scheduled[0].schedule.at.getTime() - Date.now() > 3000);
  await platform.notifications.reconcile([]);
  assert.deepEqual(cancelled, [], 'the test notification is not cancelled');
  assert.match(fn('sendTestReminder'), /const result = await globalThis\.DailoPlatform\?\.notifications\?\.test\?\.\(\{ title: tr\('Dailo'\), body: tr\('This is how a reminder looks\.'\), seconds: 5 \}\);/);
  has('This is how a reminder looks.', 'Ovako izgleda podsetnik.');
});

test('R37 shipped as 2.0.0-alpha.63 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 63);
});
