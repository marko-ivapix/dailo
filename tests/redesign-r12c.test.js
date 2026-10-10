// Redesign R12c: the evening journal notice on Today and its setting (J4, J6).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r12c-journal-notice.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = '2026-10-10';

function load(storage = new Map()) {
  let adapter;
  const localStorage = { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)) };
  runInNewContextWithI18n(read('js/journal-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run(), localStorage });
  return adapter;
}
function context({ time = '20:15', journal = [], settings = {} } = {}) {
  const calls = [];
  const ctx = {
    calls, esc, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) },
    state: { journal, tasks: [{ id: 't', isCompleted: true, completedAt: new Date(`${TODAY}T09:00:00`).toISOString() }], habits: [], habitLogCache: {}, settings, ui: {} },
    nowIso: () => new Date(`${TODAY}T${time}:00`).toISOString(),
    render: () => calls.push(['render']), setToastMessage: message => calls.push(['toast', message]),
  };
  return ctx;
}
const notice = (adapter, ctx) => adapter.renderRoute({ type: 'journal-notice' }, ctx) || '';

test('J4: from the reminder time on, while today has no entry, with the day so far', () => {
  const adapter = load();
  assert.equal(notice(adapter, context({ time: '19:59' })), '', 'not before 20:00 by default');
  assert.equal(notice(adapter, context({ time: '20:00' })), '<section class="weekly-review-notice journal-notice" data-journal-notice role="status" aria-label="Journal"><i class="ph ph-book-open weekly-review-notice-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>Write down how the day went</strong><span>Completed 1 task.</span></div><div class="backup-reminder-actions"><button class="btn btn-primary" type="button" data-action="open-journal">Write</button><button class="btn btn-ghost" type="button" data-action="journal-not-today">Not today</button></div></section>');
  assert.match(notice(adapter, context({ time: '19:10', settings: { journalReminderTime: '19:00' } })), /data-journal-notice/);
  assert.equal(notice(adapter, context({ time: '23:00', settings: { journalReminderTime: null } })), '', 'off');
  const stamp = '2026-10-10T18:00:00.000Z';
  assert.equal(notice(adapter, context({ journal: [{ id: 'journal_2026-10-10', date: TODAY, text: 'Done', mood: null, createdAt: stamp, updatedAt: stamp }] })), '');
  assert.equal(notice(adapter, context({ journal: [{ id: 'journal_2026-10-10', date: TODAY, text: '', mood: 3, createdAt: stamp, updatedAt: stamp }] })), '', 'a mood alone counts');
  assert.match(notice(adapter, context({ journal: [{ id: 'journal_2026-10-09', date: '2026-10-09', text: 'Yesterday', mood: null, createdAt: stamp, updatedAt: stamp }] })), /data-journal-notice/);
});

test('J4: "Ne danas" hides it until tomorrow, on this device only', () => {
  const storage = new Map();
  const adapter = load(storage), ctx = context();
  assert.equal(adapter.handleAction('journal-not-today', { target: { closest: () => ({ dataset: {} }) } }, ctx), true);
  assert.equal(storage.get('dailoJournalLater'), TODAY);
  assert.deepEqual(ctx.calls, [['render'], ['toast', 'The reminder comes back tomorrow evening']]);
  assert.equal(notice(adapter, context()), '');
  storage.set('dailoJournalLater', '2026-10-09');
  assert.match(notice(adapter, context()), /data-journal-notice/, 'yesterday\'s "Ne danas" no longer hides it');
});

test('J4: Today shows the notice after the weekly-review notice', () => {
  assert.match(app, /html \+= weeklyReviewNotice\(\);\n    html \+= callDomainHook\('renderRoute', \{ type: 'journal-notice' \}\) \|\| '';/);
});

test('J6: Settings → Opšte → "Podsetnik za dnevnik" applies at once', () => {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const render = settings => adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: { search: 'Ctrl/Cmd+K' }, backupStatus: {}, weekStartsOn: 'monday', ...settings } }, Core, esc,
    pageHeader: title => `<header>${title}</header>`, shortcutLabels: { search: 'Search' }, shortcutError: () => '', notificationButtonLabel: () => 'Enable',
    storagePersistence: () => ({ state: 'granted' }), release: { APP_VERSION: '2.0.0-alpha.33', REPORT_EMAIL: '', problemReportMailto: () => '' },
    environmentInfo: () => ({ standalone: false }), syncView: () => ({ configured: false }), notificationSettings: () => null,
  });
  const html = render({});
  assert.match(html, /<div class="settings-row"><label class="settings-label" for="journal-reminder-time"><strong>Journal reminder<\/strong><span>When “Write down how the day went” appears on Today\.<\/span><\/label><select class="input" id="journal-reminder-time"><option value="off">Off<\/option><option value="19:00">From 19:00<\/option><option value="20:00" selected>From 20:00<\/option><option value="21:00">From 21:00<\/option><option value="22:00">From 22:00<\/option><\/select><\/div>\n      <\/section>\n      <section class="settings-card" data-settings-data>/);
  assert.match(render({ journalReminderTime: null }), /<option value="off" selected>Off<\/option>/);
  assert.match(render({ journalReminderTime: '20:30' }), /<option value="20:00">From 20:00<\/option><option value="20:30" selected>From 20:30<\/option><option value="21:00">/, 'a synced time is shown');
  assert.match(app, /if \(event\.target\.id === 'journal-reminder-time'\) \{ const value = event\.target\.value; if \(value === 'off' \|\| Core\.normalizeTime\(value\) === value\) \{ state\.settings\.journalReminderTime = value === 'off' \? null : value; saveAndRender\(\); \} return; \}/);
});

test('the R12c layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R12c'));
  assert.ok(layer.length > 20, 'R12c layer');
  assert.ok(layer.includes('.journal-notice'));
  for (const [en, value] of [['Write down how the day went', 'Zapiši kako je prošao dan'], ['Write', 'Zapiši'], ['Not today', 'Ne danas'], ['The reminder comes back tomorrow evening', 'Podsetnik se vraća sutra uveče'], ['Journal reminder', 'Podsetnik za dnevnik'], ['Off', 'Isključeno'], ['From {time}', 'Od {time}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R12c is released as 2.0.0-alpha.33', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.33');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.33';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.33');
});
