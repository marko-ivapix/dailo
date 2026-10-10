# Redesign R10e — Završeni zadaci and Arhivirani projekti (design)

**Date:** 2026-10-10 · **Status:** implements decided rows of `2026-10-08-redesign-decisions.md` (final 2026-10-09) · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.23`.

R10 now ends with:

- **R10e:** Završeni zadaci and Arhivirani projekti (S9, S10, and M6's move of "Obriši završene zadatke");
- **R10f:** Pretraga and Fokus (S11, S12);
- **R10g:** Settings and the retired sidebar (M5, M6).

## What changes

1. **Završeni zadaci (S9).**
   - "Završeni zadaci" with "N zadataka".
   - **Chips:** the project chip ("Svi projekti ▾") opens a choice sheet, where archived projects read "(arhiviran)". The period chips are "Sve vreme", "7 dana" and "30 dana".
   - **Groups by completion day:** "Danas · 10. okt · 3", "Juče · 9. okt · 1", then the date and the count. The tasks show as Today rows.
   - **The round check restores a task** and offers "Poništi". This applies wherever a completed task is reopened.
   - **"Obriši završene zadatke"** sits at the bottom in red, with "Trajno briše sve završene zadatke i njihove priloge." It removes every completed task after the confirmation and offers Undo, as before (M6). It leaves Settings.
   - **The empty state** reads "Nijedan završen zadatak ne odgovara ovim filterima." and "Probaj drugi projekat ili period.".
2. **Arhivirani projekti (S10).**
   - "Arhivirani projekti" with "N arhiviranih projekata".
   - **One card.** A row has the color dot, the name and "Oblast · N otvorenih"; a tap opens the read-only project (R5). Each row has "Vrati".
   - **Restoring** a project here or from its menu offers "Poništi".
   - Deleting stays in the project menu only.
   - **The empty state** reads "Nema arhiviranih projekata." and "Arhivirani projekti ostaju ovde dok ih ne vratiš.".

## Removed

- The project and period selects of Završeni zadaci.
- The "Pogledaj / Vrati" button pair of archived projects.
- The "Obriši završene zadatke" row in Settings.

## Compatibility

- **Data:** unchanged. `ui.completedProjectFilter` and `ui.completedPeriod` keep their values.
- **Reopening** a task works as before: the next occurrence of a repeating task is not touched. The new Undo marks the task completed again with its earlier completion time.

## Tests (written first)

`tests/redesign-r10e.test.js`:

- the completed list, its chips, the project sheet, the groups, the empty state and the delete row;
- reopen with Undo;
- the archived list with "Vrati", restore with Undo and the empty state;
- Settings without the clear row;
- the version `2.0.0-alpha.23`.

`npm run smoke` adds: a task completed today → Još → Završeni zadaci → "7 dana" → the task's round check restores it → Poništi completes it again.
