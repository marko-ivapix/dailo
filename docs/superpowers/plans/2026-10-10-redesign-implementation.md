# Redesign — implementation plan (R1–R13)

**Date:** 2026-10-10. **Source:** the final redesign decisions `docs/superpowers/specs/2026-10-08-redesign-decisions.md` (final since 2026-10-09) and the prototypes in `docs/design/prototipovi/`. The prototypes show how the app looks and behaves; the code structure is ours (the user, 2026-10-09). **Branch:** `feature/redesign` (from `feature/audit-fixes-m12`, which itself waits for review).

## Ground rules

- **Each step is a release.** A step is a versioned release (`2.0.0-alpha.N`) with:
  - its own section in `docs/superpowers/progress-redesign.md`;
  - failing tests written first;
  - `npm run verify` and `npm run smoke` green.
- **Compatibility constraints from `AGENTS.md`:**
  - Search scope, ranking and grouping stay unchanged (S11).
  - No bulk actions; "Dodaj sve u Danas" (Z2) is a single explicit action on a small, visible list, recorded as an approved decision.
  - Confirmation → Delete → Undo stays.
  - Data is never silently reset or migrated.
- **Data-model changes come in their own steps.** The repeat rule (S15) and the journal (J1–J9) each get a separate spec with backward-compatible validation, before any UI uses them.
- **Phone design everywhere.** The desktop layer K1–K12 is deferred (decision log, "Desktop"). Wide screens use the phone design in a centered column; keyboard shortcuts keep working.
- **What stays manual.** Visual and device acceptance is the user's. Node tests, static checks and jsdom checks never stand in for it.

## Steps

| Step | Scope | Decisions | Data change |
| --- | --- | --- | --- |
| R1 | **Shell and navigation:** bottom navigation at every width (Danas, Inbox, Zadaci, Kalendar, Navike, Još); the sidebar and the "Još" sheet give way to a "Još" screen with cards (Zakačeno, Planiranje, Biblioteka, Arhiva, Podešavanja with the sync state); a first "Zadaci" screen with the "Kad stignem / Projekti" switch; "Bilo kada" renamed "Kad stignem"; content in a centered column (≤ 760 px); the gray Inbox badge | G1, G2, M1, M4, Z1 (switch), Z3, I1 (badge), desktop deferral | none |
| R2 | **Today:** title, date and search icon; sections Zakasnelo, Planirano danas, Navike, Završeno; limits with "Prikaži još"; goal and milestone rows; compact habit rows with a round check and long press; the Focus, review, actions and capacity cards leave; conditional notices on top | T1–T7, T2a, G6 | none |
| R3 | **Task window and pickers:** groups Planiranje, Organizacija, Više opcija; the "Završi zadatak" button; pickers as bottom sheets with "Primeni" only for multi-part sheets | D1–D4, E1–E6, E8, E9 | none |
| R4 | **Quick Add** as a bottom sheet with the Smart Quick Add preview and the "Iz šablona" chip | Q1–Q3, S7 (chip) | none |
| R5 | **Zadaci:** suggestions card, Kad stignem grouped by project, Projekti grouped by area with counts and bars, the project screen | Z1–Z7, S10 (read-only archive) | none |
| R6 | **Inbox:** summary, type filters with counts, groups by capture time, quick buttons ("Razvrstano", "Oblast…"), "Razvrstaj redom" | I1–I6 | none |
| R7 | **Calendar:** Nedelja / Mesec / Predstojeće, day dots, the day list, "Lista / Raspored", "+" for the selected day; Upcoming moves here | C1–C9 | none |
| R8 | **Habits:** Dan / Nedelja, week rings, Napredak, numeric value sheet; the new habit window and frequency sheet; habit details | H1–H7, N1–N6, S13 | none |
| R9 | **Goals:** list with summary and Horizont / Rok, goal rows, folded finished and paused goals, the goal window, the new goal window | GO1–GO7 | none |
| R10 | **Smaller screens and settings:** Oblasti, one area, Beleške and Resursi, Oznake, Šabloni, Sačuvani prikazi, Završeni zadaci, Arhivirani projekti, Search window, Focus; Settings groups and removals | S1–S3, S6–S12, M5, M6 | none |
| R11 | **Repeat editor and "Redovne obaveze":** the extended recurrence rule (weekdays, day of month or last day, nth weekday, yearly, end), the shared editor, the "only this / this and future" question only for date and repeat changes, recurring tasks screen | S4, S14, S15, E7 | **recurrence rule** (own spec) |
| R12 | **Journal:** collection, screen, evening notice, reminder time, mood strip, weekly-review row, "+ Zadatak za sutra" | J1–J9 | **journal collection** (own spec) |
| R13 | **Weekly review:** one screen with the "Poslednjih 7 dana" chart and the journal row | S5, J8 | none |

## Test levels

- **Node:** unit and contract tests per step (structure and labels, never pixels).
- **`npm run smoke`:** extended per step with the step's main flow in jsdom.
- **The user's checks:** visual, touch and device acceptance on the phone and Mac. Recorded in the ledger only from the user's report.
