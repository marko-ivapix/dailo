# Redesign R22a — back links, narrow phones, touch targets (design)

**Date:** 2026-10-11 · **Status:** fixes 7, 8, 9 and 11 of the second design audit, which the user approved with "moze sve". R22 ships in three parts: R22a (this), R22b (one look for the controls) and R22c (accessibility, wording and leftovers) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.45`.

## What changes

1. **Back links (7).**
   - **The bug:** before, only the project screen had a back link, "‹ Zadaci", even when it was opened from an area or Pretraga. Tags, areas and saved views had none, which is a dead end in the phone app.
   - **The trail:** the app keeps the screens a detail screen was opened from (`screenTrail`, at most 20). A bottom-bar tab (Danas, Inbox, Zadaci, Kalendar, Još) starts it over, and going back pops it instead of adding a loop.
   - **The link:** `backLink(fallbackRoute, fallbackLabel)` names the previous screen ("‹ Danas", "‹ Posao"). Without a previous screen (an address opened directly) it names the parent:

     | Screen | Parent |
     | --- | --- |
     | A project or "Bez projekta" | Zadaci |
     | A tag | Oznake |
     | An area | Oblasti |
     | A saved view | Sačuvani prikazi |
2. **Narrow phones, 320–400 px (8).**
   - **Segments:** the window segments (Horizont, Ponavljanje, Rutina, Praćenje) split the width evenly and wrap a long word instead of scrolling the last choice out of view.
   - **The habit week table:** the name column is 64 px and the cells 32 px.
   - **The bottom bar:** its labels are 10 px and end with "…" instead of overflowing.
3. **Touch targets and the "+" (9).**
   - **44 px on a touch or narrow screen:** every icon button (sheet X, month arrows, steppers, Kalendar ‹ ›, ★, an area's "+", a group's ⋯) and the toast's "Poništi". Color swatches are 40 px.
   - **The habit cell:** it keeps its small ring inside a 36 px target (a `::before` ring).
   - **The "+":** the screen ends 136 px above the bottom, so the last row's check is never under the "+".
4. **The journal strip (11).** It opens on today; before, it started at the 1st, so today was off screen after about the 6th. It keeps its place when the screen redraws.

## Compatibility

- **Data:** unchanged.
- **Routes:** unchanged. The trail is memory only.
- **Older tests:** module tests stub `backLink`.

## Tests (written first)

`tests/redesign-r22a.test.js`:

- the trail and `backLink`: previous screen, pop, reset on a tab, the fallback;
- the five screens using it;
- the narrow and touch CSS;
- the habit cell ring;
- the bottom clearance;
- the journal strip;
- the version `2.0.0-alpha.45`.

`npm run smoke` adds: a project opened from Danas says "‹ Danas".
