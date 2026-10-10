# Redesign R14b — habit circles on the right (design)

**Date:** 2026-10-10 · **Status:** the user's follow-up to R14 ("stavi i krugove kod navika desno"); it amends T5 of `2026-10-08-redesign-decisions.md` the same way R14 amended T3 for tasks · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.36`.

## What changes

1. **The round habit check moves to the far right.**
   - **Where:** every row built by `renderHabitTodayRow` in `js/habits-ui.js` — Today's "Navike", the Navike screen's Dan view and the row at the top of the habit details window.
   - **The row reads:** the name with its meta line; then the progress text, if the habit has one ("1,5 / 2 l", "2/4 nedeljno"); then the circle.
2. **The layout:** the row is a flex line like the R14 task row, so the circle lines up with the task checkboxes in the same column.
3. **Unchanged:**
   - A tap on the circle marks the habit done, or opens the value sheet for a numeric habit.
   - A long press on the circle and a tap on the name open the menu.
   - The labels and the filled progress ring stay the same.

Goal milestone rows in the goal window (R9b) keep their check on the left. The user asked only about habits.

## Compatibility

- **Data:** unchanged.
- **Behavior:** unchanged. Only the order of the row's parts and the CSS change.

## Tests (written first)

`tests/redesign-r14b.test.js`:

- the row order (name, progress text, circle) for a checkbox, a numeric and a weekly-target habit;
- the past-day row of the Dan view;
- the flex layout;
- the version `2.0.0-alpha.36`.

`npm run smoke` adds: Today's habit rows end with their circle.
