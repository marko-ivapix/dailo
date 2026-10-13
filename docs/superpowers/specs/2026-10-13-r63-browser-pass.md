# R63 — fixes from a pass through the app in Chromium

**Date:** 2026-10-13 · **Status:** the user asked to test the app once R62 was done and fix what else turns up ("Kada završiš testiraj aplikaciju i vidi da li ima još nešto da se ispravi"). They allowed Chromium in the cloud ("Da, pokreni"). · **Release:** `2.0.0-alpha.90`. No data-model change.

## How the app was tested

The pass used Playwright with the preinstalled Chromium, against `python3 -m http.server`. The scripts stayed in the session's scratchpad and are not part of the repository.

- **Phone:** 390 × 844, touch, `isMobile`, `sr-Latn-RS`.
- **Wide screen:** 1366 × 860.
- **Every screen:** console errors, page errors and failed requests; sideways page scroll; elements outside the screen; visible English text that has a Serbian translation; small touch targets; buttons left with the browser's own look; a screenshot.
- **Every "+" window:** whether it opens with its entrance, fits the screen and keeps its main button reachable. Each chip was tapped, and the window had to redraw in place.
- **Flows:**
  - the task window, with each of its rows and sheets;
  - a new habit and its tap cycle (done → not done → empty);
  - the calendar views, Search and a new goal;
  - Podešavanja, Nalog and Nedeljni pregled.
- **Real touch gestures:** sent as CDP touch events, so `touch-action` and `pointercancel` behave as on a phone. Each gesture ran against R62 and against the commit before it (`e8b75b1`):
  - **Fixed by R62:** a quick swipe and a hold followed by a sideways move did nothing before R62 and work now (date sheet to the left, complete to the right).
  - **Working in both versions:** a hold followed by a move up reorders, and a vertical drag over the rows scrolls the page.

## What was found and fixed

1. **A window opened again had no entrance (an R62 regression).**
   - `closeModal` emptied `#modal-root` but kept `dataset.modalType`. Quick Add opened again on Inbox, Zadaci or Kalendar therefore counted as "the same window, redrawn" and appeared without its animation.
   - Now `closeModal` clears the type.
   - `renderModal` also counts a redraw as steady only while a `.modal-backdrop` is on screen.
2. **The habit chart cut "100%" to "00%".** The left margin of the chart grows from 30 to 42 units. `.habits-chart-svg` has `overflow: visible`, so a larger text size uses the card padding.
3. **A done subtask's tick drew over "Završi zadatak".** The tick has `z-index: 1`, and the sticky footer had none. `.task-window-footer` now has `z-index: 2`, like the sheet footers.
4. **Kalendar → Raspored, "Bez vremena":** the task titles were grey browser buttons that squeezed into three lines next to a wide time field. They are now plain titles (`.day-unscheduled-title` reset), and the time field keeps 136 px.
5. **Wide screen, Kalendar:** "Danas" was a grey browser button. It is now `btn btn-secondary`.
6. **Wide screen, the "+":** the icon stood above "Novi zadatak", and the text spilled out of the pill. This dates from R47a. The pill is now `inline-flex` on one line, with the label at body size.

## Seen and left as they are

- **"‹ Ciljevi" on Oblasti** (and similar) after jumping between screens by address: the back link names the previous screen, as R22 decided.
- **The empty-state mark** (a small square with a dot) is drawn by `.empty-state::before`; it is not a missing icon.
- **The sample data has no habits, goals or areas;** "Popuni primerima" adds them.

## Checks

- **Node:** `tests/browser-pass-r63.test.js`, written first; it failed 6/6. It covers:
  - the reopened window, and `closeModal` forgetting the type;
  - the chart margin;
  - the footer above the tick;
  - Raspored;
  - "Danas" and the wide "+";
  - the version.
- **Older tests updated (with comments):**
  - `tests/redesign-r7.test.js` and `tests/redesign-r47d.test.js`: the "Danas" markup;
  - `tests/phone-feel-r62.test.js`: the version is now "or later".
- **Chromium, after the fixes:**
  - every "+" window opens with its entrance, also the second time;
  - no button keeps the browser look;
  - the touch gestures still pass.
- **Manual-pending:** the same things on a real phone and in a wide desktop window, especially the swipe and hold gestures, the windows and the "+" pill.
