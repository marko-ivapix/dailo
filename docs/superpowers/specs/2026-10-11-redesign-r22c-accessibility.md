# Redesign R22c — accessibility, wording and leftovers (design)

**Date:** 2026-10-11 · **Status:** fix 12 and the low items of the second design audit, which the user approved with "moze sve". This closes R22 · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.47`.

## What changes

1. **Accessibility.**
   - **Sheet names:** a sheet redrawn in place (`refreshSheet`) names itself by its new title (`labelSheet`). Before, `aria-labelledby` pointed at a title that no longer existed.
   - **Nested buttons:** the Inbox and "+ Danas" chips sit beside the row's button (`.task-main-wrap`), not inside the `role="button"` element.
   - **Color swatches:** each one says its color ("Boja: Plava", `colorName`) instead of one shared "Izaberi boju". This covers tags, areas, projects and the inline new tag or project form.
   - **Tag dots:** in Beleške and Resursi each dot has a name ("Oznaka: …") instead of a hover-only title.
   - **The note and resource window:** it has a heading ("Beleška" / "Resurs"), so it is no longer announced as "Dailo dijalog".
   - **Missed days:** in the habit week table and its legend they are clearly red.
   - **Focus after a redraw:** when the same window redraws (an area, a project, a goal, a saved view…), the focus returns to the control that had it instead of falling to the page.
2. **Wording.**
   - **Finishing a goal:** it is "Označi kao ostvaren" everywhere, including the goal menu and "Cilj je ostvaren".
   - **"Više opcija":** the new habit and goal windows use it too, instead of "Više".
   - **The ellipsis:** Serbian texts use "…" instead of "...".
   - **The Još tile:** it says "Završeni zadaci", like its screen.
3. **Leftovers.**
   - **The old `#projects` address:** it opens Zadaci → Projekti. The pre-redesign list is gone.
   - **Long page titles:** they wrap.
   - **The habit month chart:** its labels are 11 px.

## Compatibility

- **Data:** unchanged.
- **Older tests:** the ones that stub the context get `colorName`; markup assertions are rewritten with an R22c note.

## Tests (written first)

`tests/redesign-r22c.test.js`:

- `labelSheet`;
- the chips beside the row button;
- `colorName` and the named swatches, dots and heading;
- the missed color;
- the focus restore in `renderModal`;
- the wording;
- `#projects`;
- the title wrap and the chart text;
- the version `2.0.0-alpha.47`.
