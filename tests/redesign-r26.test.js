// Redesign R26: "Na današnji dan", the journal export and the journal lock (additions G, H, I).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r26-journal-extras.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const entry = (date, text, mood = null) => ({ id: Core.journalEntryId(date), date, text, mood, createdAt: `${date}T20:00:00.000Z`, updatedAt: `${date}T20:00:00.000Z` });

test('G: "Na današnji dan" finds the same day in earlier months and years, newest first', () => {
  const state = { journal: [entry('2026-10-11', 'today'), entry('2026-09-11', 'a month ago', 4), entry('2026-08-11', ''), entry('2026-07-11', 'three months'), entry('2025-10-11', 'a year ago', 5), entry('2024-10-11', 'two years'), entry('2026-09-12', 'other day'), entry('2026-11-11', 'future')] };
  const found = Core.journalOnThisDay(state, '2026-10-11');
  assert.deepEqual(found.map(item => [item.entry.date, item.months]), [['2026-09-11', 1], ['2026-07-11', 3], ['2025-10-11', 12], ['2024-10-11', 24]]);
  assert.equal(Core.journalOnThisDay(state, '2026-10-11', 2).length, 2);
  assert.deepEqual(Core.journalOnThisDay({ journal: [] }, '2026-10-11'), []);
  assert.deepEqual(Core.journalOnThisDay({}, '2026-10-11'), []);
});

