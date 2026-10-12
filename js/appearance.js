// R39: the device's theme and text size are applied before the stylesheet paints, so a light theme does not flash
// dark first. app.js applies the same choices when they change (applyTheme, applyTextSize).
(function () {
  'use strict';
  let theme = null;
  let size = null;
  try { theme = localStorage.getItem('dailoTheme'); size = localStorage.getItem('dailoTextSize'); } catch (_) { /* the defaults */ }
  const root = document.documentElement;
  if (theme === 'light' || theme === 'system') {
    root.dataset.theme = theme;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme === 'light' ? 'light' : 'dark light');
  }
  if (['small', 'large', 'larger'].includes(size)) root.dataset.textSize = size;
})();
