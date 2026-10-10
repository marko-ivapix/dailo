const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');
const calendar = fs.readFileSync(require.resolve('../js/calendar-ui.js'), 'utf8');

// Redesign R1 (G1, M4): six bottom destinations; "Još" is a screen instead of a sheet. Anytime and Projects live
// under Zadaci, and Search is the magnifier in every page header. R7 (C9): Upcoming is the Calendar's Predstojeće.
const moreRoutes = [
  ['areas', 'Areas'], ['tags', 'Tags'], ['notes', 'Notes'], ['resources', 'Resources'],
  // R11d (S4, M4): Čišćenje is now "Redovne obaveze".
  ['cleaning', 'Recurring tasks'], ['templates', 'Templates'], ['saved-views', 'Saved Views'],
  ['completed', 'Completed'], ['archived', 'Archived Projects'], ['goals', 'Goals'], ['review', 'Weekly review'],
  ['settings', 'Settings']
];

test('mobile navigation has six destinations ending with Još', () => {
  const nav = html.match(/<nav id="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const route of ['today', 'inbox', 'tasks', 'calendar', 'habits', 'more']) assert.match(nav, new RegExp(`data-route="${route}"`));
  assert.match(nav, />Još<\//, 'the More item has a visible (Serbian) label');
  assert.match(css, /grid-template-columns:\s*repeat\(6,/);
});

test('the Još screen and Zadaci reach every secondary route', () => {
  const screens = app.slice(app.indexOf('  function moreRow('), app.indexOf('  function renderAnytime('));
  for (const [route, label] of moreRoutes) {
    assert.match(screens, new RegExp(`'${route}'`), route);
    assert.match(screens, new RegExp(`tr\\('${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`), label);
  }
  assert.match(screens, /tr\('Anytime'\)/);
  assert.match(screens, /tr\('Projects'\)/);
  assert.match(app, /data-action="open-search"/);
});

// Redesign R7 (C1, C3): the week is a strip of seven days that fits a phone without scrolling; the columns of
// cards appear only from 1024 px.
test('Calendar Week keeps visible day context on narrow viewports', () => {
  assert.match(calendar, /class="calendar-strip"/);
  assert.match(calendar, /class="calendar-strip-day\$\{classes\}"/);
  assert.match(css, /\.calendar-strip, \.calendar-month-grid \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@media \(min-width: 1024px\) \{[\s\S]*?\.calendar-cards \{ display: grid;/);
  assert.match(app, /route\.type === 'upcoming'\) content|BOTTOM_NAV_PARENT = \{[^}]*upcoming: 'calendar'/);
});

test('stale-data notice covers both external writes and canonical removal', () => {
  assert.match(app, /staleDataNotice/);
  assert.match(app, /const validRemoval = event\.newValue === null/);
  assert.match(app, /data-action="refresh-stale-data"/);
});