function moduleCtx({ locked = false, available = true, journal = [], route = 'journal' } = {}) {
  const calls = [];
  let unlocked = !locked, enabled = locked;
  const ctx = {
    state: { journal, ui: {}, habitLogCache: {} }, calls,
    Core, esc, nowIso: () => '2026-10-11T18:00:00.000Z',
    formatDate: (date, style) => `${style || 'short'}:${date}`,
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}">${options?.actionHtml || ''}</header>`,
    render: () => calls.push(['render']), renderModal: () => calls.push(['renderModal']), saveState: () => calls.push(['save']),
    setModalState: value => { ctx.modalState = value; calls.push(['modal', value.type, value.date]); }, modalState: null, $: () => null,
    openPopover: (anchor, html) => calls.push(['popover', html]), closePopover: () => calls.push(['closePopover']), menuSheet: (title, body) => `<menu title="${title}">${body}</menu>`,
    setToastMessage: text => calls.push(['toast', text]),
    saveTextFile: (text, name, type) => { calls.push(['file', name, type]); ctx.exported = text; return Promise.resolve(); },
    journalLock: {
      available: async () => available, enabled: () => enabled, unlocked: () => unlocked,
      unlock: async () => { calls.push(['unlock']); unlocked = true; return true; },
      set: on => { enabled = on; calls.push(['lock', on]); },
    },
  };
  let module;
  runInNewContextWithI18n(read('js/journal-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } }, requestAnimationFrame: run => run(), localStorage: { getItem: () => null, setItem() {} } });
  return { ctx, module, calls, route };
}

test('G: Dnevnik shows "Na današnji dan" for the current month when there is something to show', () => {
  const { ctx, module } = moduleCtx({ journal: [entry('2026-09-11', 'Bilo je lepo', 4)] });
  ctx.Core = { ...Core, dateOnly: () => '2026-10-11' };
  const html = module.renderRoute({ type: 'journal' }, ctx);
  assert.match(html, /<h2 class="review-card-title journal-on-this-day-title">On this day<\/h2><div class="today-card journal-list journal-on-this-day"><button class="journal-row" type="button" data-action="open-journal" data-date="2026-09-11"><span class="journal-row-head"><strong>full:2026-09-11 · 1 month ago<\/strong>/);
  const none = moduleCtx({ journal: [] });
  none.ctx.Core = { ...Core, dateOnly: () => '2026-10-11' };
  assert.doesNotMatch(none.module.renderRoute({ type: 'journal' }, none.ctx), /On this day/);
});

test('H: the journal exports as text, newest first, with the date and mood of each entry', async () => {
  const { ctx, module, calls } = moduleCtx({ journal: [entry('2026-10-09', 'Prvi\nred'), entry('2026-10-10', '', 5), entry('2026-10-11', 'Danas', 3)] });
  ctx.Core = { ...Core, dateOnly: () => '2026-10-11' };
  await module.handleAction('journal-export', { target: { closest: () => ({ dataset: {} }) } }, ctx);
  assert.deepEqual(calls.find(call => call[0] === 'file'), ['file', 'dailo-dnevnik-2026-10-11.md', 'text/markdown;charset=utf-8']);
  assert.equal(ctx.exported, '# Journal\n\n## full:2026-10-11 · 😐 Okay\n\nDanas\n\n## full:2026-10-10 · 😄 Great\n\n## full:2026-10-09\n\nPrvi\nred\n');
  const empty = moduleCtx({ journal: [] });
  await empty.module.handleAction('journal-export', { target: { closest: () => ({ dataset: {} }) } }, empty.ctx);
  assert.deepEqual(empty.calls.at(-1), ['toast', 'The journal is empty']);
});

test('I: a locked journal shows the lock until it is opened; an entry asks first too', async () => {
  const { ctx, module, calls } = moduleCtx({ locked: true, journal: [entry('2026-10-10', 'Tajna')] });
  ctx.Core = { ...Core, dateOnly: () => '2026-10-11' };
  const html = module.renderRoute({ type: 'journal' }, ctx);
  assert.match(html, /<div class="empty-state journal-locked"><i class="ph ph-lock-simple" aria-hidden="true"><\/i><h3>The journal is locked<\/h3><p>Unlock with your fingerprint, face or phone PIN\.<\/p><button class="btn btn-primary" type="button" data-action="journal-unlock">Unlock<\/button><\/div>/);
  assert.doesNotMatch(html, /Tajna|journal-strip/, 'nothing of the journal shows');
  await module.handleAction('open-journal', { target: { closest: () => ({ dataset: { date: '2026-10-10' } }) } }, ctx);
  assert.deepEqual(calls.filter(call => ['unlock', 'modal'].includes(call[0])).map(call => call[0]), ['unlock', 'modal'], 'the entry opens after unlocking');
  await module.handleAction('journal-unlock', { target: { closest: () => ({ dataset: {} }) } }, ctx);
  assert.deepEqual(calls.at(-1), ['render']);
});

test('I: the Dnevnik menu exports, and turns the lock on or off where the phone can unlock', async () => {
  const { ctx, module, calls } = moduleCtx({ available: true });
  await module.handleAction('journal-screen-menu', { target: { closest: () => ({ dataset: {} }) } }, ctx);
  const menu = calls.find(call => call[0] === 'popover')[1];
  assert.match(menu, /data-pop-action="journal-export"/);
  assert.match(menu, /data-pop-action="journal-lock-on"/);
  await module.handleAction('journal-lock-on', { target: { closest: () => ({ dataset: { popAction: 'journal-lock-on' } }) } }, ctx);
  assert.deepEqual(calls.filter(call => ['unlock', 'lock', 'toast'].includes(call[0])).map(call => call[0]), ['unlock', 'lock', 'toast'], 'the lock is tried once before it is set');
  const web = moduleCtx({ available: false });
  await web.module.handleAction('journal-screen-menu', { target: { closest: () => ({ dataset: {} }) } }, web.ctx);
  assert.doesNotMatch(web.calls.find(call => call[0] === 'popover')[1], /journal-lock/, 'no lock without a phone that can unlock');
});

test('I: the platform unlocks with the biometric plugin; the web never does', async () => {
  const calls = [];
  const plugin = { checkBiometry: async () => ({ isAvailable: false, deviceIsSecure: true }), internalAuthenticate: async options => { calls.push(options); } };
  const native = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'BiometricAuthNative' ? plugin : {}) }, console });
  assert.equal(await native.security.available(), true, 'a phone PIN is enough');
  assert.equal(await native.security.unlock({ reason: 'Otključaj Dnevnik', title: 'Dnevnik', cancel: 'Otkaži' }), true);
  assert.deepEqual(calls[0], { reason: 'Otključaj Dnevnik', androidTitle: 'Dnevnik', cancelTitle: 'Otkaži', allowDeviceCredential: true, androidConfirmationRequired: false });
  plugin.internalAuthenticate = async () => { throw new Error('userCancel'); };
  assert.equal(await native.security.unlock({}), false);
  assert.equal(await Platform.security.available(), false);
  assert.equal(await Platform.security.unlock({}), false);
});

test('I: the lock is device-local, closes again in the background and hides the week\'s faces in the review', () => {
  assert.match(app, /const JOURNAL_LOCK_KEY = 'dailoJournalLock';/);
  assert.match(fn('lockJournalAgain'), /journalUnlocked = false;/);
  assert.match(fn('startPlatform'), /platform\.lifecycle\.onPause\(lockJournalAgain\);/);
  assert.match(fn('domainContext'), /\n      journalLock,\n/);
  assert.match(read('js/review-ui.js'), /if \(ctx\.journalLock\?\.enabled\(\) && !ctx\.journalLock\.unlocked\(\)\) return '';/);
  assert.match(read('ios/App/App/Info.plist'), /<key>NSFaceIDUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@aparajita/capacitor-biometric-auth'], '10.0.0');
  assert.match(read('android/capacitor.settings.gradle'), /include ':aparajita-capacitor-biometric-auth'/);
});

test('R26 shipped as 2.0.0-alpha.51 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 51);
});
