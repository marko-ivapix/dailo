# Redesign R9a — the Goals list (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.16`.

R9 ships in three parts:

- **R9a:** this list (GO1–GO4).
- **R9b:** the goal window (GO5, GO6).
- **R9c:** the new goal window and the floating "+" on this screen (GO7).

Until R9b, a goal still opens its current page.

## What changes

1. **Top (GO1).** "Ciljevi" with one summary line: "N aktivnih", then "· M u riziku" in amber and "· K kasni" in red when there are any. It replaces the "Puls ciljeva" dashboard and the Aktivni / Svi / Arhivirani / Po mesecima tabs.
2. **Grouping (GO2).** A "Horizont / Rok" switch (`ui.goalGroup`, default `horizon`, remembered on the device).
   - **Horizont** groups the active goals into Kratkoročno, Srednjoročno and Dugoročno, each with its icon and count.
   - **Rok** groups them by the month of the target date ("Oktobar 2026"), with "Bez datuma" last.
   - Empty groups are left out. Within a group, goals are sorted by target date (undated last), then by title.
3. **A goal row (GO3).**
   - The title and the percentage, then a thin bar.
   - Then a meta line with the progress and the date:
     - "14 od 20 zadataka";
     - "3 od 4 knjige";
     - "2 navike";
     - "Ručno" for a manual percentage.
   - The bar is green on track and red "Kasni" once the target date has passed.
   - It is amber "U riziku" when the target date is within seven days and the progress is below 75%.
   - The words appear only for those two states, next to the date. Otherwise the row shows the date or "Bez datuma".
   - A tap opens the goal.
4. **Folds (GO4).** At the bottom, as on the Habits screen:
   - "Ostvareni · N" with the completion date;
   - "Pauzirani · N" with "Nastavi";
   - "Arhivirani · N" with "Vrati".
5. **Empty.** Without goals, the empty state offers "Novi cilj".

## Removed

- The dashboard (average, horizon bars, spotlight cards).
- The tabs and the horizon descriptions.
- The goal row's ⋯ on this screen. The menu stays in the goal page and window, and other screens keep their rows for now.

## Compatibility

- **Data:** unchanged.
- **Health** is computed from the shown percentage, so a linked goal at 100% is never "U riziku".
- **`ui.goalTab`** is no longer read.

## Tests (written first)

`tests/redesign-r9a.test.js`:

- the summary;
- the switch and both groupings;
- the row's percentage, bar tone, meta and date words;
- the folds with their actions;
- the empty state;
- the version `2.0.0-alpha.16`.

`npm run smoke` adds: Još → Ciljevi → Rok → a month group; a row opens the goal.
