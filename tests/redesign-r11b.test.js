// Redesign R11b: the repeat editor (S15, E7).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r11b-repeat-editor.md
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
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const SATURDAY = '2026-10-10';

function editor({ task = { id: 't', title: 'Bins', plannedDate: SATURDAY, recurrence: null }, today = SATURDAY } = {}) {
  const calls = [];
  const inputs = {};
  const ctx = {
    calls, inputs, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : today) }, esc, state: { tasks: [task] }, modalState: { type: 'task', taskId: task.id },
    popoverEl: {},
    $: selector => inputs[selector] || null,
    getTask: id => (id === task.id ? task : null),
    taskRecurrence: item => item?.recurrenceBaseline?.recurrence || item?.recurrence,
    parseLocalDate: value => { const [y, m, d] = String(value).split('-').map(Number); return new Date(y, m - 1, d, 12); },
    formatDate: value => `F:${value}`,
    cssEscape: value => String(value),
    openPopover: (anchor, html, meta) => calls.push(['open', meta.type]),
    refreshSheet: (html, focus) => calls.push(['refresh', focus]),
    closePopover: () => calls.push(['close']),
    setRecurrence: (type, id, rule) => calls.push(['set', type, id, plain(rule)]),
    renderModal: () => calls.push(['renderModal']),
  };
  vm.createContext(withI18n(ctx));
  const constants = app.match(/  const REPEAT_[\s\S]*?\n\n/)[0];
  // R11e split the editor into shared parts (body, state update, end check) for the new recurring-task window.
  vm.runInContext(`let repeatSheet = null;\n${constants}${['recurrenceLabel', 'repeatList', 'openRepeatPicker', 'repeatSource', 'repeatEditorState', 'repeatRuleFromSheet', 'repeatPresetOn', 'repeatEditorHtml', 'repeatSheetHtml', 'readRepeatInputs', 'repeatEditorUpdate', 'repeatFocusSelector', 'repeatEditorError', 'handleRepeatAction', 'applyRepeatSheet', 'recurrencePendingSiblings', 'recurrenceSkipTarget'].map(fn).join('\n')}\nthis.sheet = () => repeatSheet;`, ctx);
  ctx.open = () => { ctx.openRepeatPicker({}, { type: 'task', taskId: task.id }); return ctx.repeatSheetHtml(); };
  ctx.act = (action, data = {}) => { ctx.handleRepeatAction(action, { dataset: { popAction: action, ...data } }); return ctx.repeatSheetHtml(); };
  return ctx;
}

test('S15: the sentence for each rule (also on the task window row)', () => {
  const { recurrenceLabel: label } = editor();
  assert.equal(label(null), 'Does not repeat');
  assert.equal(label({ frequency: 'weekly', interval: 1, weekdays: [3, 6] }), 'On Wednesdays and on Saturdays');
  assert.equal(label({ frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] }), 'On Mondays, on Wednesdays and on Fridays');
  assert.equal(label({ frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }), 'On weekdays');
  assert.equal(label({ frequency: 'weekly', interval: 1, weekdays: [0, 6] }), 'On weekends');
  assert.equal(label({ frequency: 'weekly', interval: 1, weekdays: [0, 1] }), 'On Mondays and on Sundays', 'Monday first');
  assert.equal(label({ frequency: 'weekly', interval: 2, weekdays: [1, 5] }), 'Every 2 weeks, on Mondays and on Fridays');
  assert.equal(label({ frequency: 'weekly', interval: 1 }), 'Every week', 'a legacy rule keeps its wording');
  assert.equal(label({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 10 }), 'Every month on day 10');
  assert.equal(label({ frequency: 'monthly', interval: 3, monthMode: 'day', monthDay: 10 }), 'Every 3 months, on day 10');
  assert.equal(label({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 'last' }), 'Every month on the last day');
  assert.equal(label({ frequency: 'monthly', interval: 2, monthMode: 'day', monthDay: 'last' }), 'Every 2 months, on the last day');
  assert.equal(label({ frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 1, weekday: 1 }), 'The first Monday of every month');
  assert.equal(label({ frequency: 'monthly', interval: 2, monthMode: 'weekday', weekOfMonth: 'last', weekday: 5 }), 'Every 2 months, the last Friday');
  assert.equal(label({ frequency: 'monthly', interval: 1 }), 'Every month');
  assert.equal(label({ frequency: 'yearly', interval: 1 }), 'Every year');
  assert.equal(label({ frequency: 'daily', interval: 1, endType: 'date', endDate: '2026-12-31' }), 'Every day · until F:2026-12-31');
  assert.equal(label({ frequency: 'daily', interval: 2, endType: 'afterOccurrences', endAfterOccurrences: 10 }), 'Every 2 days · 10 times');
  for (const line of [
    '"on Wednesdays": "sredom"', '"on Saturdays": "subotom"', '"on weekdays": "radnim danima"', '"on weekends": "vikendom"', '"{list} and {last}": "{list} i {last}"',
    '"Every {count} weeks, {days}": { one: "Na svaku {count} nedelju, {days}", few: "Na svake {count} nedelje, {days}", other: "Na svakih {count} nedelja, {days}" }',
    '"Every month on day {day}": "Svakog {day}. u mesecu"', '"Every month on the last day": "Svakog poslednjeg dana u mesecu"',
    '"Every {count} months, on day {day}": { one: "Na svaki {count} mesec, {day}. u mesecu", few: "Na svaka {count} meseca, {day}. u mesecu", other: "Na svakih {count} meseci, {day}. u mesecu" }',
    '"the first Monday": "prvog ponedeljka"', '"the last Saturday": "poslednje subote"', '"{which} of every month": "{which} u mesecu"',
    '"until {date}": "do {date}"', '"{count} times": { one: "{count} put", few: "{count} puta", other: "{count} puta" }',
  ]) assert.ok(sr.includes(line), line);
});

