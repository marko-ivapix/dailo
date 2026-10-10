// Redesign R18: reminder settings — the default reminder time, the journal on the phone, reminders at the planned time.
// Spec: docs/superpowers/specs/2026-10-10-redesign-r18-reminder-settings.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));
const NOW = '2026-10-10T10:30:00.000Z'; // 12:30 in Belgrade
const local = (date, time) => new Date(`${date}T${time}:00`).toISOString();

test('the Core readers and their defaults', () => {
  assert.equal(Core.defaultReminderTime({}), '09:00');
  assert.equal(Core.defaultReminderTime({ defaultReminderTime: '07:30' }), '07:30');
  assert.equal(Core.defaultReminderTime({ defaultReminderTime: 'later' }), '09:00');
  assert.equal(Core.plannedTimeReminders({}), false);
  assert.equal(Core.plannedTimeReminders({ plannedTimeReminders: true }), true);
  assert.equal(Core.journalNotifications({}), false);
  assert.equal(Core.journalNotifications({ journalNotifications: true }), true);
  assert.equal(Core.plannedReminderMoment({ plannedDate: '2026-10-10', plannedTime: '14:00' }), '2026-10-10T14:00:00');
  assert.equal(Core.plannedReminderMoment({ plannedDate: '2026-10-10', plannedTime: '14:00', reminderAt: '2026-10-10T13:00:00' }), null, 'a set reminder wins');
  assert.equal(Core.plannedReminderMoment({ plannedDate: '2026-10-10', plannedTime: '14:00', isCompleted: true }), null);
  assert.equal(Core.plannedReminderMoment({ plannedDate: '2026-10-10' }), null, 'no time, no reminder');
});

test('backups validate the three settings', () => {
  const Backup = require('../js/backup.js');
  const state = settings => Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings, ui: {} });
  assert.doesNotThrow(() => Backup.validateDomain(state({ defaultReminderTime: '08:00', plannedTimeReminders: true, journalNotifications: false }), [], []));
  assert.doesNotThrow(() => Backup.validateDomain(state({}), [], []), 'a backup made before R18');
  for (const [key, value] of [['defaultReminderTime', '8 am'], ['plannedTimeReminders', 'yes'], ['journalNotifications', 1]]) {
    assert.throws(() => Backup.validateDomain(state({ [key]: value }), [], []), new RegExp(`${key}|Invalid backup`), key);
  }
});

const task = (id, fields) => ({ id, title: id, isCompleted: false, ...fields });

test('c) notificationPlan: a planned time reminds when the setting is on and the task has no reminder', () => {
  const tasks = [task('plan', { plannedDate: '2026-10-10', plannedTime: '14:00' }), task('own', { plannedDate: '2026-10-10', plannedTime: '15:00', reminderAt: '2026-10-10T14:45:00' }), task('past', { plannedDate: '2026-10-10', plannedTime: '09:00' })];
  const off = Core.notificationPlan({ tasks, settings: {} }, NOW);
  assert.deepEqual(off.map(item => item.id), ['own']);
  const on = Core.notificationPlan({ tasks, settings: { plannedTimeReminders: true } }, NOW);
  assert.deepEqual(plain(on.map(item => [item.id, item.key, item.at])), [
    ['plan', Core.notificationKey('task', 'plan', 'planned:2026-10-10T14:00:00'), local('2026-10-10', '14:00')],
    ['own', Core.notificationKey('task', 'own', '2026-10-10T14:45:00'), local('2026-10-10', '14:45')],
  ]);
  assert.equal(on[0].route, 'task/plan');
  const fired = Core.notificationPlan({ tasks, settings: { plannedTimeReminders: true } }, NOW, { plannedFired: { plan: '2026-10-10T14:00:00' } });
  assert.deepEqual(fired.map(item => item.id), ['own'], 'a shown planned reminder is not scheduled again');
});

