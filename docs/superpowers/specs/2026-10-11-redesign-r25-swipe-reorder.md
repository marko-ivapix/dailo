# Redesign R25 — swipe left for a date, reorder by touch (design)

**Date:** 2026-10-11 · **Status:** additions D and E of the second design pass, which the user approved with "moze sve" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.50`.

## D — Swipe left to plan

The existing swipe on a task row (phones, ≤ 700 px, touch) now works both ways:

- **To the right (green):** past 96 px it completes the task, as before.
- **To the left (blue):** past 96 px it opens the plan date sheet (`openPlanPicker`) with its Danas / Sutra / Sledeće nedelje chips and the month.

In both directions a light tick (R23) marks the point where releasing acts. A shorter swipe does nothing. Done tasks do not swipe.

## E — Reorder by touch

- **Before:** reordering "Planirano danas", Inbox and a project's tasks used only the browser's drag, which works with a mouse but not reliably on a phone.
- **The gesture:**
  - **Hold:** hold a row for 350 ms. The row lifts (`.is-touch-dragging`) with a tick.
  - **Drag:** drag it up or down. The row under the finger in the same list is marked as the target.
  - **Release:** releasing moves the row there through the existing `reorderTasks`, which updates the same order fields as the mouse drag.
- **While holding:**
  - **Moving earlier:** moving more than 8 px before the hold ends cancels it, so scrolling and swiping work as before.
  - **While a row is lifted:**
    - the page does not scroll (a non-passive `touchmove`);
    - the long-press menu and the browser's own drag are blocked;
    - rows cannot be selected as text on touch screens.
- **Lists:** a row of another list is never a target. Calendar and subtask dragging are unchanged.

## Data

Nothing changes in the data. The order fields are those the mouse drag already writes (`todayOrder`, `inboxOrder`, `projectOrder`).

## Tests (written first)

`tests/redesign-r25.test.js` drives the real handlers with fake rows and timers:

- the left swipe opens the plan sheet with a tick;
- the right swipe completes;
- a short swipe does nothing;
- a hold and drag reorders within the list;
- an early move cancels;
- another list is not a target;
- the listeners, the blocked native drag and long-press menu, and the CSS;
- the version `2.0.0-alpha.50`.

## Manual checks

On a phone:

- the left swipe opens the sheet;
- the hold-and-drag feels right, with no accidental scroll or text selection.
