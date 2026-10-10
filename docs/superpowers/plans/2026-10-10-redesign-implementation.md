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
| R8 | **Habits:** Dan / Nedelja, week rings, Napredak, numeric value sheet; the new habit window and frequency sheet; habit details. Ships as R8a (the screen), R8b (the new habit window and the frequency sheet) and R8c (the habit details window). | H1–H7, N1–N6, S13 | none |
| R9 | **Goals:** list with summary and Horizont / Rok, goal rows, folded finished and paused goals, the goal window, the new goal window. Ships as R9a (the list), R9b (the goal window) and R9c (the new goal window and the floating "+"). | GO1–GO7 | none |
| R10 | **Smaller screens and settings:** Oblasti, one area, Beleške and Resursi, Oznake, Šabloni, Sačuvani prikazi, Završeni zadaci, Arhivirani projekti, Search window, Focus; Settings groups and removals. Ships as R10a (Oblasti and one area), R10b (Beleške and Resursi), R10c (Oznake), R10d (Šabloni and Sačuvani prikazi), R10e (Završeni zadaci and Arhivirani projekti), R10f (Pretraga and Fokus) and R10g (Settings and the retired sidebar). | S1–S3, S6–S12, M5, M6 | none |
| R11 | **Repeat editor and "Redovne obaveze":** the extended recurrence rule (weekdays, day of month or last day, nth weekday, yearly, end), the shared editor, the "only this / this and future" question only for date and repeat changes, recurring tasks screen | S4, S14, S15, E7 | **recurrence rule** (own spec). Ships as R11a (the rule in Core, backups and templates), R11b (the editor), R11c (the repeat controls and the narrower question), R11d (Redovne obaveze and its groups) and R11e (the "Nova redovna obaveza" window). |
| R12 | **Journal:** collection, screen, evening notice, reminder time, mood strip, weekly-review row, "+ Zadatak za sutra" | J1–J9 | **journal collection** (own spec). Ships as R12a (the collection and setting in Core, backups and sync), R12b (the Dnevnik screen and the entry window) and R12c (the evening notice and the reminder setting); the weekly-review row (J8) comes with R13. |
| R13 | **Weekly review:** one screen with the "Poslednjih 7 dana" chart and the journal row | S5, J8 | none |
| R14 | **The first phone review (2026-10-10):** search button in one header row, no weekly review notice on Today, due date under the title and the checkbox on the right, the "+" menu over a scrim, Inbox chips as pills, the task window opening without the keyboard and a bordered title field | T1, T3, T6, G2 (amended) | none |
| R14b | **Habit circles on the right** (the user's follow-up the same day): Today, the Navike Dan view and the habit details row | T5 (amended) | none |
| R14c | **Milestone circles on the right** (the user's next follow-up): the "Etape" card of the goal window | GO5 (amended) | none |
| R15 | **Još as tiles and the Nalog screen** (the user's request the same day): two-column tiles with the icon on top; "Nalog" next to "Podešavanja", opening `#account` with the account card moved out of Settings | M4, M5 (amended) | none |
| R16 | **A habit's start in its details** (the user's request the same day): "Početak" in Detalji navike, saved at once, with "Početak meseca" in the start sheet | S13 (added) | none |
| R17 | **Fixes from the design audit** (the user: "da, ispravi sve 1–12"): "Bez projekta" route, tile icons, the task title size, the install row in the phone app, the toast over "+", invisible touch buttons, the remaining left checks and right-side dates, the "›" arrows, the project header, empty states, the project window | T3, T5 (applied everywhere) | none |

## Test levels

- **Node:** unit and contract tests per step (structure and labels, never pixels).
- **`npm run smoke`:** extended per step with the step's main flow in jsdom.
- **The user's checks:** visual, touch and device acceptance on the phone and Mac. Recorded in the ledger only from the user's report.
