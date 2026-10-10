# Redesign R9b — the goal window (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.17`.

## What changes

1. **A window like the task window (GO5).**
   - A goal opens as a tall sheet over the current screen: from the Goals list, the folds and every `goal/<id>` link (Today and Calendar deadlines, areas, saved views, the weekly review).
   - An old `#goal/<id>` address opens Ciljevi with the window on top.
   - The window has "Cilj" with ⋯ and X. The ⋯ menu holds Sačuvaj kao šablon, Istorija, Pauziraj / Nastavi, Arhiviraj / Vrati and Obriši.
2. **Title and area.** The title opens a small sheet to rename the goal. The area link below opens the area sheet, which applies at once.
3. **The progress card.**
   - The big percentage, the progress line ("14 od 20 zadataka") and the bar in its health color.
   - The health line: Na dobrom putu, U riziku, Kasni or Ostvareno, each with one sentence.
   - **A manual goal** has "Ažuriraj napredak": a sheet with quick steps (+5 / +10 / +25 %, or steps scaled to a numeric target), the current value and "Primeni". Each change goes into the goal history, as before.
   - **A linked goal** explains where its progress comes from.
4. **Etape · done / total.**
   - Round checks complete or reopen a milestone.
   - The title opens the milestone editor, which now also has "Obriši" (with confirmation and Undo).
   - The date shows in the G6 colors. "+ Dodaj etapu" sits at the end.
5. **What feeds the goal:**
   - **Linked tasks:** "Zadaci · N otvorenih", the open tasks as Today rows (checking them completes the task), three at first, then "Prikaži još N".
   - **Linked habits:** "Doprinos navika", with a bar per habit, its percentage and "4 / 10 Unosi".
6. **Planiranje:**
   - **Ciljni datum:** a sheet with Za mesec dana, Za 3 meseca and Kraj godine, a date field and the "U riziku" note. It has "Bez datuma" and "Primeni", and a change is recorded in the history.
   - **Horizont:** a choice that applies at once.
   - **Izvor napretka:** the source window. For a numeric goal it now also edits the target and the unit.
   - **Podsetnik:** the reminders window.
7. **Organizacija:**
   - **Oblast.**
   - **Povezano:** the links window, summarized as "N projekata · M zadataka · K navika".
8. **"Više opcija"** opens the ⋯ menu.
9. **The bottom button (GO6).**
   - "Označi kao ostvaren" stays gray until the goal reaches 100 %, then turns blue.
   - A finished goal has "Vrati kao aktivan"; an archived one has "Vrati cilj".
   - Completing closes the window with "Poništi".
10. **Nested windows return to the goal window when they close:** source, reminders, links, milestone and history.

## Removed

- The goal page: its health and contribution cards, the inline property editors, the status menu, the manual value field, the linked-work chips and the milestone, reminder and history sections.
- The app's inline goal property editor.

## Compatibility

- **Data:** unchanged.
- **Health:** the percentage and the rule are R9a's. The `data-goal-health` attribute keeps the old values: `on-track`, `at-risk`, `overdue`, `complete`.
- **Core:** `goalTaskSet` is now exported.
- **Old tests** that rendered the goal page now check the window, with an R9b note.

## Tests (written first)

`tests/redesign-r9b.test.js`:

- opening from a link, a list row and an old address;
- the header, title, area link, progress card and health line;
- the progress sheet;
- milestones, with toggle, edit and delete;
- linked tasks with "Prikaži još", and habit contributions;
- the Planiranje and Organizacija rows with their sheets (date, horizon, area, rename);
- the source window with target and unit;
- the menu, the bottom button states and the return of nested windows;
- the version `2.0.0-alpha.17`.

`npm run smoke` adds: Ciljevi → a goal → the window → Ciljni datum → Za mesec dana → Primeni → the date is set.
