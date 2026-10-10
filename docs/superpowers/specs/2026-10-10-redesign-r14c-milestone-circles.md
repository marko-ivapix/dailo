# Redesign R14c — milestone circles on the right (design)

**Date:** 2026-10-10 · **Status:** the user's follow-up to R14b ("stavi i krugove kod etapa desno"); it amends GO5 of `2026-10-08-redesign-decisions.md` the way R14 and R14b amended T3 and T5 · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.37`.

## What changes

1. **The round check of a milestone moves to the far right.** This applies to the "Etape" card of the goal window (R9b).
   - **The row reads:**
     - the milestone's title;
     - under it, its date;
     - the circle last.
   - **The date** is the G6 due label for an open milestone ("Rok 15. okt", red when late). A done milestone shows the day it was done.
   - **Without a date,** the row is only the title and the circle.
2. **The layout:** the row is a flex line with a 44 px circle box, so it lines up with the task checkboxes and the habit circles.
3. **Unchanged:**
   - A tap on the circle completes the milestone or reopens it.
   - A tap on the title opens the milestone editor.
   - "+ Dodaj etapu" and the done style (struck through, gray) stay as they are.

The draft milestones in the new goal window (R9c) have no circle and stay as they are.

## Compatibility

- **Data:** unchanged.
- **Behavior:** unchanged. Only the order of the row's parts and the CSS change.

## Tests (written first)

`tests/redesign-r14c.test.js`:

- the row order (title and date, then the circle);
- the flex layout;
- the version `2.0.0-alpha.37`.

`tests/redesign-r9b.test.js` (GO5) is rewritten with an R14c note for the rendered rows.
