const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/styles.css'), 'utf8');
const calendar = fs.readFileSync(require.resolve('../js/calendar-ui.js'), 'utf8');

const moreRoutes = [
  ['upcoming', 'Upcoming'], ['anytime', 'Anytime'], ['projects', 'Projects'],
  ['areas', 'Areas'], ['tags', 'Tags'], ['notes', 'Notes'], ['resources', 'Resources'],
  ['cleaning', 'Cleaning'], ['templates', 'Templates'], ['saved-views', 'Saved Views'],
  ['completed', 'Completed'], ['archived', 'Archived Projects'], ['search', 'Search'],
  ['settings', 'Settings']
];

test('mobile navigation keeps five primary destinations and adds More', () => {
  const nav = html.match(/<nav id="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const route of ['today', 'inbox', 'calendar', 'goals', 'habits']) assert.match(nav, new RegExp(`data-route="${route}"`));
  assert.match(nav, /id="mobile-more-trigger"/);
  assert.match(nav, />Još<\//, 'the More trigger has a visible (Serbian) label');
  assert.match(css, /grid-template-columns:\s*repeat\(6,/);
});

test('mobile More sheet lists every hidden route with dialog and selection hooks', () => {
  assert.match(app, /MOBILE_MORE_ROUTES/);
  assert.match(app, /id="mobile-more-sheet"/);
  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /data-action="close-mobile-more"/);
  for (const [route, label] of moreRoutes) {
    assert.match(app, new RegExp(`['"]${route}['"]`));
    assert.match(app, new RegExp(`['"]${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
});

test('mobile More sheet restores focus and tracks the current route', () => {
  assert.match(app, /mobileMoreReturnFocus/);
  assert.match(app, /const current = currentRoute\(\)/);
  assert.match(app, /data-mobile-more-route/);
  assert.match(app, /closeMobileMore\(\)/);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?closeMobileMore\(\)/);
  assert.match(css, /\.mobile-more-backdrop[\s\S]*?position:\s*fixed/);
});

test('More sheet is available wherever the mobile bottom navigation is visible', () => {
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.mobile-more-backdrop[\s\S]*?display:\s*flex/);
});

test('More sheet traps Tab focus within its dialog', () => {
  assert.match(app, /function trapMobileMoreFocus\(/);
  assert.match(app, /if \(mobileMoreOpen && event\.key === 'Tab'[\s\S]*?trapMobileMoreFocus\(event\)/);
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