test('b) notificationPlan: the journal notifies daily at its time when switched on, without today once written', () => {
  const settings = { journalNotifications: true, journalReminderTime: '20:00' };
  const plan = Core.notificationPlan({ tasks: [], journal: [], settings }, NOW, { days: 2 });
  assert.deepEqual(plain(plan.map(item => [item.kind, item.id, item.at, item.route])), [
    ['journal', 'journal_2026-10-10', local('2026-10-10', '20:00'), 'journal/journal_2026-10-10'],
    ['journal', 'journal_2026-10-11', local('2026-10-11', '20:00'), 'journal/journal_2026-10-11'],
  ], 'within the plan window of two days');
  const written = Core.notificationPlan({ tasks: [], journal: [{ id: 'journal_2026-10-10', date: '2026-10-10', text: 'Good day', mood: null }], settings }, NOW, { days: 2 });
  assert.deepEqual(written.map(item => item.id), ['journal_2026-10-11']);
  const moodOnly = Core.notificationPlan({ tasks: [], journal: [{ id: 'journal_2026-10-10', date: '2026-10-10', text: '', mood: 4 }], settings }, NOW, { days: 0 });
  assert.deepEqual(moodOnly, []);
  assert.deepEqual(Core.notificationPlan({ tasks: [], journal: [], settings: { journalReminderTime: '20:00' } }, NOW, { days: 2 }), [], 'off by default');
  assert.deepEqual(Core.notificationPlan({ tasks: [], journal: [], settings: { journalNotifications: true, journalReminderTime: null } }, NOW, { days: 2 }), [], 'off with the journal reminder');
});

test('c) the open app shows a planned reminder once, only within two hours of its time', () => {
  const plan = task('plan', { plannedDate: '2026-10-10', plannedTime: '12:00' });
  assert.equal(Core.plannedReminderDue(plan, NOW, undefined), '2026-10-10T12:00:00');
  assert.equal(Core.plannedReminderDue(plan, NOW, '2026-10-10T12:00:00'), null, 'already shown');
  assert.equal(Core.plannedReminderDue(task('old', { plannedDate: '2026-10-10', plannedTime: '09:00' }), NOW, undefined), null, 'more than two hours ago');
  assert.equal(Core.plannedReminderDue(task('later', { plannedDate: '2026-10-10', plannedTime: '13:00' }), NOW, undefined), null, 'not yet');
  const check = fn('checkReminders');
  assert.match(check, /const plannedFired = readPlannedFired\(\);/);
  assert.match(check, /Core\.plannedTimeReminders\(state\.settings\) \? state\.tasks\.map\(task => \(\{ task, moment: Core\.plannedReminderDue\(task, now, plannedFired\[task\.id\]\) \}\)\)\.filter\(item => item\.moment\) : \[\]/);
  assert.match(check, /writePlannedFired\(\{ \.\.\.plannedFired, \.\.\.Object\.fromEntries\(duePlanned\.map\(\(\{ task, moment \}\) => \[task\.id, moment\]\)\) \}\);/);
  assert.match(check, /\.\.\.duePlanned\.filter\(\(\{ task, moment \}\) => !shown\.has\(Core\.notificationKey\('task', task\.id, `planned:\$\{moment\}`\)\)\)\.map\(\(\{ task \}\) => task\.title\),/);
  assert.match(app, /const PLANNED_FIRED_KEY = 'dailoPlannedFired';/);
  assert.match(fn('reconcileNotifications'), /Core\.notificationPlan\(state, nowIso\(\), \{ logs: state\.habitLogCache \|\| \{\}, plannedFired: readPlannedFired\(\) \}\)/);
});

test('b) a journal notification reads "Dnevnik" / "Zapiši kako je prošao dan" and opens Dnevnik', () => {
  assert.match(fn('notificationBody'), /if \(item\.kind === 'journal'\) return tr\('Write down how the day went'\);/);
  assert.match(fn('reconcileNotifications'), /title: item\.kind === 'journal' \? tr\('Journal'\) : item\.title/);
  assert.match(fn('openNotificationTarget'), /if \(kind === 'journal'\) \{ navigate\('#journal'\); return; \}/);
});

test('a) the reminder sheet, new goals, habits and template reminders start at the default time', () => {
  const sheet = fn('openReminderPicker');
  assert.match(sheet, /const morning = Core\.defaultReminderTime\(state\.settings\);/);
  assert.match(sheet, /\[tr\('Day before at \{time\}', \{ time: morning \}\), \{ date: Core\.addDays\(task\.plannedDate, -1\), time: morning \}\]/);
  assert.match(sheet, /\[tr\('Tomorrow at \{time\}', \{ time: morning \}\), \{ date: Core\.addDays\(Core\.dateOnly\(\), 1\), time: morning \}\]/);
  assert.match(sheet, /time: current\?\.time \|\| task\.plannedTime \|\| morning \}/);
  assert.doesNotMatch(app, /'Day before at 9:00'|'Tomorrow morning'/);
  assert.equal((app.match(/onTargetDate: false, time: Core\.defaultReminderTime\(state\.settings\)/g) || []).length, 2, 'the two new goal drafts; loading keeps stored times');
  const habits = read('js/habits-ui.js');
  assert.match(habits, /times\.length \? times : \[ctx\.Core\.defaultReminderTime\(ctx\.state\.settings\)\]/);
  assert.match(habits, /if \(!sheet\.times\.length\) sheet\.times\.push\(ctx\.Core\.defaultReminderTime\(ctx\.state\.settings\)\)/);
  assert.match(read('js/templates-ui.js'), /kind === 'reminder' \? \{ time: ctx\.Core\.defaultReminderTime\(ctx\.state\.settings\)/);
});