test('S15: the editor sheet for a task without a rule starts weekly on the start day', () => {
  const ctx = editor();
  const html = ctx.open();
  assert.deepEqual(ctx.calls[0], ['open', 'repeat']);
  assert.match(html, /^<div class="popover-title">Repeat<\/div><p class="sheet-subtitle">Bins<\/p><div class="sheet-chips">/);
  assert.deepEqual([...html.matchAll(/data-pop-action="repeat-preset" data-preset="(\d)" aria-pressed="(\w+)">([^<]+)</g)].map(match => [match[3], match[2]]), [['Every day', 'false'], ['Every week', 'true'], ['Every month', 'false'], ['Every 3 months', 'false'], ['Every year', 'false']]);
  assert.match(html, /<div class="view-tabs habit-window-seg repeat-frequency" role="group" aria-label="Frequency">/);
  assert.deepEqual([...html.matchAll(/data-pop-action="repeat-frequency" data-value="(\w+)" aria-pressed="(\w+)">([^<]+)</g)].map(match => [match[3], match[2]]), [['Day by day', 'false'], ['Weekly', 'true'], ['Monthly', 'false'], ['Yearly', 'false']]);
  assert.match(html, /<div class="sheet-field habit-stepper-field"><span>Interval<\/span><span class="habit-stepper"><button class="btn-icon" type="button" data-pop-action="repeat-step" data-step="-1" disabled aria-label="Decrease">[\s\S]*?<span class="habit-stepper-value" aria-live="polite">1<\/span>[\s\S]*?<span class="repeat-unit">week<\/span><\/span><\/div>/);
  assert.match(html, /<h3 class="sheet-group-title">Days<\/h3><div class="habit-weekdays">/);
  assert.deepEqual([...html.matchAll(/data-pop-action="repeat-day" data-day="(\d)" aria-pressed="(\w+)">([^<]+)</g)].map(match => `${match[3]}${match[2] === 'true' ? '*' : ''}`), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat*', 'Sun']);
  assert.match(html, /<p class="sheet-summary" data-repeat-summary>On Saturdays<\/p><p class="sheet-note">Next times: Sat, Oct 10 · Sat, Oct 17 · Sat, Oct 24<\/p>/);
  assert.match(html, /<h3 class="sheet-group-title">End<\/h3><div class="sheet-card" role="radiogroup" aria-label="End">/);
  assert.deepEqual([...html.matchAll(/role="radio" aria-checked="(\w+)" data-pop-action="repeat-end" data-value="(\w+)">[\s\S]*?<span class="sheet-option-label">([^<]+)</g)].map(match => [match[3], match[1]]), [['Never', 'true'], ['On date', 'false'], ['After a number of times', 'false']]);
  assert.doesNotMatch(html, /repeat-end-date|repeat-end-count|pause-recurrence|This repeat/);
  assert.match(html, /<div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="repeat-clear">Does not repeat<\/button><button class="btn btn-primary" type="button" data-pop-action="repeat-apply">Apply<\/button><\/div>$/);
});

test('S15: monthly by day or weekday, yearly, the end fields and the controls of a repeating task', () => {
  const ctx = editor();
  ctx.open();
  let html = ctx.act('repeat-frequency', { value: 'monthly' });
  assert.match(html, /role="radio" aria-checked="true" data-pop-action="repeat-month-mode" data-value="day">[\s\S]*?<span class="sheet-option-label">Day of the month<\/span><span class="sheet-option-value">10\.<\/span>/);
  assert.match(html, /role="radio" aria-checked="false" data-pop-action="repeat-month-mode" data-value="weekday">[\s\S]*?<span class="sheet-option-label">Day of the week<\/span><span class="sheet-option-value">the second Saturday<\/span>/);
  assert.equal([...html.matchAll(/data-pop-action="repeat-month-day" data-value="\d+"/g)].length, 31);
  assert.match(html, /<div class="repeat-month-days">[\s\S]*?class="sheet-calendar-day is-selected" type="button" data-pop-action="repeat-month-day" data-value="10" aria-pressed="true">10<\/button>[\s\S]*?<button class="quick-chip repeat-last-day" type="button" data-pop-action="repeat-month-day" data-value="last" aria-pressed="false">Last day<\/button><\/div>/);
  assert.match(html, /data-repeat-summary>Every month on day 10<\/p><p class="sheet-note">Next times: Sat, Oct 10 · Tue, Nov 10 · Thu, Dec 10<\/p>/);
  html = ctx.act('repeat-month-day', { value: '31' });
  assert.match(html, /<p class="sheet-note">In shorter months it falls on the last day\.<\/p>/);
  html = ctx.act('repeat-month-mode', { value: 'weekday' });
  assert.doesNotMatch(html, /repeat-month-days/);
  assert.deepEqual([...html.matchAll(/data-pop-action="repeat-nth" data-value="(\w+)" aria-pressed="(\w+)">([^<]+)</g)].map(match => `${match[3]}${match[2] === 'true' ? '*' : ''}`), ['First', 'Second*', 'Third', 'Fourth', 'Last']);
  assert.match(html, /data-pop-action="repeat-nth-day" data-day="6" aria-pressed="true">Sat</);
  ctx.act('repeat-nth', { value: 'last' });
  html = ctx.act('repeat-nth-day', { day: '5' });
  assert.match(html, /data-repeat-summary>The last Friday of every month<\/p><p class="sheet-note">Next times: Fri, Oct 30 · Fri, Nov 27 · Fri, Dec 25<\/p>/);
  html = ctx.act('repeat-frequency', { value: 'yearly' });
  assert.match(html, /<p class="sheet-note">The date is the day of the first time: F:2026-10-10\.<\/p>/);
  assert.match(html, /<span class="repeat-unit">year<\/span>/);
  html = ctx.act('repeat-end', { value: 'date' });
  assert.match(html, /<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"><\/i><span>End date<\/span><input id="repeat-end-date" class="input" type="date" min="2026-10-10" value="2027-01-08"><\/label>/);
  html = ctx.act('repeat-end', { value: 'afterOccurrences' });
  assert.match(html, /<label class="sheet-field"><i class="ph ph-hash" aria-hidden="true"><\/i><span>Number of times<\/span><input id="repeat-end-count" class="input" type="number" min="1" step="1" value="10"><\/label>/);

  const repeating = editor({ task: { id: 'r', title: 'Pay rent', plannedDate: '2026-10-01', recurrence: { frequency: 'monthly', interval: 1, status: 'active', endType: 'never', occurrencesCreated: 2, seriesId: 'r' } } });
  html = repeating.open();
  assert.match(html, /data-pop-action="repeat-preset" data-preset="2" aria-pressed="true">Every month</, 'a legacy monthly rule opens on the start day');
  assert.match(html, /data-repeat-summary>Every month on day 1<\/p><p class="sheet-note">Next times: Sun, Nov 1 · Tue, Dec 1 · Fri, Jan 1<\/p>/, 'the next dates start today');
  // R11c (S14) orders the controls skip, pause, end and adds a line under each (tests/redesign-r11c.test.js).
  assert.match(html, /<h3 class="sheet-group-title">This repeat<\/h3>[\s\S]*data-pop-action="skip-recurrence" data-task-id="r" data-target-type="task">[\s\S]*data-pop-action="pause-recurrence"[\s\S]*data-pop-action="end-recurrence"/);
  assert.match(html, /<div class="sheet-footer"><span><\/span><button class="btn btn-primary" type="button" data-pop-action="repeat-apply">Apply<\/button><\/div>$/);
});

test('S15: the actions, applying the R11a rule, an unchanged rule and a bad end', () => {
  let ctx = editor();
  ctx.open();
  ctx.act('repeat-day', { day: '3' });
  ctx.act('repeat-day', { day: '6' });
  assert.deepEqual(plain(ctx.sheet().weekdays), [3], 'removing a day');
  ctx.act('repeat-day', { day: '3' });
  assert.deepEqual(plain(ctx.sheet().weekdays), [3], 'the last day stays');
  ctx.act('repeat-day', { day: '6' });
  ctx.act('repeat-step', { step: '1' });
  assert.equal(ctx.sheet().interval, 2);
  assert.deepEqual(ctx.calls.at(-1), ['refresh', '[data-pop-action="repeat-step"][data-step="1"]']);
  ctx.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['set', 'task', 't', { frequency: 'weekly', interval: 2, weekdays: [3, 6], endType: 'never', endDate: null, endAfterOccurrences: null }]);

  ctx = editor();
  ctx.open();
  ctx.act('repeat-preset', { preset: '3' });
  assert.deepEqual(plain(ctx.repeatRuleFromSheet(ctx.sheet())), { frequency: 'monthly', interval: 3, monthMode: 'day', monthDay: 10, endType: 'never', endDate: null, endAfterOccurrences: null });
  ctx.act('repeat-frequency', { value: 'daily' });
  assert.equal(ctx.sheet().interval, 1, 'a frequency change starts from 1');
  ctx.act('repeat-end', { value: 'date' });
  ctx.inputs['#repeat-end-date'] = { value: '' };
  ctx.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.equal(ctx.sheet().error, 'Choose a valid end date or number of times.');
  assert.deepEqual(ctx.calls.at(-1), ['refresh', '#repeat-end-date']);
  assert.match(ctx.repeatSheetHtml(), /<p class="validation" role="alert">Choose a valid end date or number of times\.<\/p>/);
  ctx.inputs['#repeat-end-date'] = { value: '2026-12-31' };
  ctx.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['set', 'task', 't', { frequency: 'daily', interval: 1, endType: 'date', endDate: '2026-12-31', endAfterOccurrences: null }]);

  ctx = editor();
  ctx.open();
  ctx.handleRepeatAction('repeat-clear', { dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['close'], '"Ne ponavlja se" on a task without a rule only closes');

  const legacy = editor({ task: { id: 'r', title: 'Pay rent', plannedDate: '2026-10-01', recurrence: { frequency: 'monthly', interval: 1, status: 'active', endType: 'never', occurrencesCreated: 0, seriesId: 'r' } } });
  legacy.open();
  legacy.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.deepEqual(legacy.calls.at(-1), ['close'], 'an unchanged legacy rule is not rewritten');
});

test('the draft target (Quick Add) applies and clears on the draft', () => {
  const ctx = editor();
  ctx.modalState = { type: 'quick', draft: { title: 'Draft', plannedDate: null, recurrence: null } };
  ctx.openRepeatPicker({}, { type: 'quick' });
  assert.match(ctx.repeatSheetHtml(), /data-repeat-summary>On Saturdays</, 'without a date the start is today');
  ctx.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['set', 'quick', null, { frequency: 'weekly', interval: 1, weekdays: [6], endType: 'never', endDate: null, endAfterOccurrences: null }]);
  ctx.openRepeatPicker({}, { type: 'quick' });
  ctx.handleRepeatAction('repeat-clear', { dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['set', 'quick', null, null]);
});

test('Core.upcomingRecurrenceDates skips days before "from" but counts them toward the end', () => {
  const rule = { frequency: 'weekly', interval: 1, weekdays: [6] };
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-03', rule, 2, '2026-10-10')), ['2026-10-10', '2026-10-17']);
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-03', { ...rule, endType: 'afterOccurrences', endAfterOccurrences: 3 }, 3, '2026-10-10')), ['2026-10-10', '2026-10-17']);
  assert.deepEqual(plain(Core.upcomingRecurrenceDates('2026-10-03', { ...rule, endType: 'date', endDate: '2026-10-09' }, 3, '2026-10-10')), []);
});

test('the old repeat popover is gone and the editor is wired', () => {
  assert.doesNotMatch(app, /function showCustomRepeat\(|'show-custom-repeat'|'custom-repeat-apply'|'custom-repeat-cancel'|action === 'set-repeat'|repeat-custom-row/);
  assert.match(fn('handlePopoverAction'), /if \(action\?\.startsWith\('repeat-'\) && handleRepeatAction\(action, button\)\) return;/);
  assert.match(fn('closePopover'), /repeatSheet = null;/);
  assert.match(read('js/tasks-ui.js'), /row\('task-repeat-picker', 'ph-arrows-clockwise', tr\('Repeat'\), task\.recurrence \? esc\(recurrenceLabel\(task\.recurrence\)\) : ''\)/);
});

test('the R11b layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R11b'));
  assert.ok(layer.length > 20, 'R11b layer');
  for (const selector of ['.repeat-frequency', '.repeat-unit', '.repeat-month-days', '.repeat-last-day']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Day by day', 'Dnevno'], ['Interval', 'Razmak'], ['Days', 'Dani'], ['Every 3 months', 'Na 3 meseca'], ['Day of the month', 'Dan u mesecu'], ['Day of the week', 'Dan u nedelji'], ['Last day', 'Poslednji dan'], ['After a number of times', 'Posle broja ponavljanja'], ['No more repeats.', 'Nema više ponavljanja.'], ['Next times: {dates}', 'Sledeći put: {dates}'], ['This repeat', 'Ovo ponavljanje']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R11b shipped as 2.0.0-alpha.27 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 27);
});
