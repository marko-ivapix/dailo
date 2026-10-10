const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');
const calendar = fs.readFileSync(require.resolve('../js/calendar-ui.js'), 'utf8');

// Redesign R1 (G1, M4): six bottom destinations; "Još" is a screen instead of a sheet. Anytime and Projects live
// under Zadaci, and Search is the magnifier in every page header.
const moreRoutes = [
  ['upcoming', 'Upcoming'], ['areas', 'Areas'], ['tags', 'Tags'], ['notes', 'Notes'], ['resources', 'Resources'],
  ['cleaning', 'Cleaning'], ['templates', 'Templates'], ['saved-views', 'Saved Views'],
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

test('Calendar Week keeps visible day context on narrow viewports', () => {
  assert.match(calendar, /class="calendar-scroll"/);
  assert.match(calendar, /class="calendar-week"/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.calendar-scroll[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.calendar-week[\s\S]*?min-width/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.calendar-day-heading/);
});

test('stale-data notice covers both external writes and canonical removal', () => {
  assert.match(app, /staleDataNotice/);
  assert.match(app, /const validRemoval = event\.newValue === null/);
  assert.match(app, /data-action="refresh-stale-data"/);
});