function settingsHtml(settings, native = null) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, backupStatus: {}, weekStartsOn: 'monday', ...settings } }, esc: String,
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', release: Release, environmentInfo: () => ({}),
    notificationSettings: () => native,
  });
}

test('the three rows in Settings → Opšte apply at once', () => {
  const web = settingsHtml({});
  assert.match(web, /<label class="settings-label" for="default-reminder-time"><strong>Default reminder time<\/strong><span>Used when Dailo proposes a reminder: tomorrow, the day before, new habits and goals\.<\/span><\/label><select class="input" id="default-reminder-time">/);
  assert.match(web, /<option value="06:00">06:00<\/option>[\s\S]*<option value="09:00" selected>09:00<\/option>[\s\S]*<option value="21:00">21:00<\/option><\/select>/);
  assert.match(settingsHtml({ defaultReminderTime: '07:30' }), /<option value="07:30" selected>07:30<\/option>/);
  assert.match(web, /<label class="settings-label" for="planned-time-reminders"><strong>Reminder at the planned time<\/strong><span>A task with a planned time reminds you then, even without its own reminder\.<\/span><\/label><input id="planned-time-reminders" type="checkbox">/);
  assert.match(settingsHtml({ plannedTimeReminders: true }), /id="planned-time-reminders" type="checkbox" checked>/);
  assert.doesNotMatch(web, /journal-notifications/, 'the journal notification is a phone-app row');
  const phone = settingsHtml({ journalNotifications: true }, { permission: 'granted', exact: 'granted' });
  assert.match(phone, /id="journal-reminder-time">[\s\S]*?<\/select><\/div>\s*<div class="settings-row settings-sub"><label class="settings-label" for="journal-notifications"><strong>Journal on the phone too<\/strong><span>The notification arrives even when Dailo is closed\.<\/span><\/label><input id="journal-notifications" type="checkbox" checked><\/div>/);
  assert.match(settingsHtml({ journalReminderTime: null }, { permission: 'granted' }), /id="journal-notifications" type="checkbox" disabled>/);
  for (const handler of [
    /if \(event\.target\.id === 'default-reminder-time'\) \{ const value = Core\.normalizeTime\(event\.target\.value\); if \(value\) \{ state\.settings\.defaultReminderTime = value; saveAndRender\(\); \} return; \}/,
    /if \(event\.target\.id === 'planned-time-reminders'\) \{ state\.settings\.plannedTimeReminders = event\.target\.checked; saveAndRender\(\); return; \}/,
    /if \(event\.target\.id === 'journal-notifications'\) \{ state\.settings\.journalNotifications = event\.target\.checked; saveAndRender\(\); return; \}/,
  ]) assert.match(app, handler);
});

test('the Serbian text', () => {
  for (const [en, value] of [
    ['Day before at {time}', 'Dan pre u {time}'], ['Tomorrow at {time}', 'Sutra u {time}'],
    ['Default reminder time', 'Podrazumevano vreme podsetnika'], ['Used when Dailo proposes a reminder: tomorrow, the day before, new habits and goals.', 'Koristi se kad Dailo predlaže podsetnik: sutra, dan pre, nove navike i ciljevi.'],
    ['Reminder at the planned time', 'Podsetnik u planirano vreme'], ['A task with a planned time reminds you then, even without its own reminder.', 'Zadatak sa planiranim vremenom javi se tada i bez svog podsetnika.'],
    ['Journal on the phone too', 'Dnevnik i na telefonu'], ['The notification arrives even when Dailo is closed.', 'Obaveštenje stiže i kad je Dailo zatvoren.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(!sr.includes('"Day before at 9:00"') && !sr.includes('"Tomorrow morning"'), 'the fixed 9:00 labels are gone');
});

test('R18 is released as 2.0.0-alpha.41', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.41');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.41';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.41');
});
